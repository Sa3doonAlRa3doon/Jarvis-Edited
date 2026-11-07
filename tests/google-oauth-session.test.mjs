import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startGoogleOAuthSession } from '../lib/google-oauth-session.mjs';

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-oauth-test-'));
  const tokenPath = path.join(directory, 'token.json');
  const session = await startGoogleOAuthSession({
    client: { client_id: 'fixture-client', client_secret: 'fixture-secret' },
    redirectUri: 'http://127.0.0.1:0/google/callback', tokenPath, scopes: ['fixture-scope'],
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 }) }),
    ...options
  });
  t.after(async () => {
    session.stop();
    await session.completion.catch(() => {});
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(directory, { force: true, recursive: true });
  });
  const authorization = new URL(session.authorizationUrl);
  const callback = new URL(authorization.searchParams.get('redirect_uri'));
  callback.search = new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'fixture-code' });
  return { session, tokenPath, directory, authorization, callback };
}

test('OAuth success waits for exchange and token persistence, with a bound PKCE verifier', async (t) => {
  let beginExchange, releaseExchange, received;
  const exchanging = new Promise((resolve) => { beginExchange = resolve; });
  const released = new Promise((resolve) => { releaseExchange = resolve; });
  const f = await fixture(t, { fetchImpl: async (_url, options) => {
    received = new URLSearchParams(options.body);
    beginExchange();
    await released;
    return { ok: true, status: 200, json: async () => ({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' }) };
  } });
  let replied = false;
  const request = fetch(f.callback).then((value) => { replied = true; return value; });
  await exchanging;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(replied, false);
  await assert.rejects(fs.access(f.tokenPath));
  assert.equal(f.authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(f.authorization.searchParams.get('code_challenge'), crypto.createHash('sha256').update(received.get('code_verifier')).digest('base64url'));
  assert.equal(received.get('redirect_uri'), f.callback.origin + '/google/callback');
  assert.equal(f.authorization.searchParams.has('client_secret'), false);
  releaseExchange();
  const response = await request;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Google connected to JARVIS/);
  assert.equal((await f.session.completion).saved, true);
  const token = JSON.parse(await fs.readFile(f.tokenPath, 'utf8'));
  assert.equal(token.client_id, 'fixture-client');
  assert.equal(token.refresh_token, 'fixture-refresh');
  assert.equal('client_secret' in token, false);
  if (process.platform !== 'win32') assert.equal((await fs.stat(f.tokenPath)).mode & 0o777, 0o600);
  assert.deepEqual((await fs.readdir(f.directory)).sort(), ['token.json']);
});

test('unrelated callback requests do not cancel the legitimate consent flow', async (t) => {
  const f = await fixture(t);
  const wrongState = new URL(f.callback); wrongState.searchParams.set('state', 'unrelated-request');
  assert.equal((await fetch(wrongState)).status, 403);
  assert.equal((await fetch(f.callback, { method: 'POST' })).status, 405);
  assert.equal((await fetch(new URL('/favicon.ico', f.callback))).status, 404);
  assert.equal((await fetch(f.callback)).status, 200);
  await f.session.completion;
});

test('a failed token exchange cannot show a connected page or replace an existing token', async (t) => {
  const f = await fixture(t, { fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error_description: 'fixture-provider-secret' }) }) });
  await fs.writeFile(f.tokenPath, 'previous-private-token');
  const response = await fetch(f.callback);
  const page = await response.text();
  assert.equal(response.status, 502);
  assert.doesNotMatch(page, /Google connected|fixture-provider-secret|fixture-secret/);
  await assert.rejects(f.session.completion, /exchange failed \(HTTP 400\)/);
  assert.equal(await fs.readFile(f.tokenPath, 'utf8'), 'previous-private-token');
});

test('the new client never inherits another client’s refresh token', async (t) => {
  const f = await fixture(t, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'fixture-access' }) }) });
  const previous = JSON.stringify({ client_id: 'older-client', refresh_token: 'older-private-refresh' });
  await fs.writeFile(f.tokenPath, previous, { mode: 0o600 });
  assert.equal((await fetch(f.callback)).status, 502);
  await assert.rejects(f.session.completion, /no refresh token for this client/);
  assert.equal(await fs.readFile(f.tokenPath, 'utf8'), previous);
});

test('an existing Google token readable by other users is rejected before reuse', async (t) => {
  if (process.platform === 'win32') return t.skip('Windows does not expose POSIX file modes');
  const f = await fixture(t, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'fixture-access' }) }) });
  const previous = JSON.stringify({ client_id: 'fixture-client', refresh_token: 'private-refresh' });
  await fs.writeFile(f.tokenPath, previous, { mode: 0o644 });
  await fs.chmod(f.tokenPath, 0o644);
  const response = await fetch(f.callback);
  assert.equal(response.status, 502);
  assert.match(await response.text(), /group or other users/i);
  await assert.rejects(f.session.completion, /group or other users/i);
  assert.equal(await fs.readFile(f.tokenPath, 'utf8'), previous);
});

test('an existing token symlink is rejected without reading or replacing its target', async (t) => {
  if (process.platform === 'win32') return t.skip('Windows test hosts may not grant symlink privilege');
  const f = await fixture(t);
  const target = path.join(f.directory, 'other-private-token.json');
  const previous = JSON.stringify({ client_id: 'fixture-client', refresh_token: 'other-private-refresh' });
  await fs.writeFile(target, previous, { mode: 0o600 });
  await fs.symlink(target, f.tokenPath);
  const response = await fetch(f.callback);
  assert.equal(response.status, 502);
  assert.match(await response.text(), /cannot be a link/i);
  await assert.rejects(f.session.completion, /cannot be a link/i);
  assert.equal(await fs.readFile(target, 'utf8'), previous);
  assert.equal((await fs.lstat(f.tokenPath)).isSymbolicLink(), true);
});

test('an existing multiply linked token is rejected without replacing either link', async (t) => {
  const f = await fixture(t);
  const target = path.join(f.directory, 'other-private-token.json');
  const previous = JSON.stringify({ client_id: 'fixture-client', refresh_token: 'other-private-refresh' });
  await fs.writeFile(target, previous, { mode: 0o600 });
  try {
    await fs.link(target, f.tokenPath);
  } catch (error) {
    if (['EPERM', 'ENOTSUP', 'EACCES'].includes(error?.code)) return t.skip(`Hard links unavailable: ${error.code}`);
    throw error;
  }
  const response = await fetch(f.callback);
  assert.equal(response.status, 502);
  assert.match(await response.text(), /cannot be a link/i);
  await assert.rejects(f.session.completion, /cannot be a link/i);
  assert.equal(await fs.readFile(target, 'utf8'), previous);
  assert.equal(await fs.readFile(f.tokenPath, 'utf8'), previous);
});

test('storage failure returns an honest failure page and removes only its temporary file', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(f.tokenPath);
  const response = await fetch(f.callback);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /Google connected|fixture-access|fixture-refresh|fixture-secret/);
  await assert.rejects(f.session.completion, /must be one private regular file/);
  assert.equal((await fs.stat(f.tokenPath)).isDirectory(), true);
  assert.deepEqual(await fs.readdir(f.directory), ['token.json']);
});

test('an idle consent listener expires and releases its port', async (t) => {
  const f = await fixture(t, { timeoutMs: 30 });
  await assert.rejects(f.session.completion, /Authorization timed out/);
  await assert.rejects(fetch(f.callback));
});
