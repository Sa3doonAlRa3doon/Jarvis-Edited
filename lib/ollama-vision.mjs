const VISION_TAG_PATTERN = /(?:vision|(?:^|[._-])vl(?::|$)|qwen[^:]*vl|llava|bakllava|moondream|gemma3)/i;

/**
 * Normalize Ollama's /api/show capability list without exposing model
 * metadata to the browser. Ollama versions differ slightly, so the probe is
 * intentionally tolerant of missing or non-array fields.
 */
export function modelCapabilities(details) {
  const values = Array.isArray(details?.capabilities) ? details.capabilities : [];
  return [...new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))].slice(0, 16);
}

/**
 * Determine whether a model can accept images. A recent Ollama /api/show
 * response is authoritative. Older runtimes sometimes omit capabilities, so
 * a clearly vision-tagged model is accepted as a documented fallback and is
 * marked as unverified rather than silently treated as fully verified.
 */
export function inspectVisionCapability(details, model = '') {
  const capabilities = modelCapabilities(details);
  if (capabilities.length) {
    const capable = capabilities.some((value) => /vision|image|multimodal|multimodal-embedding/i.test(value));
    return { capable, verified: true, source: 'ollama-show', capabilities };
  }
  if (VISION_TAG_PATTERN.test(String(model || ''))) {
    return { capable: true, verified: false, source: 'model-tag-fallback', capabilities: [] };
  }
  return { capable: null, verified: false, source: 'unknown', capabilities: [] };
}

/**
 * Build one redacted, stable runtime status object for the API, settings UI,
 * capability matrix, and Pi smoke checks.
 */
export function buildVisionRuntime({ configured = false, installed = null, model = '', details = null, probeError = '' } = {}) {
  const safeModel = String(model || '').trim().slice(0, 120);
  if (!configured) return { configured: false, installed: false, ready: false, model: '', runtime: 'unconfigured', capabilityVerified: false, capabilitySource: 'none', capabilities: [] };
  if (installed === null) return { configured: true, installed: false, ready: false, model: safeModel, runtime: 'unknown', capabilityVerified: false, capabilitySource: 'ollama-unreachable', capabilities: [], probeError: String(probeError || '').slice(0, 160) };
  if (!installed) return { configured: true, installed: false, ready: false, model: safeModel, runtime: 'missing', capabilityVerified: false, capabilitySource: 'model-catalog', capabilities: [] };
  const capability = inspectVisionCapability(details, safeModel);
  if (capability.capable === false) return { configured: true, installed: true, ready: false, model: safeModel, runtime: 'unsupported', capabilityVerified: true, capabilitySource: capability.source, capabilities: capability.capabilities };
  if (capability.capable === null) return { configured: true, installed: true, ready: false, model: safeModel, runtime: 'unknown', capabilityVerified: false, capabilitySource: capability.source, capabilities: capability.capabilities, probeError: String(probeError || '').slice(0, 160) };
  return { configured: true, installed: true, ready: true, model: safeModel, runtime: 'ready', capabilityVerified: capability.verified, capabilitySource: capability.source, capabilities: capability.capabilities };
}

/**
 * Give the UI a fast, actionable error before it attempts a long image call.
 * The message deliberately contains only the redacted runtime state.
 */
export function visionRuntimeError(vision = {}) {
  if (vision?.ready) return '';
  if (!vision?.configured) return 'No local vision model is configured. Set JARVIS_VISION_MODEL after installing a vision-capable Ollama model.';
  const model = String(vision.model || 'the configured model').trim();
  if (vision.runtime === 'missing') return `Local vision model ${model} is not installed. Run npm run vision:install on this host, then restart JARVIS.`;
  if (vision.runtime === 'unsupported') return `Local vision model ${model} does not advertise image input. Choose a vision-capable Ollama tag and rerun npm run vision:install.`;
  if (vision.runtime === 'unknown') return `Local vision model ${model} could not be verified because Ollama is unavailable. Start Ollama locally and retry.`;
  return `Local vision model ${model} is not ready. Check Ollama and rerun npm run vision:check.`;
}
