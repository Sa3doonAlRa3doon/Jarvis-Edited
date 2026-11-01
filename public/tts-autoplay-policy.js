export function requiresBrowserTtsGesture({ userActivationAvailable, hasBeenActive, allowAutoplay }) {
  return Boolean(userActivationAvailable && !hasBeenActive && !allowAutoplay);
}
