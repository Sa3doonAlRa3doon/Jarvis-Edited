import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWakeCapture, wakeCaptureLabel } from '../public/wake-state.js';

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
