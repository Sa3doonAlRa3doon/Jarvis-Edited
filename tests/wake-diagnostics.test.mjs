import test from 'node:test';
import assert from 'node:assert/strict';
import { freshPiWakeDiagnostic } from '../lib/wake-diagnostics.mjs';

const now = Date.parse('2026-11-01T11:00:00Z');

test('accepts only recent, bounded Pi microphone telemetry', () => {
  const report = freshPiWakeDiagnostic({
    source: 'pi', at: new Date(now - 1_000).toISOString(), micLevel: 0.025,
    noiseFloor: 0.004, signalToNoiseDb: 15.9, physicalGate: true
  }, now);
  assert.deepEqual(report, {
    at: new Date(now - 1_000).toISOString(), micLevel: 0.025,
    noiseFloor: 0.004, signalToNoiseDb: 15.9, physicalGate: true
  });
});

test('rejects missing, stale, non-Pi, and out-of-range microphone telemetry', () => {
  assert.equal(freshPiWakeDiagnostic(null, now), null);
  assert.equal(freshPiWakeDiagnostic({ source: 'browser', at: new Date(now).toISOString() }, now), null);
  assert.equal(freshPiWakeDiagnostic({ source: 'pi', at: new Date(now - 8_000).toISOString(), micLevel: 0, noiseFloor: 0, signalToNoiseDb: 0 }, now), null);
  assert.equal(freshPiWakeDiagnostic({ source: 'pi', at: new Date(now).toISOString(), micLevel: 1.5, noiseFloor: 0, signalToNoiseDb: 0 }, now), null);
  assert.equal(freshPiWakeDiagnostic({ source: 'pi', at: new Date(now).toISOString(), micLevel: 0, noiseFloor: 0, signalToNoiseDb: Number.NaN }, now), null);
});
