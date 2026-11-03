export function wakeListenerRetryDelayMs(attempt) {
  const parsedAttempt = Number(attempt);
  const boundedAttempt = Number.isFinite(parsedAttempt)
    ? Math.max(1, Math.min(6, Math.trunc(parsedAttempt)))
    : 1;
  return Math.min(30_000, 1_000 * (2 ** (boundedAttempt - 1)));
}
