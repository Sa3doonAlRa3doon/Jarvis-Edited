import assert from 'node:assert/strict';
import test from 'node:test';
import { appendWakeStderr, wakeListenerExitError } from '../lib/wake-stderr.mjs';

test('keeps benign ONNX runtime stderr out of healthy wake status', () => {
  const stderr = appendWakeStderr('', 'UserWarning: Execution provider notice');
  assert.equal(wakeListenerExitError(0, null, stderr), null);
  assert.equal(wakeListenerExitError(null, null, stderr), null);
});

test('uses bounded stderr details only after an abnormal listener exit', () => {
  const stderr = appendWakeStderr('', 'capture failed: device missing');
  assert.equal(wakeListenerExitError(1, null, stderr), 'capture failed: device missing');
  assert.equal(wakeListenerExitError(1, 'model load failed', stderr), 'model load failed');
  assert.equal(wakeListenerExitError(2, null, ''), 'Wake listener exited with code 2.');
});

test('bounds retained wake listener stderr and removes NUL bytes from surfaced details', () => {
  assert.equal(appendWakeStderr('', 'x'.repeat(2_000)).length, 1_200);
  assert.equal(wakeListenerExitError(1, null, 'device\0 failed'), 'device failed');
});
