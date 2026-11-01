const STDERR_TAIL_LIMIT = 1_200;
const ERROR_TEXT_LIMIT = 220;

export function appendWakeStderr(current, chunk) {
  return `${String(current ?? '')}${String(chunk ?? '')}`.slice(-STDERR_TAIL_LIMIT);
}

export function wakeListenerExitError(code, currentError, stderrTail) {
  if (!code || currentError) return currentError || null;
  const detail = String(stderrTail ?? '').replace(/\0/g, '').trim().slice(-ERROR_TEXT_LIMIT);
  return detail || `Wake listener exited with code ${code}.`;
}
