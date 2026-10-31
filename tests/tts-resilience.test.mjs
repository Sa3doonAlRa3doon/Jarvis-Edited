import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedTtsHttpStatus, isRetryableTtsStatus, ttsFailureMessage, ttsRetryDelayMs } from '../lib/tts-resilience.mjs';

test('retries only transient Fish Audio server failures', () => {
  assert.equal(isRetryableTtsStatus(500), true);
  assert.equal(isRetryableTtsStatus(502), true);
  assert.equal(isRetryableTtsStatus(503), true);
  assert.equal(isRetryableTtsStatus(504), true);
  assert.equal(isRetryableTtsStatus(401), false);
  assert.equal(isRetryableTtsStatus(429), false);
});

test('bounds Fish Audio retry backoff', () => {
  assert.equal(ttsRetryDelayMs(0), 350);
  assert.equal(ttsRetryDelayMs(1), 700);
  assert.equal(ttsRetryDelayMs(9), 1_500);
  assert.equal(ttsRetryDelayMs(1, { baseMs: 50, maxMs: 100 }), 100);
});

test('keeps upstream failure messages bounded and secret-free', () => {
  assert.equal(ttsFailureMessage(502), 'Fish Audio returned HTTP 502');
  assert.equal(ttsFailureMessage('bad'), 'Fish Audio request failed');
  assert.doesNotMatch(ttsFailureMessage(502), /token|key|secret|Bearer/i);
});

test('preserves only a bounded provider HTTP status for diagnostics', () => {
  assert.equal(boundedTtsHttpStatus(402), 402);
  assert.equal(boundedTtsHttpStatus(429), 429);
  assert.equal(boundedTtsHttpStatus('not-a-status'), 502);
  assert.equal(boundedTtsHttpStatus(700), 502);
});
