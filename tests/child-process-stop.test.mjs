import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { terminateChildProcess } from '../lib/child-process-stop.mjs';

class FakeChild extends EventEmitter {
  constructor(onKill = () => {}) {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.signals = [];
    this.onKill = onKill;
  }

  kill(signal) {
    this.signals.push(signal);
    this.onKill(signal, this);
    return true;
  }

  exit(signal = 'SIGTERM') {
    this.signalCode = signal;
    this.emit('exit', null, signal);
  }
}

test('stops a listener gracefully without sending SIGKILL', async () => {
  const child = new FakeChild((signal, process) => { if (signal === 'SIGTERM') queueMicrotask(() => process.exit(signal)); });
  assert.equal(await terminateChildProcess(child, { graceMs: 20, forceWaitMs: 20 }), true);
  assert.deepEqual(child.signals, ['SIGTERM']);
});

test('waits for a forced listener exit before allowing replacement startup', async () => {
  const child = new FakeChild((signal, process) => { if (signal === 'SIGKILL') queueMicrotask(() => process.exit(signal)); });
  assert.equal(await terminateChildProcess(child, { graceMs: 5, forceWaitMs: 20 }), true);
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
});

test('reports a child that still has not exited after the forced-stop deadline', async () => {
  const child = new FakeChild();
  assert.equal(await terminateChildProcess(child, { graceMs: 2, forceWaitMs: 2 }), false);
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
});

test('does not signal an already exited listener', async () => {
  const child = new FakeChild();
  child.exitCode = 0;
  assert.equal(await terminateChildProcess(child), true);
  assert.deepEqual(child.signals, []);
});
