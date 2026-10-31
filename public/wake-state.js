const CAPTURE_STATES = new Set(['idle', 'warming', 'listening', 'complete', 'timeout', 'error']);

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/**
 * Normalize Pi command-capture telemetry without retaining the transcript.
 * The browser needs the phase and timing to explain a missing reply, but it
 * does not need another copy of the user's words.
 */
export function normalizeWakeCapture(value = {}, now = Date.now()) {
  const state = CAPTURE_STATES.has(String(value?.state || '').trim().toLowerCase())
    ? String(value.state).trim().toLowerCase()
    : 'idle';
  const timestamp = Number.isFinite(Date.parse(value?.at)) ? new Date(value.at).toISOString() : new Date(now).toISOString();
  return {
    state,
    source: 'pi',
    timeoutMs: Math.round(boundedNumber(value?.timeoutMs, 15_000, 0, 30_000)),
    warmupMs: Math.round(boundedNumber(value?.warmupMs, 1_200, 0, 5_000)),
    at: timestamp
  };
}

export function wakeCaptureLabel(value = {}) {
  const state = String(value?.state || '').trim().toLowerCase();
  return {
    warming: 'LOCAL STT WARMING',
    listening: 'LOCAL STT LISTENING',
    complete: 'LOCAL COMMAND SENT',
    timeout: 'LOCAL STT TIMEOUT',
    error: 'LOCAL STT ERROR'
  }[state] || '';
}

export { CAPTURE_STATES };
