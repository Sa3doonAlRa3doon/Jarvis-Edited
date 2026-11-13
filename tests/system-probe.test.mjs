import test from 'node:test';
import assert from 'node:assert/strict';
import { runBinary } from '../lib/system-probe.mjs';

test('runBinary forwards cancellation and terminates a running child', async () => {
  const controller = new AbortController();
  const running = runBinary(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    timeout: 10_000,
    signal: controller.signal
  });
  setTimeout(() => controller.abort(), 40).unref();
  await assert.rejects(() => running, (error) => error?.name === 'AbortError' || error?.code === 'ABORT_ERR');
});
