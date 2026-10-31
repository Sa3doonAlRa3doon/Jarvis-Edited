import { requestDomains, routePrompt } from './agent-router.mjs';
import { artifactIntent } from './artifact-studio.mjs';
import { interactiveBrowserIntent, restrictedBrowserIntent } from './browser-control.mjs';
import { outboundCommunicationKind } from './email-drafts.mjs';
import { isWebResearchPrompt, websiteFromPrompt } from './web-tools.mjs';

function clean(value, limit = 320) {
  return String(value ?? '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function has(text, pattern) { return pattern.test(text); }

/**
 * Build a deterministic, redacted execution preview for one JARVIS request.
 *
 * This is intentionally a plan, not a permission grant. It describes the
 * observable workflow and required approvals before the existing guarded
 * handlers run; it never executes a tool, opens a URL, or reads a secret.
 */
export function buildMissionPlan({
  prompt = '', models = {}, settings = {}, googleConnected = false,
  browserControlEnabled = false, printerConfigured = false, printerOnline = false,
  visionReady = false, openJarvisOnline = true, ollamaOnline = true,
  desktopAppsAvailable = false, obsConfigured = false, stirlingConfigured = false
} = {}) {
  const request = clean(prompt, 6000);
  const text = request.toLowerCase();
  const selected = routePrompt(request, models);
  const domains = requestDomains(request);
  const multiPurpose = domains.length > 1;
  const capabilities = [];
  const sources = [];
  const approvals = [];
  const steps = [];
  const warnings = [];
  const addCapability = (id, label, kind, available = true, readOnly = true) => {
    if (capabilities.some((item) => item.id === id)) return;
    capabilities.push({ id, label, kind, available: Boolean(available), readOnly: Boolean(readOnly) });
  };
  const addSource = (id, label) => { if (!sources.some((item) => item.id === id)) sources.push({ id, label }); };
  const addStep = (id, label, mode = 'read') => { if (!steps.some((item) => item.id === id)) steps.push({ id, label, mode }); };
  const addApproval = (id, label, confirmation, available = true) => {
    if (approvals.some((item) => item.id === id)) return;
    approvals.push({ id, label, confirmation, available: Boolean(available) });
  };
  const warn = (code, message) => { if (!warnings.some((item) => item.code === code)) warnings.push({ code, message }); };

  addSource('local-model', `${selected.agent} // ${selected.model || models.primary || 'local model'}`);
  addStep('route', `Route to ${selected.agent}`, 'read');
  if (multiPurpose) {
    addCapability('orchestrator', 'Multi-purpose coordinator', 'orchestration', true, true);
    addSource('orchestrator', 'Local specialist fan-out with bounded synthesis');
    addStep('coordinate', `Coordinate ${domains.length} specialist lanes into one answer`, 'read');
  }

  const systemRequested = has(text, /\b(?:cpu|ram|memory|storage|disk|temperature|thermal|gpu|uptime|system health|health report|service status)\b/);
  const dockerRequested = has(text, /\b(?:docker|container|compose|service logs?)\b/);
  const printerRequested = has(text, /\b(?:printer|printing|3d print|moonraker|klipper|nozzle|bed temperature|filament|gcode|print eta|time left)\b/);
  const printerMutation = printerRequested && has(text, /\b(?:pause|resume|cancel|end|stop|abort)\b/);
  const googleRequested = has(text, /\b(?:gmail|google calendar|google drive|google tasks?|google contacts?|calendar event|my inbox|my email)\b/);
  const publicRequested = has(text, /\b(?:weather|air quality|map|maps|nearby|local time|sunrise|sunset|exchange rate|holiday|earthquake|iss|define|dictionary|wikipedia|crypto|bitcoin)\b/);
  const socialRequested = has(text, /\b(?:instagram|reddit|discord|github|youtube|twitch|social|community|subreddit|creator|repository|repo|channel)\b/);
  const obsRequested = has(text, /\b(?:obs|streaming|stream|twitch|youtube live|recording|record|scene|broadcast|overlay|studio mode|virtual camera)\b/);
  const operationsRequested = has(text, /\b(?:restart|shutdown|shut down|stop all|maintenance|repair services?|resume services?)\b/);
  const engineeringRequested = has(text, /\b(?:architect|critic|debugger|engineering pipeline|run (?:the )?(?:unit|full|browser|camoufox|chrome|live) checks?|unit tests?|full static checks?)\b/);
  const memoryRequested = has(text, /\b(?:remember|recall|memory|archive|note|reminder|todo|knowledge base|second brain)\b/);
  const screenRequested = has(text, /\b(?:screen|screenshot|display|what do you see|explain this view|camera frame|vision)\b/);
  const browserInteractive = interactiveBrowserIntent(request);
  const browserRestricted = restrictedBrowserIntent(request);
  const websiteRequested = Boolean(websiteFromPrompt(request));
  const researchRequested = isWebResearchPrompt(request);
  const artifactType = artifactIntent(request);
  const emailKind = outboundCommunicationKind(request);

  if (systemRequested) {
    addCapability('system-read', 'System telemetry', 'operations'); addSource('system', 'CPU, RAM, storage, temperature, and service probes'); addStep('system-read', 'Read current host telemetry', 'read');
  }
  if (dockerRequested) {
    addCapability('docker-read', 'Docker status', 'operations'); addSource('docker', 'Local Docker/container summary'); addStep('docker-read', 'Inspect containers without changing them', 'read');
  }
  if (printerRequested) {
    addCapability('printer-read', '3D printer telemetry', 'fabricator', printerConfigured, true); addSource('printer', printerOnline ? 'Moonraker printer status' : 'Configured printer endpoint'); addStep('printer-read', 'Read print progress, temperatures, and ETA', 'read');
    if (!printerConfigured) warn('printer-not-configured', 'PRINTER_URL is not configured on this host.');
    if (printerMutation) addApproval('printer-control', 'Printer control', text.includes('pause') ? 'PAUSE PRINT' : text.includes('resume') ? 'RESUME PRINT' : 'CANCEL PRINT', printerConfigured);
  }
  if (googleRequested) {
    addCapability('google-read', 'Google Workspace read', 'connector', googleConnected, true); addSource('google', 'Private Google OAuth bridge'); addStep('google-read', 'Read only the named Google service', 'read');
    if (!googleConnected) warn('google-reauthorization', 'Google OAuth is not currently live; reauthorize the private credentials before reading Gmail, Calendar, Drive, Tasks, or Contacts.');
  }
  if (publicRequested) {
    addCapability('public-apis', 'Keyless public information', 'research'); addSource('public-apis', `Keyless public services // ${settings.defaultLocation || 'default location'}`); addStep('public-read', 'Fetch bounded public data with citations', 'read');
  }
  if (researchRequested) {
    addCapability('web-research', 'Sourced web research', 'research'); addSource('public-web', 'Bounded public web/RSS search'); addStep('web-search', 'Search public pages and return citations', 'read');
  }
  if (socialRequested) {
    addCapability('social-research', 'Public social research', 'research'); addSource('public-social', 'Public GitHub, Instagram, Reddit, YouTube, Twitch, and Discord pages'); addStep('social-read', 'Read public social evidence without login or posting', 'read');
  }
  if (obsRequested) {
    addCapability('obs-read', 'OBS status', 'broadcast', obsConfigured, true); addSource('obs', 'Loopback OBS WebSocket status'); addStep('obs-read', 'Read scene, stream, recording, and mixer state', 'read');
    if (!obsConfigured) warn('obs-not-configured', 'OBS WebSocket is not configured on this host.');
    if (has(text, /\b(?:start|stop|switch|change|mute|unmute|record|replay|virtual camera|transition|filter|volume)\b/)) addApproval('obs-control', 'OBS control', 'EXACT OBS CONFIRMATION', obsConfigured);
  }
  if (operationsRequested) {
    addCapability('operations', 'Pi service operations', 'operations', true, false); addSource('service-control', 'Fixed local service allow-list'); addStep('operations', 'Prepare a PIN-guarded maintenance action', 'approval'); addApproval('operations', 'Maintenance control', 'EXACT OPERATION CONFIRMATION', true);
  }
  if (engineeringRequested) {
    addCapability('engineering-pipeline', 'Architect / Critic / Debugger', 'engineering', true, true); addSource('engineering-pipeline', 'Fixed local test recipes with redacted evidence'); addStep('engineering', 'Run the selected bounded engineering recipe', 'read'); addStep('critic', 'Critic checks exit codes and bounded evidence', 'read'); addStep('debugger', 'Classify failures and name the smallest surgical fix', 'read');
  }
  if (memoryRequested) {
    addCapability('memory', 'Private local memory', 'memory'); addSource('local-memory', 'Host-local notes and reminders'); addStep('memory', 'Read or write only the requested local note/reminder', 'local');
  }
  if (screenRequested) {
    addCapability('screen-explain', 'Approved screen explanation', 'vision', visionReady, true); addSource('screen', 'One user-selected screen snapshot'); addStep('screen', 'Analyze one approved frame locally', 'read');
    if (!visionReady) warn('vision-not-ready', 'Local vision is not ready; install/configure a vision-capable Ollama model before EXPLAIN VIEW.');
  }
  if (artifactType) {
    addCapability('office-artifact', `Local ${artifactType.toUpperCase()} artifact`, 'creative'); addSource('artifact-studio', 'Private local Office artifact workspace'); addStep('artifact', `Generate a local ${artifactType.toUpperCase()} file for review`, 'local');
  }
  if (has(text, /\b(?:pdf|ocr|compress|repair pdf|convert pdf)\b/)) {
    addCapability('stirling-pdf', 'Stirling PDF processing', 'creative', stirlingConfigured, true); addSource('stirling', 'Configured Stirling PDF endpoint'); addStep('stirling', 'Process only an approved local PDF path', 'local');
    if (!stirlingConfigured) warn('stirling-not-configured', 'Stirling PDF is not configured on this host.');
  }

  if (browserRestricted) {
    addCapability('browser-control', 'Private browser control', 'browser', false, false); addSource('isolated-browser', 'Dedicated browser profile');
    warn('browser-restricted', `This request includes ${browserRestricted.replaceAll('-', ' ')} and needs a separate visible approval flow.`);
  } else if (browserInteractive) {
    addCapability('browser-control', 'Private browser control', 'browser', browserControlEnabled, false); addSource('isolated-browser', 'Dedicated browser profile with live frames'); addStep('browser-control', 'Use only the exact approved browser task', 'approval'); addApproval('browser-control', 'Browser control', 'ALLOW BROWSER CONTROL', browserControlEnabled);
    if (!browserControlEnabled) warn('browser-control-disabled', 'Interactive browser control is disabled on this host.');
  } else if (websiteRequested) {
    addCapability('browser-open', 'Private browser navigation', 'browser'); addSource('isolated-browser', 'Dedicated browser profile'); addStep('browser-open', 'Open the validated public URL read-only', 'local');
  }

  if (emailKind === 'email') {
    addCapability('email-draft', 'Gmail draft', 'connector', googleConnected, true); addSource('gmail', 'Private Gmail OAuth bridge'); addStep('email-draft', 'Prepare a visible draft without sending', 'approval');
    if (!googleConnected) warn('gmail-reauthorization', 'Gmail drafting needs a live private OAuth token.');
    if (has(text, /\b(?:send|deliver|forward|mail|email)\b/)) addApproval('email-send', 'Gmail send', 'SEND EMAIL', googleConnected);
  } else if (emailKind === 'unsupported') {
    warn('external-send-blocked', 'External messages, posts, comments, and form submissions stay blocked until their own approval flow exists.');
  }

  if (has(text, /\b(?:desktop app|host app|launch application|open application)\b/)) {
    addCapability('desktop-apps', 'Host application bridge', 'workspace', desktopAppsAvailable, false); addSource('desktop-apps', 'Allow-listed host application catalog'); addStep('desktop-app', 'Show the exact app and request launch approval', 'approval'); addApproval('desktop-app', 'Host app launch', 'LAUNCH APP', desktopAppsAvailable);
    if (!desktopAppsAvailable) warn('desktop-apps-unavailable', 'No host application catalog is currently available.');
  }

  if (!capabilities.length) {
    addCapability('local-answer', 'Local JARVIS answer', 'assistant'); addStep('answer', 'Answer with the selected local model', 'read');
  }
  if (!openJarvisOnline && !ollamaOnline) warn('model-runtime-offline', 'Neither OpenJarvis nor Ollama is reachable; no model answer can complete until a local runtime is online.');
  const external = sources.some((source) => ['public-web', 'public-social', 'public-apis', 'google', 'gmail', 'isolated-browser'].includes(source.id));
  const blocked = warnings.some((item) => item.code === 'browser-restricted' || item.code === 'external-send-blocked');
  const executionMode = blocked ? 'blocked' : approvals.length ? 'approval-required' : external ? 'read-only-web' : 'read-only-local';
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    requestLength: request.length,
    route: selected.route,
    agent: selected.agent,
    model: selected.model,
    executionMode,
    localOnly: !external,
    capabilities: capabilities.slice(0, 12),
    sources: sources.slice(0, 12),
    approvals: approvals.slice(0, 8),
    steps: steps.slice(0, 12),
    warnings: warnings.slice(0, 8),
    orchestration: {
      mode: multiPurpose ? 'fan-out-then-synthesize' : 'single-specialist',
      domains: domains.slice(0, 8),
      specialistCount: domains.length,
      parallelizable: multiPurpose,
      synthesis: multiPurpose ? 'local-coordinator' : 'direct'
    },
    policy: { noSecretEntry: true, noSilentExternalMutation: true, screenFramesUserSelected: true }
  };
}
