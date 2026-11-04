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

test('uses a complete private environment OAuth client without exposing it in Google status', async () => {
  const tokenPath = path.join(TEST_HOME, 'jarvis-google', 'token.json');
  const environment = { GOOGLE_CLIENT_ID: 'private-id', GOOGLE_CLIENT_SECRET: 'private-secret' };
  let refreshBody;
  const bridge = new GoogleWorkspaceBridge({
    environment, home: TEST_HOME,
    reader: async (file) => {
      if (file !== tokenPath) throw new Error('no credentials JSON in this fixture');
      return JSON.stringify({ client_id: 'private-id', refresh_token: 'private-refresh' });
    },
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        refreshBody = new URLSearchParams(options.body);
        return response({ access_token: 'private-access', expires_in: 3600 });
      }
      return response({}, 404);
    }
  });

  const status = await bridge.status();
  await bridge.getAccessToken();
  assert.equal(status.connected, true);
  assert.equal(status.source, 'private-environment-and-token-file');
  assert.equal(refreshBody.get('client_id'), 'private-id');
  assert.equal(refreshBody.get('client_secret'), 'private-secret');
  assert.equal(refreshBody.get('refresh_token'), 'private-refresh');
  assert.doesNotMatch(JSON.stringify(status), /private-id|private-secret|private-refresh/);
});

test('changing Google clients requires consent before an old token can be reused', async () => {
  for (const tokenClient of ['older-client', undefined]) {
    const tokenPath = path.join(TEST_HOME, 'jarvis-google', 'token.json');
    let calls = 0;
    const bridge = new GoogleWorkspaceBridge({
      environment: { GOOGLE_CLIENT_ID: 'new-client', GOOGLE_CLIENT_SECRET: 'new-private-secret' }, home: TEST_HOME,
      reader: async (file) => {
        if (file !== tokenPath) throw new Error('missing');
        return JSON.stringify({ client_id: tokenClient, refresh_token: 'older-private-refresh', access_token: 'older-access', expiry_date: Date.now() + 3600_000 });
      },
      fetchImpl: async () => { calls += 1; throw new Error('a mismatched token must not leave this host'); }
    });
    const status = await bridge.status({ probe: true });
    assert.equal(status.connected, false);
    assert.equal(status.needsReauthorization, true);
    await assert.rejects(() => bridge.getAccessToken(), /reauthorize Google/i);
    assert.equal(calls, 0);
    assert.doesNotMatch(JSON.stringify(status), /new-client|new-private-secret|older-private-refresh|older-access/);
  }
});

test('a token file cannot override a replacement credentials client', async () => {
  const files = credentialFiles();
  files.set(TOKEN_PATH, JSON.stringify({ client_id: 'old-client', client_secret: 'old-secret', refresh_token: 'refresh' }));
  const bridge = new GoogleWorkspaceBridge({ environment: credentialEnvironment(), reader: async (file) => files.get(file) });
  const configuration = await bridge.loadConfiguration();
  assert.equal(configuration.client.clientId, 'client');
  assert.equal(configuration.needsReauthorization, true);
  assert.equal((await bridge.status()).connected, false);
});

test('a revoked unexpired access token forces one refresh before retrying the API', async () => {
  const files = credentialFiles();
  files.set(TOKEN_PATH, JSON.stringify({ access_token: 'revoked', expiry_date: Date.now() + 3600_000, refresh_token: 'refresh' }));
  let refreshes = 0;
  const used = [];
  const bridge = new GoogleWorkspaceBridge({
    environment: credentialEnvironment(), reader: async (file) => files.get(file),
    fetchImpl: async (url, options) => {
      if (String(url).includes('oauth2.googleapis.com/token')) { refreshes += 1; return response({ access_token: 'fresh', expires_in: 3600 }); }
      used.push(options.headers.Authorization);
      return options.headers.Authorization === 'Bearer fresh' ? response({ ok: true }) : response({}, 401);
    }
  });
  assert.deepEqual(await bridge.request('https://gmail.googleapis.com/gmail/v1/users/me/profile'), { ok: true });
  assert.equal(refreshes, 1);
  assert.deepEqual(used, ['Bearer revoked', 'Bearer fresh']);
});

test('Google API setup failures are distinguished from expired authorization', async () => {
  const files = credentialFiles();
  const bridge = new GoogleWorkspaceBridge({
    environment: credentialEnvironment(), reader: async (file) => files.get(file),
    fetchImpl: async (url) => String(url).includes('oauth2.googleapis.com/token')
      ? response({ access_token: 'fixture-access', expires_in: 3600 })
      : response({ error: { message: 'This API has not been enabled in the project.' } }, 403)
  });
  const status = await bridge.status({ probe: true });
  assert.equal(status.connected, false);
  assert.equal(status.needsReauthorization, false);
  assert.equal(Object.keys(status.errors).length, 5);
  assert.match(status.errors.gmail, /not been enabled/);
});

test('invalid client credentials request reauthorization without claiming the client was deleted', async () => {
  const files = credentialFiles();
  const bridge = new GoogleWorkspaceBridge({
    environment: credentialEnvironment(), reader: async (file) => files.get(file),
    fetchImpl: async () => response({ error: 'invalid_client', error_description: 'fixture-provider-secret' }, 400)
  });
  const status = await bridge.status({ probe: true });
  assert.equal(status.needsReauthorization, true);
  assert.match(status.errors.gmail, /client ID or secret/);
  assert.doesNotMatch(JSON.stringify(status), /was deleted|fixture-provider-secret/);
});

test('a configured client without a private token asks for initial authorization', async () => {
  const files = credentialFiles(); files.delete(TOKEN_PATH);
  const bridge = new GoogleWorkspaceBridge({ environment: credentialEnvironment(), reader: async (file) => files.get(file) });
  assert.equal((await bridge.status()).needsReauthorization, true);
});
