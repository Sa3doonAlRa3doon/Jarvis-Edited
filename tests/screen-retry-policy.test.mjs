import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREEN_RETRY_DELAY_MS, canScheduleScreenRetry, secondsUntilScreenRetry, screenRetryStatus } from '../public/screen-retry-policy.js';

test('screen retry uses the requested bounded 20 second delay', () => {
  assert.equal(SCREEN_RETRY_DELAY_MS, 20_000);
});

test('screen retry permits one requested retry and blocks duplicate or unsafe scheduling', () => {
  assert.equal(canScheduleScreenRetry({ retryable: true, requested: true, timerActive: false, attempts: 0 }), true);
  assert.equal(canScheduleScreenRetry({ retryable: false, requested: true, timerActive: false, attempts: 0 }), false);
  assert.equal(canScheduleScreenRetry({ retryable: true, requested: false, timerActive: false, attempts: 0 }), false);
  assert.equal(canScheduleScreenRetry({ retryable: true, requested: true, timerActive: true, attempts: 0 }), false);
  assert.equal(canScheduleScreenRetry({ retryable: true, requested: true, timerActive: false, attempts: 1 }), false);
  assert.equal(canScheduleScreenRetry({ retryable: true, requested: true, timerActive: false, attempts: NaN }), false);
});

test('screen retry countdown rounds up and never reports negative or invalid time', () => {
  assert.equal(secondsUntilScreenRetry(20_002, 1), 21);
  assert.equal(secondsUntilScreenRetry(20_000, 1_000), 19);
  assert.equal(secondsUntilScreenRetry(1_000, 1_000), 0);
  assert.equal(secondsUntilScreenRetry('invalid', 0), 0);
});

test('screen retry state copy is consistent across dashboard and settings', () => {
  assert.equal(screenRetryStatus(7, 'settings'), 'RETRY IN 7s');
  assert.equal(screenRetryStatus(0, 'settings'), 'RETRYING');
  assert.equal(screenRetryStatus(7), 'SCREEN RELEASED // RETRY IN 7s');
  assert.equal(screenRetryStatus(0), 'RETRYING SCREEN SHARE');
});
