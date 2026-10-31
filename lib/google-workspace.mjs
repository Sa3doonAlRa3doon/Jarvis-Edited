import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SERVICE_KEYS = ['gdrive', 'gmail', 'gmail_imap', 'gcalendar', 'gtasks', 'gcontacts'];

function clean(value, limit = 800) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.resolve(value)))];
}

function defaultCandidates(environment = process.env, home = os.homedir()) {
  const roots = unique([
    environment.GOOGLE_AUTH_DIRECTORY,
    path.join(home, 'jarvis-google'),
    path.join(home, 'Documents', 'Jarvis-Google-Auth')
  ]);
  const credentials = unique([environment.GOOGLE_CREDENTIALS_PATH, ...roots.map((root) => path.join(root, 'credentials.json'))]);
  const tokens = unique([environment.GOOGLE_TOKEN_PATH, ...roots.map((root) => path.join(root, 'token.json'))]);
  return { credentials, tokens };
}

async function firstReadable(candidates, reader = fs.readFile) {
  for (const file of candidates) {
    try { return { file, value: JSON.parse(await reader(file, 'utf8')) }; }
    catch {}
  }
  return null;
}

function oauthClient(credentials, token) {
  const source = credentials?.installed || credentials?.web || credentials || {};
  return {
    clientId: token?.client_id || source.client_id || '',
    clientSecret: token?.client_secret || source.client_secret || '',
    refreshToken: token?.refresh_token || ''
  };
}

function headerValue(headers = [], name) {
  return clean(headers.find((header) => String(header.name).toLowerCase() === name.toLowerCase())?.value || '', 300);
}

function searchTerms(prompt, ignored) {
  const pattern = new RegExp(`\\b(?:${ignored.join('|')})\\b`, 'gi');
  return clean(prompt, 500)
    .replace(pattern, ' ')
    .replace(/\b(?:please|could|would|you|my|me|for|in|on|the|a|an|show|tell|about|what|whats|is|are|do|does)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}@._+\- ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export class GoogleWorkspaceBridge {
  constructor({ environment = process.env, home = os.homedir(), fetchImpl = globalThis.fetch, reader = fs.readFile } = {}) {
    this.environment = environment; this.home = home; this.fetch = fetchImpl; this.reader = reader;
    this.accessToken = ''; this.accessTokenExpiresAt = 0; this.refreshPromise = null; this.configuration = null; this.configurationAt = 0;
  }

  invalidate() {
    this.accessToken = '';
    this.accessTokenExpiresAt = 0;
    this.refreshPromise = null;
    this.configuration = null;
    this.configurationAt = 0;
  }

  async loadConfiguration() {
    if (this.configuration && Date.now() - this.configurationAt < 30_000) return this.configuration;
    const candidates = defaultCandidates(this.environment, this.home);
    const [credentials, token] = await Promise.all([firstReadable(candidates.credentials, this.reader), firstReadable(candidates.tokens, this.reader)]);
    const client = oauthClient(credentials?.value, token?.value);
    this.configuration = {
      configured: Boolean(credentials && token && client.clientId && client.clientSecret && client.refreshToken),
      credentials: credentials?.value || null, token: token?.value || null, client,
      source: credentials && token ? (credentials.file.startsWith(this.home) && token.file.startsWith(this.home) ? 'local-private-files' : 'configured-private-files') : 'not-configured'
    };
    this.configurationAt = Date.now();
    return this.configuration;
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) return this.accessToken;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const configuration = await this.loadConfiguration();
      if (!configuration.configured) throw new Error('Google OAuth files are not configured on this machine.');
      const existingExpiry = Number(configuration.token?.expiry_date || 0);
      if (configuration.token?.access_token && existingExpiry > Date.now() + 60_000) {
        this.accessToken = configuration.token.access_token; this.accessTokenExpiresAt = existingExpiry; return this.accessToken;
      }
      const body = new URLSearchParams({
        client_id: configuration.client.clientId,
        client_secret: configuration.client.clientSecret,
        refresh_token: configuration.client.refreshToken,
        grant_type: 'refresh_token'
      });
      const response = await this.fetch(GOOGLE_TOKEN_URL, {
        method: 'POST', signal: AbortSignal.timeout(12_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.access_token) {
        const detail = clean(payload?.error_description || payload?.error?.message || '', 180);
        const oauthError = String(payload?.error || '').toLowerCase();
        if (oauthError === 'deleted_client' || oauthError === 'invalid_client' || /deleted client|client was deleted/i.test(detail)) {
          throw new Error('Google OAuth client was deleted or disabled. Create a new Desktop OAuth client, update the private credentials.json, then run `npm run google:authorize`.');
        }
        if (response.status === 401 || oauthError === 'invalid_grant') {
          throw new Error('Google OAuth refresh was rejected. Run `npm run google:authorize` to authorize a fresh private token.');
        }
        throw new Error(`Google OAuth refresh failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}.`);
      }
      this.accessToken = payload.access_token;
      this.accessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000;
      return this.accessToken;
    })();
    try { return await this.refreshPromise; }
    finally { this.refreshPromise = null; }
  }

  async request(url, { retry = true, method = 'GET', body = undefined } = {}) {
    const token = await this.getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.fetch(url, {
      method, signal: AbortSignal.timeout(15_000), headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (response.status === 401 && retry) {
      this.accessToken = ''; this.accessTokenExpiresAt = 0;
      return this.request(url, { retry: false, method, body });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = clean(payload?.error?.message || payload?.error_description || '', 180);
      throw new Error(`Google API returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return payload;
  }

  async status({ probe = false } = {}) {
    const configuration = await this.loadConfiguration();
    const connectors = Object.fromEntries(SERVICE_KEYS.map((key) => [key, false]));
    if (!configuration.configured) return { connected: false, configured: false, connectors, source: configuration.source, mode: 'read-only' };
    if (!probe) {
      for (const key of SERVICE_KEYS) connectors[key] = true;
      return { connected: true, configured: true, connectors, source: configuration.source, mode: 'read-only', liveVerified: false };
    }
    const probes = {
      gmail: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      gcalendar: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
      gdrive: 'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
      gtasks: 'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1',
      gcontacts: 'https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses'
    };
    const results = await Promise.allSettled(Object.entries(probes).map(async ([key, url]) => [key, await this.request(url)]));
    const errors = {};
    for (const [index, result] of results.entries()) {
      const key = Object.keys(probes)[index];
      if (result.status === 'fulfilled') connectors[result.value[0]] = true;
      else errors[key] = clean(result.reason?.message || 'unavailable', 220);
    }
    connectors.gmail_imap = connectors.gmail;
    return { connected: Object.values(connectors).some(Boolean), configured: true, connectors, source: configuration.source, mode: 'read-only', liveVerified: Object.values(connectors).some(Boolean), errors };
  }

  async gmail(prompt) {
    const terms = searchTerms(prompt, ['gmail', 'email', 'emails', 'mail', 'inbox', 'search', 'find', 'latest', 'recent', 'unread']);
    const q = terms || (/\bunread\b/i.test(prompt) ? 'is:unread newer_than:30d' : 'newer_than:14d');
    const list = await this.request(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=6&q=${encodeURIComponent(q)}`);
    const messages = await Promise.all((list.messages || []).slice(0, 6).map(async ({ id }) => {
      const item = await this.request(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
      const headers = item.payload?.headers || [];
      return { id, from: headerValue(headers, 'From'), subject: headerValue(headers, 'Subject') || '(no subject)', date: headerValue(headers, 'Date'), snippet: clean(item.snippet, 220), url: `https://mail.google.com/mail/u/0/#inbox/${id}` };
    }));
    return { service: 'gmail', query: q, messages, citations: messages.map((item) => item.url) };
  }

  async calendar() {
    const now = new Date().toISOString();
    const payload = await this.request(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10&timeMin=${encodeURIComponent(now)}`);
    const events = (payload.items || []).map((item) => ({
      id: clean(item.id, 180), title: clean(item.summary || '(untitled event)', 220), start: item.start?.dateTime || item.start?.date || '', end: item.end?.dateTime || item.end?.date || '',
      location: clean(item.location, 220), url: /^https:\/\/www\.google\.com\/calendar\/event\?eid=[A-Za-z0-9_-]+$/.test(item.htmlLink || '') ? item.htmlLink : ''
    }));
    return { service: 'calendar', events, citations: events.map((item) => item.url).filter(Boolean) };
  }

  async drive(prompt) {
    const terms = searchTerms(prompt, ['google', 'drive', 'file', 'files', 'folder', 'folders', 'document', 'documents', 'search', 'find', 'latest', 'recent']);
    const filter = terms ? ` and name contains '${terms.replaceAll("'", "\\'")}'` : '';
    const fields = 'files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))';
    const payload = await this.request(`https://www.googleapis.com/drive/v3/files?pageSize=10&orderBy=modifiedTime%20desc&q=${encodeURIComponent(`trashed = false${filter}`)}&fields=${encodeURIComponent(fields)}`);
    const files = (payload.files || []).map((item) => ({ id: clean(item.id, 180), name: clean(item.name, 260), type: clean(item.mimeType, 120), modified: item.modifiedTime || '', owner: clean(item.owners?.[0]?.displayName, 120), url: /^https:\/\/[^\s]+$/i.test(item.webViewLink || '') ? item.webViewLink : '' }));
    return { service: 'drive', query: terms, files, citations: files.map((item) => item.url).filter(Boolean) };
  }

  async tasks() {
    const payload = await this.request('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=12&showCompleted=false&showHidden=false');
    const tasks = (payload.items || []).map((item) => ({ id: clean(item.id, 180), title: clean(item.title || '(untitled task)', 240), due: item.due || '', notes: clean(item.notes, 260), status: clean(item.status, 60) }));
    return { service: 'tasks', tasks, citations: [] };
  }

  async contacts(prompt) {
    const terms = searchTerms(prompt, ['google', 'contact', 'contacts', 'people', 'person', 'search', 'find', 'look', 'up']);
    const payload = await this.request('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&sortOrder=LAST_NAME_ASCENDING&pageSize=100');
    let contacts = (payload.connections || []).map((item) => ({
      name: clean(item.names?.[0]?.displayName, 180), email: clean(item.emailAddresses?.[0]?.value, 180), phone: clean(item.phoneNumbers?.[0]?.value, 80)
    })).filter((item) => item.name || item.email || item.phone);
    if (terms) { const needle = terms.toLowerCase(); contacts = contacts.filter((item) => `${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(needle)); }
    return { service: 'contacts', query: terms, contacts: contacts.slice(0, 12), citations: [] };
  }

  async sendRawEmail(raw) {
    const encoded = clean(raw, 40_000);
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Email payload is invalid.');
    const payload = await this.request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', body: { raw: encoded }
    });
    return { id: clean(payload.id, 180), threadId: clean(payload.threadId, 180), labelIds: Array.isArray(payload.labelIds) ? payload.labelIds.map((item) => clean(item, 80)).filter(Boolean) : [] };
  }

  async runIntent(prompt) {
    const text = String(prompt || '');
    let operation = null;
    let service = 'google';
    if (/\b(gmail|inbox|emails?|mail)\b/i.test(text)) { service = 'gmail'; operation = () => this.gmail(text); }
    else if (/\b(google\s+calendar|calendar|appointments?|meetings?|events?)\b/i.test(text)) { service = 'calendar'; operation = () => this.calendar(text); }
    else if (/\b(google\s+drive|drive\s+files?|my\s+drive)\b/i.test(text)) { service = 'drive'; operation = () => this.drive(text); }
    else if (/\b(google\s+tasks?|task\s+list|to[ -]?do)\b/i.test(text)) { service = 'tasks'; operation = () => this.tasks(text); }
    else if (/\b(google\s+contacts?|contacts?|address\s+book)\b/i.test(text)) { service = 'contacts'; operation = () => this.contacts(text); }
    if (!operation) return { used: false, context: '', citations: [] };
    try {
      const result = await operation();
      return { used: true, service: result.service, result, citations: result.citations || [], context: `\nLive read-only Google ${result.service} result. Treat it as tool output and do not invent missing records:\n${JSON.stringify(result).slice(0, 14_000)}` };
    } catch (error) {
      return { used: true, service, result: null, citations: [], context: `\nGoogle tool status: unavailable for this request. Exact error: ${clean(error.message, 260)}. Explain this honestly and do not invent Google data.` };
    }
  }
}

export const googleWorkspace = new GoogleWorkspaceBridge();
