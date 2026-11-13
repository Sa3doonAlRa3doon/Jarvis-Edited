function boundedDuration(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  const selected = Number.isFinite(numeric) ? numeric : fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(selected)));
}

function errorDetail(error) {
  return String(error?.message || error || 'Probe unavailable')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function createFailureCooldownProbe({
  load,
  cooldownMs = 300_000,
  now = Date.now
} = {}) {
  if (typeof load !== 'function') throw new TypeError('A probe loader is required.');
  if (typeof now !== 'function') throw new TypeError('A probe clock is required.');
  const retryDelay = boundedDuration(cooldownMs, 300_000, 1_000, 3_600_000);
  let nextAttemptAt = 0;
  let lastAttemptAt = 0;
  let lastSuccessAt = 0;
  let lastError = null;
  let inFlight = null;

  async function probe() {
    const current = Number(now());
    if (nextAttemptAt > current) {
      return {
        state: 'cooldown', value: null, error: lastError,
        lastAttemptAt, lastSuccessAt, nextAttemptAt, skipped: true
      };
    }
    if (inFlight) return inFlight;
    inFlight = (async () => {
      lastAttemptAt = current;
      try {
        const value = await load();
        lastSuccessAt = current;
        nextAttemptAt = 0;
        lastError = null;
        return {
          state: 'ready', value, error: null,
          lastAttemptAt, lastSuccessAt, nextAttemptAt: 0, skipped: false
        };
      } catch (error) {
        lastError = errorDetail(error);
        nextAttemptAt = current + retryDelay;
        return {
          state: 'unavailable', value: null, error: lastError,
          lastAttemptAt, lastSuccessAt, nextAttemptAt, skipped: false
        };
      }
    })();
    try { return await inFlight; }
    finally { inFlight = null; }
  }

  return { probe };
}
