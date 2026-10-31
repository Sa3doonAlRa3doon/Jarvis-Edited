import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuthFlow } from '../lib/google-auth-flow.mjs';

function childFixture() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

test('Google OAuth flow exposes only the consent URL and refreshes its lifecycle', async () => {
  const child = childFixture();
  const calls = [];
  let completed = 0;
  const flow = new GoogleAuthFlow({
    scriptPath: 'C:\\jarvis\\scripts\\google-oauth-local.mjs',
    execPath: 'node',
    environment: { GOOGLE_AUTH_DIRECTORY: 'C:\\jarvis\\google' },
    accessImpl: async () => {},
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      queueMicrotask(() => child.stdout.emit('data', 'Open this URL:\nhttps://accounts.google.com/o/oauth2/v2/auth?client_id=example&state=abc\n'));
      return child;
    },
    onComplete: () => { completed += 1; }
  });
  const started = await flow.start();
  assert.equal(started.running, true);
  assert.equal(started.status, 'waiting-for-consent');
  assert.equal(calls[0].command, 'node');
  assert.equal(calls[0].args[0], 'C:\\jarvis\\scripts\\google-oauth-local.mjs');
  assert.equal(calls[0].options.stdio[1], 'pipe');
  assert.match(flow.snapshot().url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  child.emit('exit', 0);
  assert.equal(flow.snapshot().running, false);
  assert.equal(flow.snapshot().status, 'completed');
  assert.equal(completed, 1);
});

test('Google OAuth flow refuses to start without private credentials', async () => {
  const flow = new GoogleAuthFlow({ accessImpl: async () => { throw new Error('missing'); } });
  await assert.rejects(() => flow.start(), /credentials were not found/i);
  assert.equal(flow.snapshot().running, false);
  assert.equal(flow.snapshot().status, 'idle');
});
