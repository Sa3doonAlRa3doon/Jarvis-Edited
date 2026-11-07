export function acknowledgeWakeCommand(wakeState = {}) {
  const state = wakeState?.commandCapture?.state;
  if (state === 'warming' || state === 'listening') {
    return { ok: true, status: 200, alreadyStarted: true };
  }
  if (state !== 'awaiting_ack') {
    return { ok: false, status: 409, error: 'No Pi command capture is waiting for acknowledgement.' };
  }
  const input = wakeState?.process?.stdin;
  if (!input || input.destroyed || input.writable !== true || typeof input.write !== 'function') {
    return { ok: false, status: 503, error: 'The Pi wake listener control channel is unavailable.' };
  }
  try {
    input.write('ACK\n');
    return { ok: true, status: 200, alreadyStarted: false };
  } catch {
    return { ok: false, status: 503, error: 'The Pi wake listener control channel is unavailable.' };
  }
}

