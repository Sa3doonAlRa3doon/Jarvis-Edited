import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWakeCapture, piCaptureStartupExpired, wakeCaptureLabel } from '../public/wake-state.js';

test('normalizes Pi capture telemetry without retaining a transcript', () => {
  const value = normalizeWakeCapture({ state: 'listening', timeoutMs: 90_000, warmupMs: -3 }, Date.parse('2026-10-31T09:00:00Z'));
  assert.deepEqual(value, { state: 'listening', source: 'pi', timeoutMs: 30_000, warmupMs: 0, at: '2026-10-31T09:00:00.000Z' });
  assert.equal(Object.hasOwn(value, 'text'), false);
});

test('uses safe idle and human-readable phase labels for unknown telemetry', () => {
  const value = normalizeWakeCapture({ state: 'unexpected', timeoutMs: 'nope' }, Date.parse('2026-10-31T09:00:00Z'));
  assert.equal(value.state, 'idle');
  assert.equal(value.timeoutMs, 15_000);
  assert.equal(wakeCaptureLabel({ state: 'warming' }), 'LOCAL STT WARMING');
  assert.equal(wakeCaptureLabel(value), '');
});

test('Pi startup wait expires when no native capture ever begins', () => {
  assert.equal(piCaptureStartupExpired({ source: 'pi', phase: 'warming', deadline: 16000, now: 15999 }), false);
  assert.equal(piCaptureStartupExpired({ source: 'pi', phase: 'warming', deadline: 16000, now: 16000 }), true);
  assert.equal(piCaptureStartupExpired({ source: 'pi', phase: 'warming', deadline: 16000, now: 40000 }), true);
});

test('startup watchdog does not cut off healthy speech, browser capture, or acknowledgement', () => {
  for (const phase of ['listening', 'hearing', 'transcript', 'acknowledging', 'complete', 'error']) {
    assert.equal(piCaptureStartupExpired({ source: 'pi', phase, deadline: 1000, now: 40000 }), false);
  }
  assert.equal(piCaptureStartupExpired({ source: 'browser', phase: 'warming', deadline: 1000, now: 40000 }), false);
});

test('startup watchdog ignores missing or invalid deadlines', () => {
  for (const deadline of [undefined, null, NaN, Infinity, 0, -100, '1000']) {
    assert.equal(piCaptureStartupExpired({ source: 'pi', phase: 'warming', deadline, now: 40000 }), false);
  }
});
