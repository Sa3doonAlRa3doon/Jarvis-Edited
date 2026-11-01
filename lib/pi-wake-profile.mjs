const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

/**
 * Resolve the Pi ALSA voice-energy floor from the shared sensitivity control.
 * Lower UI sensitivity values mean easier pickup. The configured floor remains
 * the anchor, while the slider adjusts it in a bounded and monotonic range.
 */
export function piWakeEnergyFloor(sensitivity, configuredFloor = 0.0035) {
  const rawSensitivity = Number(sensitivity);
  const safeSensitivity = clamp(Number.isFinite(rawSensitivity) ? rawSensitivity : 0.28, 0.01, 0.8);
  const rawFloor = Number(configuredFloor);
  const safeFloor = clamp(Number.isFinite(rawFloor) ? rawFloor : 0.0035, 0.0005, 0.05);
  const adjustedFloor = clamp(safeFloor + (safeSensitivity - 0.28) * 0.0075, 0.0005, 0.05);
  return Math.round(adjustedFloor * 1_000_000) / 1_000_000;
}
