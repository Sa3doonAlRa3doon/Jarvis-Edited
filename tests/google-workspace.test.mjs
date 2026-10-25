import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleWorkspaceBridge } from '../lib/google-workspace.mjs';

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

test('keeps OAuth secrets server-side while reporting a configured read-only bridge', async () => {
  const files = new Map([
    ['C:\\private\\credentials.json', JSON.stringify({ installed: { client_id: 'client', client_secret: 'secret' } })],
    ['C:\\private\\token.json', JSON.stringify({ refresh_token: 'refresh' })]
  ]);
  const bridge = new GoogleWorkspaceBridge({
    environment: { GOOGLE_CREDENTIALS_PATH: 'C:\\private\\credentials.json', GOOGLE_TOKEN_PATH: 'C:\\private\\token.json' }, home: 'C:\\home',
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
  const files = new Map([
    ['C:\\private\\credentials.json', JSON.stringify({ installed: { client_id: 'client', client_secret: 'secret' } })],
    ['C:\\private\\token.json', JSON.stringify({ refresh_token: 'refresh' })]
  ]);
  const seen = [];
  const bridge = new GoogleWorkspaceBridge({
    environment: { GOOGLE_CREDENTIALS_PATH: 'C:\\private\\credentials.json', GOOGLE_TOKEN_PATH: 'C:\\private\\token.json' }, home: 'C:\\home\\jarvis',
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
  const files = new Map([
    ['C:\\private\\credentials.json', JSON.stringify({ installed: { client_id: 'client', client_secret: 'secret' } })],
    ['C:\\private\\token.json', JSON.stringify({ refresh_token: 'refresh' })]
  ]);
  const seen = [];
  const bridge = new GoogleWorkspaceBridge({
    environment: { GOOGLE_CREDENTIALS_PATH: 'C:\\private\\credentials.json', GOOGLE_TOKEN_PATH: 'C:\\private\\token.json' }, home: 'C:\\home',
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
