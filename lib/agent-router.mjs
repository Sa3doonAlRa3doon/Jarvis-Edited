export const agentRoles = Object.freeze({
  GENERAL: { name: 'JARVIS', instruction: 'Handle everyday assistance and coordinate the other specialist roles.' },
  CODEACT: { name: 'CODEX', instruction: 'Focus on code, debugging, Linux commands, APIs, and technical implementation.' },
  RESEARCH: { name: 'PROSPECTOR', instruction: 'Focus on careful analysis, comparisons, calculations, research plans, and sourced reasoning.' },
  MONITOR: { name: 'SENTINEL', instruction: 'Focus on system health, Docker, services, storage, thermals, and operational diagnostics.' },
  MEMORY: { name: 'ARCHIVIST', instruction: 'Focus on local files, notes, recall, summaries, and private knowledge organization.' },
  FABRICATOR: { name: 'FABRICATOR', instruction: 'Focus on 3D-printer status, Moonraker, jobs, materials, temperatures, and print diagnostics.' },
  CONNECTOR: { name: 'LINK', instruction: 'Focus on authorized Google services such as Gmail, Calendar, Drive, Tasks, and Contacts.' },
  BROADCAST: { name: 'PRODUCER', instruction: 'Focus on local OBS scenes, stream/record state, audio inputs, overlays, and broadcast workflow. Never start, stop, or publish a stream without explicit confirmation.' },
  MEDIA: { name: 'CURATOR', instruction: 'Focus on the host-local media queue, ambient playback staging, track history, and safe playback controls. Never claim that an external music service was changed.' },
  SOCIAL: { name: 'SCOUT', instruction: 'Focus on public read-only community and social research across GitHub, Instagram, Reddit, Twitch, Discord, and YouTube. Summarize visible public evidence and citations; never log in, post, message, react, upload, or bypass ads or paywalls.' }
});

// Keep the emergency fallback small enough for a Pi 5. This list is only used
// when a configured specialist and the configured primary model are both
// missing; it never downloads a model or silently switches to a cloud service.
export const LOCAL_MODEL_FALLBACK_ORDER = Object.freeze([
  'qwen2.5:1.5b', 'qwen3.5:2b', 'llama3.2:1b', 'qwen2.5vl:3b', 'llama3.2:3b'
]);

// Prefer an already-installed model that fits the selected specialist before
// dropping all the way back to the primary model. This remains Pi-safe: the
// router never downloads a tag and only chooses from Ollama's local inventory.
export const ROLE_MODEL_FALLBACK_ORDER = Object.freeze({
  GENERAL: Object.freeze(['qwen3.5:2b', 'llama3.2:3b', 'qwen2.5:1.5b']),
  CODEACT: Object.freeze(['qwen2.5-coder:7b', 'qwen3.5:2b', 'qwen2.5:1.5b']),
  RESEARCH: Object.freeze(['qwen3:8b', 'qwen3.5:2b', 'llama3.2:3b']),
  MONITOR: Object.freeze(['qwen3.5:2b', 'llama3.2:3b', 'qwen2.5:1.5b']),
  MEMORY: Object.freeze(['qwen3.5:2b', 'llama3.2:3b', 'qwen2.5:1.5b']),
  FABRICATOR: Object.freeze(['qwen3.5:2b', 'llama3.2:3b', 'qwen2.5:1.5b']),
  CONNECTOR: Object.freeze(['qwen3.5:2b', 'llama3.2:3b', 'qwen2.5:1.5b']),
  BROADCAST: Object.freeze(['qwen3.5:2b', 'llama3.2:3b', 'qwen2.5:1.5b']),
  MEDIA: Object.freeze(['qwen3.5:2b', 'llama3.2:3b', 'qwen2.5:1.5b']),
  SOCIAL: Object.freeze(['qwen3.5:2b', 'llama3.2:3b', 'qwen2.5:1.5b'])
});

// Clean-room orchestration signals. These are based on JARVIS's own
// capability boundaries, not on any proprietary Dexter implementation. System
// health and Docker share one operations domain so an ordinary health report
// still routes to SENTINEL; genuinely cross-domain requests can use the
// GENERAL coordinator without changing any tool permissions.
const REQUEST_DOMAIN_PATTERNS = Object.freeze([
  { id: 'operations', label: 'HOST OPERATIONS', pattern: /\b(?:cpu|ram|memory|storage|disk|temperature|thermal|gpu|uptime|system health|health report|docker|container|compose|service logs?)\b/i },
  { id: 'fabricator', label: '3D FABRICATOR', pattern: /\b(?:printer|printing|3d print|moonraker|klipper|nozzle|bed temperature|filament|gcode|print eta|time left)\b/i },
  { id: 'google', label: 'GOOGLE WORKSPACE', pattern: /\b(?:gmail|google calendar|google drive|google tasks?|google contacts?|calendar event|my inbox|my email)\b/i },
  { id: 'public-data', label: 'PUBLIC DATA', pattern: /\b(?:weather|air quality|map|maps|nearby|local time|sunrise|sunset|exchange rate|holiday|earthquake|iss|define|dictionary|wikipedia|crypto|bitcoin)\b/i },
  { id: 'social', label: 'PUBLIC SOCIAL RESEARCH', pattern: /\b(?:instagram|reddit|discord|github|youtube|twitch|social|community|subreddit|creator|repository|repo|channel)\b/i },
  { id: 'web-research', label: 'WEB RESEARCH', pattern: /\b(?:search|browse|research|look\s*up|find|news|sources?|citations?|website|web page|internet)\b/i },
  { id: 'engineering', label: 'ENGINEERING', pattern: /\b(?:code|coding|javascript|typescript|python|node\.?js|react|sql|bug|debug|function|class|api|git|shell|bash|powershell|linux command|program|architect|critic|debugger|tests?)\b/i },
  { id: 'memory', label: 'PRIVATE MEMORY', pattern: /\b(?:remember|recall|memory|archive|note|reminder|todo|knowledge base|second brain|document|file)\b/i },
  { id: 'screen', label: 'SCREEN / VISION', pattern: /\b(?:screen|screenshot|display|what do you see|explain this view|camera frame|vision)\b/i },
  { id: 'broadcast', label: 'BROADCAST', pattern: /\b(?:obs|streaming|stream|twitch|youtube live|recording|broadcast|overlay|studio mode|virtual camera)\b/i },
  { id: 'media', label: 'MEDIA', pattern: /\b(?:music|media|playlist|song|track|podcast|lofi|ambient playback|now playing|audio queue)\b/i },
  { id: 'artifacts', label: 'OFFICE ARTIFACTS', pattern: /\b(?:powerpoint|presentation|pptx|word document|docx|excel|spreadsheet|xlsx|pdf)\b/i }
]);

const DOMAIN_ROUTE_MAP = Object.freeze({
  operations: 'MONITOR', fabricator: 'FABRICATOR', google: 'CONNECTOR',
  'public-data': 'RESEARCH', social: 'SOCIAL', 'web-research': 'RESEARCH',
  engineering: 'CODEACT', memory: 'MEMORY', screen: 'GENERAL',
  broadcast: 'BROADCAST', media: 'MEDIA', artifacts: 'MEMORY'
});

/**
 * Return the bounded capability domains mentioned by a request. Metadata only:
 * this never grants a tool, opens a browser, or performs a write. The
 * dashboard uses it to show when JARVIS is coordinating multiple specialist
 * lanes instead of pretending one specialist owns the whole task.
 */
export function requestDomains(prompt) {
  const text = String(prompt || '');
  return REQUEST_DOMAIN_PATTERNS
    .filter((item) => item.pattern.test(text))
    .map(({ id, label }) => ({ id, label }));
}

export function isMultiPurposePrompt(prompt) {
  return requestDomains(prompt).length > 1;
}

export function resolvePrimaryModel(environment = {}) {
  return environment.JARVIS_MODEL || environment.GENERAL_MODEL || environment.CODING_MODEL || environment.REASONING_MODEL || 'llama3.2:1b';
}

/**
 * Build the specialist model map. Every role still has a safe primary-model
 * fallback, so adding role-specific models never makes a fresh install fail
 * just because one optional Ollama model has not been downloaded yet.
 *
 * The legacy GENERAL_MODEL/CODING_MODEL/REASONING_MODEL names are accepted so
 * existing Pi .env files gain auto-routing without a migration.
 */
export function resolveModelMap(environment = {}) {
  const primary = resolvePrimaryModel(environment);
  return Object.freeze({
    primary,
    GENERAL: environment.GENERAL_MODEL || environment.JARVIS_GENERAL_MODEL || primary,
    CODEACT: environment.CODING_MODEL || environment.CODEACT_MODEL || environment.JARVIS_CODING_MODEL || primary,
    RESEARCH: environment.REASONING_MODEL || environment.RESEARCH_MODEL || environment.JARVIS_REASONING_MODEL || primary,
    MONITOR: environment.MONITOR_MODEL || environment.JARVIS_MONITOR_MODEL || environment.REASONING_MODEL || primary,
    MEMORY: environment.MEMORY_MODEL || environment.JARVIS_MEMORY_MODEL || environment.GENERAL_MODEL || primary,
    FABRICATOR: environment.FABRICATOR_MODEL || environment.JARVIS_FABRICATOR_MODEL || environment.GENERAL_MODEL || primary,
    CONNECTOR: environment.CONNECTOR_MODEL || environment.JARVIS_CONNECTOR_MODEL || environment.GENERAL_MODEL || primary,
    BROADCAST: environment.BROADCAST_MODEL || environment.JARVIS_BROADCAST_MODEL || environment.GENERAL_MODEL || primary,
    MEDIA: environment.MEDIA_MODEL || environment.JARVIS_MEDIA_MODEL || environment.GENERAL_MODEL || primary,
    SOCIAL: environment.SOCIAL_MODEL || environment.JARVIS_SOCIAL_MODEL || environment.GENERAL_MODEL || primary
  });
}

function normalizeModelSelection(modelOrOptions) {
  if (typeof modelOrOptions === 'string' && modelOrOptions.trim()) {
    return { primary: modelOrOptions.trim() };
  }
  if (modelOrOptions && typeof modelOrOptions === 'object') {
    const models = modelOrOptions.models && typeof modelOrOptions.models === 'object' ? modelOrOptions.models : modelOrOptions;
    const primary = String(models.primary || '').trim() || 'llama3.2:1b';
    return { primary, ...models };
  }
  return { primary: 'llama3.2:1b' };
}

/**
 * Describe the bounded specialist lanes for a cross-domain request. This is
 * routing metadata only: it does not call models, grant tools, or imply that
 * hidden chain-of-thought was produced. The coordinator still synthesizes one
 * answer from the explicit tool results already collected by the server.
 */
export function specialistAssignments(prompt, modelOrOptions, installed = null) {
  const models = normalizeModelSelection(modelOrOptions);
  return requestDomains(prompt).map((domain) => {
    const route = DOMAIN_ROUTE_MAP[domain.id] || 'GENERAL';
    const requestedModel = String(models[route] || models.primary || '').trim();
    const choice = selectInstalledModel({ requested: requestedModel, primary: models.primary, installed, route });
    return {
      domain: domain.id,
      label: domain.label,
      route,
      agent: agentRoles[route]?.name || agentRoles.GENERAL.name,
      requestedModel,
      model: String(choice.model || requestedModel || models.primary || '').trim(),
      fallback: choice.fallback || ''
    };
  });
}

export function routePrompt(prompt, modelOrOptions) {
  const text = String(prompt || '').toLowerCase();
  let route = 'GENERAL';
  if (/\b(obs|streaming|stream|twitch|youtube live|going live|go live|recording|record|scene switch|broadcast|overlay|studio mode|stream key)\b/.test(text)) route = 'BROADCAST';
  else if (/\b(music|media|playlist|song|track|podcast|lofi|ambient playback|now playing|audio queue)\b/.test(text)) route = 'MEDIA';
  else if (/\b(printer|print|printing|klipper|moonraker|nozzle|bed|gcode|filament|resin|slicer|eta)\b/.test(text)) route = 'FABRICATOR';
  else if (/\b(gmail|google calendar|google drive|google tasks|google contacts?|email|calendar event)\b/.test(text)) route = 'CONNECTOR';
  else if (/\b(instagram|reddit|discord|github|youtube|social|community|subreddit|twitch)\b/.test(text) && /\b(search|browse|research|find|look\s*up|public|profile|post|repository|repo|channel|creator|trend|news)\b/.test(text)) route = 'SOCIAL';
  else if (/\b(code|coding|javascript|typescript|python|node\.?js|react|sql|bug|debug|function|class|api|git|shell|bash|powershell|linux command|program)\b/.test(text)) route = 'CODEACT';
  else if (/\b(analy[sz]e|reason|research|compare|strategy|architecture|calculate|equation|math|investigate|sources|citations?)\b/.test(text) || text.length > 700) route = 'RESEARCH';
  else if (/\b(docker|container|compose|service|system health|cpu|ram|storage|disk|temperature|thermal|gpu|uptime|monitor|watch)\b/.test(text)) route = 'MONITOR';
  else if (/\b(remember|recall|memory|archive|notes?|documents?|files?|knowledge base|second brain)\b/.test(text)) route = 'MEMORY';
  const models = normalizeModelSelection(modelOrOptions);
  return { model: String(models[route] || models.primary), route, agent: agentRoles[route].name };
}

function installedModelMatches(installed, requested) {
  const desired = String(requested || '').trim();
  if (!desired || !Array.isArray(installed)) return false;
  return installed.some((name) => String(name || '').trim() === desired
    || (desired.endsWith(':latest') && String(name || '').trim().split(':')[0] === desired.split(':')[0]));
}

/**
 * Resolve a routed model against the local Ollama inventory without ever
 * reaching for a remote provider. `installed: null` means the inventory probe
 * failed, so the configured request is preserved for an independently managed
 * OpenJarvis backend. An empty array means Ollama is reachable but has no
 * models, so the configured request is still preserved for a useful error.
 */
export function selectInstalledModel({ requested = '', primary = '', installed = null, route = '' } = {}) {
  const requestedName = String(requested || '').trim();
  const primaryName = String(primary || '').trim();
  if (!Array.isArray(installed) || installed.length === 0) return { model: requestedName || primaryName, fallback: '' };
  if (installedModelMatches(installed, requestedName)) return { model: requestedName, fallback: '' };
  const roleCandidates = ROLE_MODEL_FALLBACK_ORDER[String(route || '').toUpperCase()] || [];
  const roleFallback = roleCandidates.find((candidate) => installedModelMatches(installed, candidate));
  if (roleFallback) return { model: roleFallback, fallback: 'configured specialist model is not installed; using an available role-compatible local model' };
  if (installedModelMatches(installed, primaryName)) return { model: primaryName, fallback: 'requested specialist model is not installed' };
  const emergency = LOCAL_MODEL_FALLBACK_ORDER.find((candidate) => installedModelMatches(installed, candidate));
  if (emergency) return { model: emergency, fallback: 'configured models are not installed; using an available Pi-friendly local model' };
  const first = String(installed[0] || '').trim();
  return first
    ? { model: first, fallback: 'configured models are not installed; using the first available local model' }
    : { model: requestedName || primaryName, fallback: '' };
}

/**
 * Build a bounded local retry order for an Ollama request.  A specialist can
 * be installed but still fail at runtime (for example while its runner is
 * warming or after an interrupted model load), so selection alone is not
 * enough.  The cascade never downloads a model or reaches a cloud provider.
 *
 * When an inventory is available, only installed names are returned.  When
 * the inventory probe failed, preserve the requested model so an independently
 * managed OpenJarvis/Ollama service can still resolve it.
 */
export function modelAttemptOrder({ requested = '', primary = '', installed = null, route = '', limit = 3 } = {}) {
  const max = Math.max(1, Math.min(5, Number(limit) || 3));
  const roleCandidates = ROLE_MODEL_FALLBACK_ORDER[String(route || '').toUpperCase()] || [];
  const candidates = [requested, ...roleCandidates, primary, ...LOCAL_MODEL_FALLBACK_ORDER, ...(Array.isArray(installed) ? installed : [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const seen = new Set();
  const order = [];
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    if (Array.isArray(installed) && installed.length > 0 && !installedModelMatches(installed, candidate)) continue;
    seen.add(key);
    order.push(candidate);
    if (order.length >= max) break;
  }
  return order;
}
