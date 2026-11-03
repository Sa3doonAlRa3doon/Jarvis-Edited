import test from 'node:test';
import assert from 'node:assert/strict';
import { wakeListenerRetryDelayMs } from '../lib/wake-retry.mjs';

test('wake listener retries use bounded exponential delays', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(wakeListenerRetryDelayMs), [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
});

test('invalid or non-positive retry attempts safely use the first delay', () => {
  for (const attempt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'not-a-number']) {
    assert.equal(wakeListenerRetryDelayMs(attempt), 1_000);
  }
});
