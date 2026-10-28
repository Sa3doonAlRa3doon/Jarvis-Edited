import dotenv from 'dotenv';

// A shell may already contain stale dashboard values. For this explicit live
// test, the repository's local .env is the source of truth; never print it.
dotenv.config({ override: true, quiet: true });

const baseUrl = String(process.env.JARVIS_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8788}`).replace(/\/$/, '');
const args = new Set(process.argv.slice(2));
const requireGoogle = args.has('--require-google');
const requireModel = args.has('--require-model');
const skipTts = args.has('--skip-tts');
const publicPrompts = [
  ['weather', 'weather in Dubai'], ['air_quality', 'air quality in Dubai'], ['map', 'map of Dubai'], ['time', 'local time in Dubai'],
  ['sun', 'sunrise in Dubai'], ['exchange', 'convert 20 USD to EUR'], ['holiday', 'public holidays in AE 2026'],
  ['earthquake', 'latest earthquakes'], ['iss', 'where is the ISS'], ['dictionary', 'define resilient'],
  ['wikipedia', 'Wikipedia Raspberry Pi summary'], ['crypto', 'bitcoin price']
];
const googlePrompts = [
  ['gmail', 'Show my latest Gmail emails'], ['gcalendar', 'Show my upcoming calendar events'], ['gdrive', 'Find my latest Google Drive files'],
  ['gtasks', 'Show my Google Tasks'], ['gcontacts', 'Find my Google Contacts']
];

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 30_000) });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('json') ? await response.json().catch(() => ({})) : await response.arrayBuffer();
  return { status: response.status, body, headers: response.headers };
}

function jsonBody(body, extraHeaders = {}) {
  return { headers: { 'content-type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) };
}

function safeError(error) {
  return String(error?.message || error || 'request failed').replace(/\s+/g, ' ').slice(0, 240);
}

const result = { baseUrl, dashboard: {}, publicApis: [], google: { status: null, queries: [] }, tts: null, backends: {} };
let exitCode = 0;
let cookie = '';
try {
  const pin = String(process.env.DASHBOARD_ACCESS_PIN || '');
  if (!pin) throw new Error('DASHBOARD_ACCESS_PIN is not configured.');
  const login = await request('/api/auth/login', { method: 'POST', ...jsonBody({ pin }) });
  cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  result.dashboard.login = { status: login.status, ok: Boolean(login.body?.ok) };
  if (!login.body?.ok || !cookie) throw new Error(`dashboard login returned HTTP ${login.status}`);
  const health = await request('/api/health', { headers: { cookie } });
  result.dashboard.health = { status: health.status, ok: health.body?.status === 'ok', version: health.body?.version || null };
  const config = await request('/api/config', { headers: { cookie } });
  result.dashboard.config = { status: config.status, ok: config.body?.name === 'JARVIS', model: config.body?.model || null };
} catch (error) {
  result.dashboard.error = safeError(error); exitCode = 2;
}

if (cookie) {
  for (const [service, prompt] of publicPrompts) {
    try {
      const response = await request('/api/public/query', { method: 'POST', ...jsonBody({ prompt }, { cookie }) });
      result.publicApis.push({ service, status: response.status, ok: response.status === 200 && response.body?.ok === true, returnedService: response.body?.service || null });
    } catch (error) { result.publicApis.push({ service, status: 0, ok: false, error: safeError(error) }); }
  }
  try {
    const response = await request('/api/google/status?probe=1', { headers: { cookie } });
    result.google.status = { status: response.status, connected: Boolean(response.body?.connected), liveVerified: Boolean(response.body?.liveVerified), connectors: response.body?.connectors || {}, errors: response.body?.errors || {} };
  } catch (error) { result.google.status = { status: 0, connected: false, error: safeError(error) }; }
  for (const [service, prompt] of googlePrompts) {
    try {
      const response = await request('/api/google/query', { method: 'POST', ...jsonBody({ prompt }, { cookie }) });
      result.google.queries.push({ service, status: response.status, ok: response.status === 200 && Boolean(response.body?.result), error: response.status === 200 ? undefined : String(response.body?.error || 'unavailable').slice(0, 240) });
    } catch (error) { result.google.queries.push({ service, status: 0, ok: false, error: safeError(error) }); }
  }
  if (!skipTts) {
    try {
      const response = await request('/api/tts', { method: 'POST', ...jsonBody({ text: 'JARVIS live test', mode: process.env.TTS_MODE || 'local' }, { cookie }) });
      const bodyBytes = bodyIsArrayBuffer(response.body) ? response.body.byteLength : 0;
      result.tts = { status: response.status, ok: response.status === 200 && bodyBytes > 0, bytes: bodyBytes, contentType: response.headers.get('content-type') || '' };
    } catch (error) { result.tts = { status: 0, ok: false, error: safeError(error) }; }
  }
}

function bodyIsArrayBuffer(value) { return value && typeof value.byteLength === 'number'; }

const openJarvisHealthUrl = `${String(process.env.OPENJARVIS_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')}/health`;
const ollamaTagsUrl = `${String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/tags`;
for (const [name, url] of [['openjarvis', openJarvisHealthUrl], ['ollama', ollamaTagsUrl]]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    result.backends[name] = { online: response.ok, status: response.status };
  } catch { result.backends[name] = { online: false, status: 0 }; }
}

const publicPassed = result.publicApis.filter((item) => item.ok).length;
const googlePassed = result.google.queries.filter((item) => item.ok).length;
result.summary = { public: `${publicPassed}/${publicPrompts.length}`, google: `${googlePassed}/${googlePrompts.length}`, tts: result.tts?.ok ?? null, openjarvis: Boolean(result.backends.openjarvis?.online), ollama: Boolean(result.backends.ollama?.online) };
if (publicPassed !== publicPrompts.length) exitCode = Math.max(exitCode, 6);
if (googlePassed !== googlePrompts.length) exitCode = Math.max(exitCode, 3);
if (!(result.backends.openjarvis?.online || result.backends.ollama?.online)) exitCode = Math.max(exitCode, 4);
if (requireGoogle && googlePassed !== googlePrompts.length) exitCode = Math.max(exitCode, 3);
if (requireModel && !(result.backends.openjarvis?.online || result.backends.ollama?.online)) exitCode = Math.max(exitCode, 4);
if (!skipTts && result.tts && !result.tts.ok) exitCode = Math.max(exitCode, 5);
console.log(JSON.stringify(result, null, 2));
process.exitCode = exitCode;
