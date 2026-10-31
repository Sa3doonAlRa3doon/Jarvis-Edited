const RETRYABLE_TTS_STATUSES = Object.freeze(new Set([500, 502, 503, 504]));

export function isRetryableTtsStatus(status) {
  return RETRYABLE_TTS_STATUSES.has(Number(status));
}

export function ttsRetryDelayMs(attempt, { baseMs = 350, maxMs = 1_500 } = {}) {
  const index = Math.max(0, Number(attempt) || 0);
  const base = Math.max(0, Number(baseMs) || 0);
  const max = Math.max(base, Number(maxMs) || base);
  return Math.min(max, base * (2 ** index));
}

export function ttsFailureMessage(status) {
  const numeric = Number(status);
  return Number.isFinite(numeric) ? `Fish Audio returned HTTP ${numeric}` : 'Fish Audio request failed';
}

export function boundedTtsHttpStatus(status, fallback = 502) {
  const numeric = Number(status);
  return Number.isInteger(numeric) && numeric >= 400 && numeric <= 599 ? numeric : fallback;
}
