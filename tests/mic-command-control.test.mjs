import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeWakeCommand } from '../lib/mic-command-control.mjs';

test('writes only the bounded acknowledgement token to a waiting listener', () => {
  const writes = [];
  const result = acknowledgeWakeCommand({
    commandCapture: { state: 'awaiting_ack' },
    process: { stdin: { writable: true, destroyed: false, write: (value) => writes.push(value) } }
  });
  assert.deepEqual(result, { ok: true, status: 200, alreadyStarted: false });
  assert.deepEqual(writes, ['ACK\n']);
});

test('does not write to an idle or already-started capture', () => {
  for (const state of ['idle', 'warming', 'listening']) {
    let writes = 0;
    const result = acknowledgeWakeCommand({ commandCapture: { state }, process: { stdin: { writable: true, destroyed: false, write: () => { writes += 1; } } } });
    assert.equal(result.status, state === 'idle' ? 409 : 200);
    assert.equal(result.alreadyStarted, state === 'idle' ? undefined : true);
    assert.equal(writes, 0);
  }
});

test('fails safely when the child control pipe is absent, closed, or throws', () => {
  assert.equal(acknowledgeWakeCommand({ commandCapture: { state: 'awaiting_ack' } }).status, 503);
  assert.equal(acknowledgeWakeCommand({ commandCapture: { state: 'awaiting_ack' }, process: { stdin: { writable: false, destroyed: true } } }).status, 503);
  const result = acknowledgeWakeCommand({ commandCapture: { state: 'awaiting_ack' }, process: { stdin: { writable: true, destroyed: false, write() { throw new Error('private pipe detail'); } } } });
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.error, /private pipe detail/);
});

