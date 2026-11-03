import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { GoogleWorkspaceBridge } from '../lib/google-workspace.mjs';

const FIXTURE_ROOT = path.join(path.parse(process.cwd()).root, 'jarvis-google-fixtures');
const CREDENTIALS_PATH = path.join(FIXTURE_ROOT, 'credentials.json');
const TOKEN_PATH = path.join(FIXTURE_ROOT, 'token.json');
const TEST_HOME = path.join(path.parse(process.cwd()).root, 'jarvis-test-home');

function credentialFiles() {
  return new Map([
    [CREDENTIALS_PATH, JSON.stringify({ installed: { client_id: 'client', client_secret: 'secret' } })],
    [TOKEN_PATH, JSON.stringify({ refresh_token: 'refresh' })]
  ]);
}

function credentialEnvironment() {
  return { GOOGLE_CREDENTIALS_PATH: CREDENTIALS_PATH, GOOGLE_TOKEN_PATH: TOKEN_PATH };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

test('keeps OAuth secrets server-side while reporting a configured read-only bridge', async () => {
  const files = credentialFiles();
  const bridge = new GoogleWorkspaceBridge({
    environment: credentialEnvironment(), home: TEST_HOME,
    reader: async (file) => { if (!files.has(file)) throw new Error('missing'); return files.get(file); }, fetchImpl: async () => response({ access_token: 'access', expires_in: 3600 })
  });
  const status = await bridge.status();
  assert.equal(status.connected, true);
  assert.equal(status.mode, 'read-only');
  assert.equal(status.credentials, undefined);
  assert.equal(status.token, undefined);
  assert.ok(Object.values(status.connectors).every(Boolean));
});

test('runs a Gmail intent with refreshed OAuth and bounded message metadata', async () => {
  const files = credentialFiles();
  const seen = [];
  const bridge = new GoogleWorkspaceBridge({
    environment: credentialEnvironment(), home: TEST_HOME,
    reader: async (file) => { if (!files.has(file)) throw new Error('missing'); return files.get(file); },
    fetchImpl: async (url, options = {}) => {
      seen.push({ url: String(url), authorization: options.headers?.Authorization || '' });
      if (String(url).includes('oauth2.googleapis.com')) return response({ access_token: 'access', expires_in: 3600 });
      if (String(url).includes('/messages?')) return response({ messages: [{ id: 'abc123' }] });
      if (String(url).includes('/messages/abc123')) return response({ snippet: 'Project update', payload: { headers: [{ name: 'Subject', value: 'Status' }, { name: 'From', value: 'Team' }, { name: 'Date', value: 'Today' }] } });
      return response({}, 404);
    }
  });
  const result = await bridge.runIntent('Show my latest Gmail emails');
  assert.equal(result.used, true);
  assert.equal(result.service, 'gmail');
  assert.equal(result.result.messages[0].subject, 'Status');
  assert.match(result.citations[0], /mail\.google\.com/);
  assert.equal(seen[1].authorization, 'Bearer access');
});

test('sends a Gmail raw message with OAuth POST and never exposes the token in the result', async () => {
  const files = credentialFiles();
  const seen = [];
  const bridge = new GoogleWorkspaceBridge({
    environment: credentialEnvironment(), home: TEST_HOME,
    reader: async (file) => { if (!files.has(file)) throw new Error('missing'); return files.get(file); },
    fetchImpl: async (url, options = {}) => {
      seen.push({ url: String(url), options });
      if (String(url).includes('oauth2.googleapis.com')) return response({ access_token: 'access', expires_in: 3600 });
      return response({ id: 'message-1', threadId: 'thread-1' });
    }
  });
  const result = await bridge.sendRawEmail('YWJj');
  assert.deepEqual(result, { id: 'message-1', threadId: 'thread-1', labelIds: [] });
  assert.equal(seen[1].options.method, 'POST');
  assert.equal(seen[1].options.headers.Authorization, 'Bearer access');
  assert.deepEqual(JSON.parse(seen[1].options.body), { raw: 'YWJj' });
  assert.equal(result.accessToken, undefined);
});

test('coalesces concurrent OAuth refreshes and names rejected Google probes', async () => {
  const files = credentialFiles();
  let refreshCalls = 0;
  const bridge = new GoogleWorkspaceBridge({
    environment: credentialEnvironment(), home: TEST_HOME,
    reader: async (file) => { if (!files.has(file)) throw new Error('missing'); return files.get(file); },
    fetchImpl: async (url) => {
      if (String(url).includes('oauth2.googleapis.com')) { refreshCalls += 1; return response({ error: 'invalid_grant', error_description: 'Bad Request' }, 401); }
      return response({}, 500);
    }
  });
  const status = await bridge.status({ probe: true });
  assert.equal(refreshCalls, 1);
  assert.equal(status.liveVerified, false);
  assert.deepEqual(Object.keys(status.errors).sort(), ['gcalendar', 'gcontacts', 'gdrive', 'gmail', 'gtasks']);
  assert.match(status.errors.gmail, /google:authorize/);
});

test('names a deleted OAuth client without exposing provider details', async () => {
  const bridge = new GoogleWorkspaceBridge({
    environment: {}, home: '/tmp/jarvis-google',
    reader: async (file) => file.endsWith('credentials.json')
      ? JSON.stringify({ installed: { client_id: 'client', client_secret: 'secret' } })
      : JSON.stringify({ refresh_token: 'refresh' }),
    fetchImpl: async () => response({ error: 'deleted_client', error_description: 'The OAuth client was deleted.' }, 401)
  });
  const status = await bridge.status({ probe: true });
  assert.match(status.errors.gmail, /client was deleted or disabled/i);
  assert.doesNotMatch(status.errors.gmail, /secret|refresh|client_secret/i);
});

test('keeps the requested Google service name when a connector read fails', async () => {
  const bridge = new GoogleWorkspaceBridge({
    environment: {}, home: '/tmp/jarvis-google',
    reader: async (file) => file.endsWith('credentials.json')
      ? JSON.stringify({ installed: { client_id: 'client', client_secret: 'secret' } })
      : JSON.stringify({ refresh_token: 'refresh' }),
    fetchImpl: async () => response({ error: 'deleted_client', error_description: 'The OAuth client was deleted.' }, 401)
  });
  const result = await bridge.runIntent('Show my latest Gmail emails');
  assert.equal(result.used, true);
  assert.equal(result.service, 'gmail');
  assert.equal(result.result, null);
});

test('pairs a Documents OAuth client with its local token instead of a token from another folder', async () => {
  const credentialsPath = path.join(TEST_HOME, 'Documents', 'Jarvis-Google-Auth', 'credentials.json');
  const matchingTokenPath = path.join(TEST_HOME, 'Documents', 'Jarvis-Google-Auth', 'token.json');
  const unrelatedTokenPath = path.join(TEST_HOME, 'jarvis-google', 'token.json');
  const files = new Map([
    [credentialsPath, JSON.stringify({ installed: { client_id: 'documents-client', client_secret: 'documents-secret' } })],
    [matchingTokenPath, JSON.stringify({ refresh_token: 'documents-refresh' })],
    [unrelatedTokenPath, JSON.stringify({ refresh_token: 'unrelated-refresh' })]
  ]);
  let refreshToken = '';
  const bridge = new GoogleWorkspaceBridge({
    environment: {}, home: TEST_HOME,
    reader: async (file) => { if (!files.has(file)) throw new Error('missing'); return files.get(file); },
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        refreshToken = new URLSearchParams(options.body).get('refresh_token') || '';
        return response({ access_token: 'documents-access', expires_in: 3600 });
      }
      return response({ messages: [] });
    }
  });

  await bridge.getAccessToken();
  assert.equal(refreshToken, 'documents-refresh');
});
