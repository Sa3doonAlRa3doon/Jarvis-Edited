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

export function markWakeListenerSpawnFailure(state, child, error) {
  // A ChildProcess with a PID did start. Its later `error` may be a failed
  // signal/kill; do not drop ownership of a process that could still be alive.
  if (!state || state.process !== child || child?.pid != null) return false;
  state.process = null;
  state.running = false;
  state.ready = false;
  state.model = false;
  state.sttModel = false;
  state.captureBackend = null;
  state.captureTarget = null;
  state.diagnostics = null;
  state.error = String(error?.message || 'Could not start the mic listener.').replace(/\0/g, '').slice(0, ERROR_TEXT_LIMIT);
  return true;
}
