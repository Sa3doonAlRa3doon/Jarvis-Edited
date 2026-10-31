const MAX_WAKE_COMMAND_LENGTH = 600;

/**
 * Normalize a command that arrived with an already-verified wake event.
 *
 * Pi Vosk results and browser wake transcripts both cross a small event
 * boundary before they reach the dashboard. Keep that boundary bounded and
 * deterministic, without attempting to reinterpret the user's words here.
 */
export function normalizeWakeCommand(value) {
  return String(value ?? '')
    .replace(/\0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_WAKE_COMMAND_LENGTH);
}

/** A non-empty command means the wake event already contains the sentence. */
export function hasWakeCommand(value) {
  return Boolean(normalizeWakeCommand(value));
}

export { MAX_WAKE_COMMAND_LENGTH };
