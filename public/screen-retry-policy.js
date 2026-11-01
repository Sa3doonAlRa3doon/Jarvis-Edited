export const SCREEN_RETRY_DELAY_MS = 20_000;

export function canScheduleScreenRetry({ retryable, requested, timerActive, attempts } = {}) {
  return Boolean(retryable && requested && !timerActive && Number.isFinite(attempts) && attempts < 1);
}

export function secondsUntilScreenRetry(dueAt, now = Date.now()) {
  const due = Number(dueAt);
  if (!Number.isFinite(due) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((due - now) / 1000));
}

export function screenRetryStatus(seconds, surface = 'workspace') {
  const remaining = Math.max(0, Math.floor(Number(seconds) || 0));
  if (surface === 'settings') return remaining ? `RETRY IN ${remaining}s` : 'RETRYING';
  return remaining ? `SCREEN RELEASED // RETRY IN ${remaining}s` : 'RETRYING SCREEN SHARE';
}
