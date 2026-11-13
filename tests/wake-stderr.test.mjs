import assert from 'node:assert/strict';
import test from 'node:test';
import { appendWakeStderr, markWakeListenerSpawnFailure, wakeListenerExitError } from '../lib/wake-stderr.mjs';

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

test('a listener spawn failure clears stale readiness and records a bounded error', () => {
  const child = {};
  const state = {
    process: child, running: true, ready: true, model: true, sttModel: true,
    captureBackend: 'pipewire', captureTarget: '57', diagnostics: { micLevel: 0.1 }
  };
  assert.equal(markWakeListenerSpawnFailure(state, child, new Error('spawn ENOENT')), true);
  assert.deepEqual(state, {
    process: null, running: false, ready: false, model: false, sttModel: false,
    captureBackend: null, captureTarget: null, diagnostics: null, error: 'spawn ENOENT'
  });
});

test('ignores a stale listener spawn error after another child owns the state', () => {
  const state = { process: {}, running: true, ready: true, error: null };
  assert.equal(markWakeListenerSpawnFailure(state, {}, new Error('old failure')), false);
  assert.equal(state.running, true);
  assert.equal(state.ready, true);
  assert.equal(state.error, null);
});

test('does not drop a listener process that has a PID after a later process error', () => {
  const child = { pid: 1234 };
  const state = { process: child, running: true, ready: true };
  assert.equal(markWakeListenerSpawnFailure(state, child, new Error('kill EPERM')), false);
  assert.equal(state.process, child);
  assert.equal(state.running, true);
  assert.equal(state.ready, true);
});
