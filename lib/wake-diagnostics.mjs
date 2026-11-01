export function freshPiWakeDiagnostic(value, now = Date.now(), maxAgeMs = 7_000) {
  if (!value || typeof value !== 'object' || value.source !== 'pi') return null;
  const at = Date.parse(String(value.at || ''));
  const age = Number(now) - at;
  if (!Number.isFinite(at) || !Number.isFinite(age) || age < -1_000 || age > Math.max(1_000, Number(maxAgeMs) || 7_000)) return null;
  const micLevel = Number(value.micLevel);
  const noiseFloor = Number(value.noiseFloor);
  const signalToNoiseDb = Number(value.signalToNoiseDb);
  if (![micLevel, noiseFloor, signalToNoiseDb].every(Number.isFinite)) return null;
  if (micLevel < 0 || micLevel > 1 || noiseFloor < 0 || noiseFloor > 1 || signalToNoiseDb < -120 || signalToNoiseDb > 120) return null;
  return { at: new Date(at).toISOString(), micLevel, noiseFloor, signalToNoiseDb, physicalGate: Boolean(value.physicalGate) };
}
