const GiB = 1024 ** 3;

export const VISION_MODEL_PROFILES = Object.freeze({
  balanced: Object.freeze({
    model: 'qwen2.5vl:3b',
    downloadBytes: 3.2 * GiB,
    minFreeBytes: 4.5 * GiB,
    minRamBytes: 6 * GiB
  }),
  lite: Object.freeze({
    model: 'moondream:1.8b',
    downloadBytes: 1.7 * GiB,
    minFreeBytes: 2.5 * GiB,
    minRamBytes: 3 * GiB
  })
});

const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,120}$/;

export function visionModelProfile(model) {
  const value = String(model || '').trim();
  if (value === VISION_MODEL_PROFILES.lite.model) return { ...VISION_MODEL_PROFILES.lite, profile: 'lite' };
  if (value === VISION_MODEL_PROFILES.balanced.model) return { ...VISION_MODEL_PROFILES.balanced, profile: 'balanced' };
  return {
    model: value,
    profile: 'custom',
    // A custom tag is still subject to a conservative preflight. The exact
    // size is unknown until Ollama downloads it, so use the balanced guard.
    downloadBytes: VISION_MODEL_PROFILES.balanced.downloadBytes,
    minFreeBytes: VISION_MODEL_PROFILES.balanced.minFreeBytes,
    minRamBytes: VISION_MODEL_PROFILES.balanced.minRamBytes
  };
}

export function selectVisionModel({ configured = '', totalRamBytes = 0, freeBytes = null } = {}) {
  const explicit = String(configured || '').trim();
  if (explicit) {
    if (!MODEL_PATTERN.test(explicit)) throw new Error('JARVIS_VISION_MODEL contains unsupported characters.');
    return { ...visionModelProfile(explicit), reason: 'explicit' };
  }
  const lowRam = Number(totalRamBytes) > 0 && Number(totalRamBytes) < VISION_MODEL_PROFILES.balanced.minRamBytes;
  const lowStorage = Number(freeBytes) > 0 && Number(freeBytes) < VISION_MODEL_PROFILES.balanced.minFreeBytes;
  const selected = lowRam || lowStorage ? visionModelProfile(VISION_MODEL_PROFILES.lite.model) : visionModelProfile(VISION_MODEL_PROFILES.balanced.model);
  return { ...selected, reason: lowRam ? 'ram' : lowStorage ? 'storage' : 'balanced' };
}

export function isVisionModelTag(value) {
  return MODEL_PATTERN.test(String(value || '').trim());
}

