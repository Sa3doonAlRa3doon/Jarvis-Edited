import { createKnowledgeGalaxy } from './galaxy.js';
import { GestureController } from './gesture-controller.js';
import { VoiceController } from './voice-controller.js';
import { searchCatalog } from './search-utils.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ui = {
  clock: $('#clock'), date: $('#date-label'), systemDot: $('#system-dot'), systemState: $('#system-state'),
  address: $('#node-address'), uptime: $('#uptime-value'), route: $('#active-route'),
  cpuValue: $('#cpu-value'), cpuBar: $('#cpu-bar'), cpuDetail: $('#cpu-detail'), ramValue: $('#ram-value'),
  ramBar: $('#ram-bar'), ramDetail: $('#ram-detail'), gpuValue: $('#gpu-value'), gpuBar: $('#gpu-bar'),
  gpuDetail: $('#gpu-detail'), temperatureValue: $('#temperature-value'), temperatureBar: $('#temperature-bar'),
  chart: $('#telemetry-chart'), storageList: $('#storage-list'), storageCount: $('#storage-count'),
  serviceList: $('#service-list'), serviceCount: $('#service-count'), brain: $('#brain-canvas'), coreStage: $('#core-stage'),
  coreState: $('#core-state'), coreSubtitle: $('#core-subtitle'), coreKicker: $('#core-kicker'), modelLabel: $('#model-label'), wakeState: $('#wake-state'),
  memoryState: $('#memory-state'), wakeFlash: $('#wake-flash'), messages: $('#messages'), composer: $('#composer'),
  prompt: $('#prompt'), send: $('#send-button'), voiceButton: $('#voice-button'), agentLink: $('#agent-link-state'),
  laneEyebrow: $('#lane-eyebrow'), laneTitle: $('#lane-title'), laneState: $('#lane-state'), laneFeed: $('#lane-feed'),
  traceId: $('#trace-id'), traceSteps: $('#trace-steps'), traceLatency: $('#trace-latency'),
  citationList: $('#citation-list'), citationCount: $('#citation-count'), dockerList: $('#docker-list'),
  dockerSummary: $('#docker-summary'), eventFeed: $('#event-feed'), eventTotal: $('#event-total'),
  maintenanceState: $('#maintenance-state'), operationDialog: $('#operation-dialog'), operationForm: $('#operation-form'),
  operationTitle: $('#operation-title'), operationDescription: $('#operation-description'), operationPin: $('#operation-pin'),
  operationConfirmation: $('#operation-confirmation'), confirmationPhrase: $('#confirmation-phrase'),
  operationError: $('#operation-error'), confirmOperation: $('#confirm-operation'), operationClose: $('#operation-close'), galaxyState: $('#galaxy-state'),
  nodeInspector: $('#node-inspector'), gestureButton: $('#gesture-button'), gestureFeed: $('#gesture-feed'),
  gestureVideo: $('#gesture-video'), gestureCanvas: $('#gesture-canvas'), gestureCursor: $('#gesture-cursor'), gestureState: $('#gesture-state'),
  printerState: $('#printer-state'), printerFile: $('#printer-file'), printerEta: $('#printer-eta'),
  printerProgress: $('#printer-progress'), printerPercent: $('#printer-percent'), printerTemps: $('#printer-temps'),
  fullscreenButton: $('#fullscreen-button'), fullscreenGate: $('#fullscreen-gate'), coreLayer: $('#core-layer'),
  coreLink: $('#core-link'), coreHealth: $('#core-health'), reactorScan: $('#reactor-scan'),
  searchDialog: $('#jarvis-search'), searchForm: $('#jarvis-search-form'), searchInput: $('#jarvis-search-input'), searchTitle: $('#jarvis-search-title'),
  searchResults: $('#jarvis-search-results'), searchClose: $('#jarvis-search-close'), searchMode: $('#jarvis-search-mode'), searchCount: $('#jarvis-search-count'),
  voiceCapture: $('#jarvis-voice-capture'), voiceCaptureState: $('#jarvis-voice-capture-state'), voiceCaptureTranscript: $('#jarvis-voice-capture-transcript'),
  voiceCaptureOrb: $('.jarvis-voice-orb'), voiceCaptureMeter: $('#jarvis-voice-meter-level')
};

const state = {
  config: null, settings: null, metrics: null, status: null, storage: [], docker: null,
  agents: { lanes: { code: [], research: [], monitor: [] }, traces: [] }, events: [], eventSummary: {},
  history: [], lane: 'code', operation: null, operationKind: 'system', operationStatus: null, lastAssistant: '',
  galaxy: null, gesture: null, voice: null, printer: { configured: false, online: false, state: 'checking' },
  chart: { cpu: Array(52).fill(0), ram: Array(52).fill(0), gpu: Array(52).fill(0) },
  neuralEnergy: 0.22, coreMode: 'system', voiceState: 'standby', voiceLevel: 0, searchResults: [], searchSelection: 0,
  refreshFastPending: false, refreshSlowPending: false, pendingSpeech: null, audioPriming: false, wakeSession: 0,
  voiceCapture: { active: false, phase: 'idle', deadline: 0, ticker: 0, closeTimer: 0 }
};

const VOICE_COMMAND_TIMEOUT_MS = 15_000;

const laneLabels = {
  code: { eyebrow: 'CODEACT STREAM', title: 'Code Assistant' },
  research: { eyebrow: 'MULTI-HOP INDEX', title: 'Deep Research' },
  monitor: { eyebrow: 'PERSISTENT OPERATIVE', title: 'Continuous Monitor' }
};

const coreModes = {
  system: { layer: '01', link: 'LOCAL', health: 'NOMINAL', kicker: 'COGNITIVE NEURAL MATRIX', title: 'READY', subtitle: 'AWAITING DIRECTIVE // LOCAL INTELLIGENCE' },
  docker: { layer: '02', link: 'ENGINE', health: 'LIVE', kicker: 'CONTAINER ORCHESTRATION', title: 'DOCKER', subtitle: 'LIVE SERVICE TOPOLOGY // SELECT A NODE' },
  printer: { layer: '03', link: 'MOONRAKER', health: 'GUARDED', kicker: 'ADDITIVE MANUFACTURING CELL', title: 'FABRICATOR', subtitle: 'MOONRAKER TELEMETRY // GUARDED CONTROL' },
  agents: { layer: '04', link: 'CODEACT', health: 'SYNC', kicker: 'COORDINATED OPERATIVE LAYER', title: 'AGENTS', subtitle: 'CODEACT // RESEARCH // CONTINUOUS MONITOR' },
  research: { layer: '05', link: 'INDEX', health: 'SOURCED', kicker: 'MULTI-HOP KNOWLEDGE ENGINE', title: 'PROSPECTOR', subtitle: 'SOURCE MAP // INTERACTIVE CITATIONS' },
  memory: { layer: '06', link: 'ARCHIVE', health: 'PRIVATE', kicker: 'PERSISTENT LOCAL ARCHIVE', title: 'MEMORY', subtitle: 'COMPRESSED CONTEXT // PRIVATE STORAGE' }
};

const routeModes = {
  GENERAL: 'system', CODEACT: 'agents', RESEARCH: 'research', MONITOR: 'docker',
  MEMORY: 'memory', FABRICATOR: 'printer', CONNECTOR: 'system'
};

const dashboardSearchItems = [
  { id: 'mode-system', label: 'System Core', detail: 'Focus the central JARVIS intelligence', keywords: 'home overview health core', category: 'LAYER 01', kind: 'mode', value: 'system', priority: 100 },
  { id: 'mode-docker', label: 'Docker Matrix', detail: 'Focus containers and local services', keywords: 'compose container engine services', category: 'LAYER 02', kind: 'mode', value: 'docker', priority: 92 },
  { id: 'mode-printer', label: 'Fabricator', detail: 'Focus Moonraker and 3D printer telemetry', keywords: 'printer klipper moonraker gcode eta print', category: 'LAYER 03', kind: 'mode', value: 'printer', priority: 90 },
  { id: 'mode-agents', label: 'Agent Operatives', detail: 'Focus CodeAct and active agent traces', keywords: 'codex code openhands native openhands agents', category: 'LAYER 04', kind: 'mode', value: 'agents', priority: 88 },
  { id: 'mode-research', label: 'Deep Research', detail: 'Focus sourced research and citations', keywords: 'prospector web sources citations index', category: 'LAYER 05', kind: 'mode', value: 'research', priority: 86 },
  { id: 'mode-memory', label: 'Second Brain', detail: 'Focus private knowledge and local files', keywords: 'memory archive notes files folders knowledge', category: 'LAYER 06', kind: 'mode', value: 'memory', priority: 84 },
  { id: 'settings-all', label: 'Configuration Core', detail: 'Open the hidden JARVIS settings screen', keywords: 'settings configuration setup preferences', category: 'SETTINGS', kind: 'navigate', value: '/settings', priority: 82 },
  { id: 'settings-devices', label: 'Camera and Microphone Settings', detail: 'Choose the exact browser or Raspberry Pi devices', keywords: 'camera microphone device input video audio pi browser', category: 'SETTINGS', kind: 'navigate', value: '/settings#devices', priority: 64 },
  { id: 'settings-sensors', label: 'Live Sensor Calibration', detail: 'Test camera framing, person lock, and microphone level', keywords: 'sensor test calibration person camera mic', category: 'SETTINGS', kind: 'navigate', value: '/settings#sensors', priority: 63 },
  { id: 'settings-perception', label: 'Perception Settings', detail: 'Tune gestures, wake word, clap, and detection sensitivity', keywords: 'gesture wake hey jarvis clap person sensitivity', category: 'SETTINGS', kind: 'navigate', value: '/settings#perception', priority: 62 },
  { id: 'settings-voice', label: 'Voice Core Settings', detail: 'Tune recognition, language, microphone, and talkback', keywords: 'voice speech tts fish audio language wake accuracy', category: 'SETTINGS', kind: 'navigate', value: '/settings#voice', priority: 61 },
  { id: 'settings-interface', label: 'Interface Settings', detail: 'Change accent and preview the command screen', keywords: 'appearance visual hud color accent preview', category: 'SETTINGS', kind: 'navigate', value: '/settings#interface', priority: 60 },
  { id: 'settings-integrations', label: 'Google Integrations', detail: 'Inspect the private Google Workspace bridge', keywords: 'gmail drive calendar tasks contacts oauth google', category: 'SETTINGS', kind: 'navigate', value: '/settings#integrations', priority: 59 },
  { id: 'action-voice', label: 'Toggle Voice Listener', detail: 'Start or stop the selected microphone listener', keywords: 'speak listen microphone wake voice', category: 'ACTION', kind: 'voice', priority: 76 },
  { id: 'action-gestures', label: 'Toggle Camera Gestures', detail: 'Start or stop local hand tracking', keywords: 'camera hands pinch zoom gesture vision', category: 'ACTION', kind: 'gestures', priority: 72 },
  { id: 'action-fullscreen', label: 'Toggle Fullscreen', detail: 'Enter or leave the immersive neural display', keywords: 'screen immersive f11 display', category: 'ACTION', kind: 'fullscreen', priority: 68 },
  { id: 'prompt-health', label: 'Ask for a Health Report', detail: 'CPU, RAM, storage, temperature, and services', keywords: 'system status cpu ram gpu storage temperature', category: 'JARVIS', kind: 'prompt', value: 'Give me a concise health report for this Pi and its services.', priority: 56 },
  { id: 'prompt-docker', label: 'Ask about Docker', detail: 'Explain containers, resource use, and unhealthy services', keywords: 'docker compose containers status', category: 'JARVIS', kind: 'prompt', value: 'Explain the current Docker containers, resource use, and anything unhealthy.', priority: 54 },
  { id: 'prompt-printer', label: 'Ask for Print ETA', detail: 'Current print progress, time left, and temperatures', keywords: 'printer print eta time nozzle bed', category: 'JARVIS', kind: 'prompt', value: 'How much time is left on my 3D print and what are the current printer temperatures?', priority: 52 }
];

function activateCoreMode(mode, { focus = false } = {}) {
  const config = coreModes[mode] || coreModes.system; const changed = state.coreMode !== mode;
  state.coreMode = mode; document.body.dataset.coreMode = mode;
  ui.coreKicker.textContent = config.kicker; ui.coreState.textContent = config.title; ui.coreSubtitle.textContent = config.subtitle;
  ui.coreLayer.textContent = config.layer; ui.coreLink.textContent = config.link; ui.coreHealth.textContent = config.health;
  $$('button[data-core-mode]').forEach((button) => { const active = button.dataset.coreMode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  if (changed || !focus) state.galaxy?.setMode(mode);
  if (focus) { const button = $(`button[data-core-mode="${mode}"]`); if (button?.dataset.node) state.galaxy?.selectById(button.dataset.node); }
}

function pulseCore() {
  ui.coreStage?.classList.remove('scan-burst');
  void ui.coreStage?.offsetWidth;
  ui.coreStage?.classList.add('scan-burst');
  activateCoreMode(state.coreMode, { focus: true });
  window.setTimeout(() => ui.coreStage?.classList.remove('scan-burst'), 1250);
}

const operationCopy = {
  repair: { title: 'Constrained self-repair', confirmation: 'REPAIR SERVICES', description: 'Restarts only failed allow-listed JARVIS services and previously saved Docker containers. It never runs AI-generated shell commands.' },
  'restart-all': { title: 'Restart the JARVIS stack', confirmation: 'RESTART ALL', description: 'Restarts Ollama, OpenJarvis, Hatclanker when installed, plus the exact containers saved by maintenance mode. The dashboard stays online.' },
  'stop-until-reboot': { title: 'Stop until next reboot', confirmation: 'STOP UNTIL REBOOT', description: 'Stops the allow-listed services and all currently running Docker containers. A runtime lock disappears automatically at the next reboot.' },
  'maintenance-on': { title: 'Persistent maintenance stop', confirmation: 'ENTER MAINTENANCE', description: 'Stops the allow-listed services and running containers and leaves a persistent lock, so they remain stopped after reboot until you press Resume.' },
  resume: { title: 'Resume services', confirmation: 'RESUME SERVICES', description: 'Removes both maintenance locks, starts the allow-listed services, and restarts only the Docker containers captured before maintenance.' }
};
const printerCopy = {
  pause: { title: 'Pause the active 3D print', confirmation: 'PAUSE PRINT', description: 'Requests a Moonraker pause for the currently active job. The printer URL is fixed on the Pi and cannot be changed here.' },
  resume: { title: 'Resume the paused 3D print', confirmation: 'RESUME PRINT', description: 'Requests a Moonraker resume for a paused job after the control PIN and exact confirmation.' },
  cancel: { title: 'End the active 3D print', confirmation: 'CANCEL PRINT', description: 'Destructive: permanently cancels the active print. JARVIS never performs this automatically or from model output.' }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
function safeCitationUrl(value) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function percent(value) { return `${Math.round(Number(value) || 0)}%`; }
function bytes(value) {
  const number = Number(value) || 0;
  if (!number) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(number) / Math.log(1024)));
  return `${(number / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}
function duration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function compactDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '--';
  const value = Math.max(0, Math.round(Number(seconds))); const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60);
  return hours ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}
function timeLabel(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString('en-GB', { hour12: false });
}
async function json(url, options) {
  const response = await (window.jarvisFetch || fetch)(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function pollJson(url, timeoutMs) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await json(url, { signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function liveSearchItems() {
  const items = [...dashboardSearchItems];
  const services = state.status?.services || {};
  const liveServices = [
    { id: 'openjarvis', label: 'OpenJarvis API', detail: services.openjarvis?.online ? 'Online and reachable' : services.openjarvis?.detail || 'Offline', keywords: 'api agent codeact', value: 'system-agents', mode: 'agents', online: services.openjarvis?.online },
    { id: 'ollama', label: 'Ollama Runtime', detail: services.ollama?.online ? `${services.ollama.models?.length || 0} local models installed` : 'Offline', keywords: 'model llm local inference', value: 'system-system', mode: 'system', online: services.ollama?.online },
    { id: 'google', label: 'Google Workspace', detail: state.status?.google?.connected ? 'Private OAuth bridge connected' : 'Not connected', keywords: 'gmail drive calendar tasks contacts oauth', value: 'system-google', mode: 'system', online: state.status?.google?.connected },
    { id: 'wake', label: 'Wake Listener', detail: state.status?.wake?.ready ? 'Hey JARVIS is listening' : state.status?.wake?.configured ? 'Starting' : 'Standby', keywords: 'voice microphone clap openwakeword', value: 'system-system', mode: 'system', online: state.status?.wake?.ready }
  ];
  for (const service of liveServices) items.push({ ...service, id: `live-${service.id}`, category: service.online ? 'ONLINE' : 'OFFLINE', kind: 'node', priority: 48 });

  for (const model of services.ollama?.models || []) items.push({ id: `model-${model}`, label: model, detail: 'Installed local Ollama model', keywords: `ollama llm artificial intelligence ${model}`, category: 'MODEL', kind: 'node', value: 'system-system', mode: 'system', priority: 40 });
  for (const device of state.storage || []) {
    const label = device.model || device.name;
    if (!label) continue;
    items.push({ id: `storage-${device.name || label}`, label, detail: `${device.mountpoints?.join(', ') || device.type || 'storage'} // ${bytes(device.size)}`, keywords: `disk drive storage volume ${device.transport || ''}`, category: 'STORAGE', kind: 'mode', value: 'system', priority: 32 });
  }
  for (const container of state.docker?.containers || []) items.push({
    id: `container-${container.id || container.name}`, label: container.name || container.id || 'Docker container',
    detail: `${String(container.state || 'unknown').toUpperCase()} // ${container.cpu || 'CPU --'} // ${container.memoryPercent || container.status || 'MEM --'}`,
    keywords: `docker compose container ${container.image || ''} ${container.status || ''}`, category: 'CONTAINER', kind: 'mode', value: 'docker', priority: 36
  });
  for (const node of state.galaxy?.getSearchItems?.() || []) items.push({ ...node, id: `node-${node.id}`, kind: 'node', value: node.id, mode: node.category === 'KNOWLEDGE' ? 'memory' : '', priority: node.category === 'KNOWLEDGE' ? 30 : 34 });

  return items;
}

function setSearchSelection(index, { scroll = true } = {}) {
  if (!state.searchResults.length) { state.searchSelection = 0; return; }
  state.searchSelection = (index + state.searchResults.length) % state.searchResults.length;
  const buttons = [...ui.searchResults.querySelectorAll('[data-search-index]')];
  buttons.forEach((button, itemIndex) => {
    const selected = itemIndex === state.searchSelection;
    button.classList.toggle('selected', selected); button.setAttribute('aria-selected', String(selected));
  });
  const active = buttons[state.searchSelection];
  if (active) {
    ui.searchInput.setAttribute('aria-activedescendant', active.id);
    if (scroll) active.scrollIntoView({ block: 'nearest' });
  }
}

function renderSearchResults({ resetSelection = false } = {}) {
  if (state.voiceCapture.active) return;
  const query = ui.searchInput.value.trim();
  state.searchResults = searchCatalog(liveSearchItems(), query, { limit: query ? 9 : 10 });
  if (query) state.searchResults.push({ id: 'ask-current-query', label: `Ask JARVIS about “${query.slice(0, 80)}”`, detail: 'Send the full query to the selected local AI role', category: 'LOCAL AI', kind: 'ask', value: query });
  if (resetSelection) state.searchSelection = 0;
  state.searchSelection = Math.min(state.searchSelection, Math.max(0, state.searchResults.length - 1));
  ui.searchMode.textContent = query ? `INDEX QUERY // ${query.slice(0, 40).toUpperCase()}` : 'QUICK ACCESS';
  ui.searchCount.textContent = `${state.searchResults.length} RESULT${state.searchResults.length === 1 ? '' : 'S'}`;
  const fragment = document.createDocumentFragment();
  state.searchResults.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.id = `jarvis-search-result-${index}`; button.dataset.searchIndex = String(index); button.setAttribute('role', 'option');
    const number = document.createElement('i'); number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span'); const label = document.createElement('strong'); const detail = document.createElement('small');
    label.textContent = item.label; detail.textContent = item.detail || 'Open'; copy.append(label, detail);
    const category = document.createElement('b'); category.textContent = item.category || 'INDEX';
    button.append(number, copy, category);
    button.addEventListener('pointermove', () => setSearchSelection(index, { scroll: false }));
    button.addEventListener('click', () => executeSearchItem(item));
    fragment.append(button);
  });
  ui.searchResults.replaceChildren(fragment);
  setSearchSelection(state.searchSelection, { scroll: false });
}

function stopVoiceCaptureTimers() {
  clearInterval(state.voiceCapture.ticker); clearTimeout(state.voiceCapture.closeTimer);
  state.voiceCapture.ticker = 0; state.voiceCapture.closeTimer = 0; state.voiceCapture.deadline = 0;
}

function resetSearchPresentation() {
  delete ui.searchDialog.dataset.voiceCommand; delete ui.searchDialog.dataset.capturePhase;
  ui.searchTitle.textContent = 'JARVIS SEARCH'; ui.searchInput.readOnly = false;
  ui.searchInput.placeholder = 'Search files, services, actions, or ask JARVIS…'; ui.voiceCapture.hidden = true; ui.searchResults.hidden = false;
}

function startVoiceCaptureCountdown(timeoutMs = VOICE_COMMAND_TIMEOUT_MS) {
  clearInterval(state.voiceCapture.ticker); state.voiceCapture.deadline = Date.now() + timeoutMs;
  const render = () => {
    if (!state.voiceCapture.active || !state.voiceCapture.deadline) return;
    const remaining = Math.max(0, state.voiceCapture.deadline - Date.now());
    ui.searchCount.textContent = `${(remaining / 1000).toFixed(1)}S`;
  };
  render(); state.voiceCapture.ticker = window.setInterval(render, 100);
}

function openVoiceCommandWindow() {
  if (ui.operationDialog?.open) return false;
  stopVoiceCaptureTimers(); state.voiceCapture.active = true; state.voiceCapture.phase = 'acknowledging';
  if (!ui.searchDialog.open) {
    try { ui.searchDialog.showModal(); }
    catch { ui.searchDialog.setAttribute('open', ''); }
  }
  document.body.dataset.searchOpen = 'true'; ui.searchDialog.dataset.voiceCommand = 'true'; ui.searchDialog.dataset.capturePhase = 'acknowledging';
  ui.searchTitle.textContent = 'VOICE COMMAND'; ui.searchInput.value = ''; ui.searchInput.readOnly = true;
  ui.searchInput.placeholder = 'JARVIS is replying…'; ui.searchInput.removeAttribute('aria-activedescendant');
  ui.searchMode.textContent = 'VOICE SESSION // ACKNOWLEDGING'; ui.searchCount.textContent = 'WAIT';
  ui.voiceCapture.hidden = false; ui.searchResults.hidden = true; ui.voiceCaptureState.textContent = 'ACKNOWLEDGING';
  ui.voiceCaptureTranscript.textContent = 'Say your command after JARVIS replies.';
  ui.voiceCaptureMeter.style.width = '0%'; ui.voiceCaptureOrb.style.setProperty('--capture-scale', '1'); ui.voiceCaptureOrb.style.setProperty('--capture-glow', '18px');
  return true;
}

function updateVoiceCommandTranscript(text, final = false) {
  if (!state.voiceCapture.active) return;
  const transcript = String(text || '').trim(); if (!transcript) return;
  ui.searchInput.value = transcript; ui.voiceCaptureTranscript.textContent = transcript;
  ui.searchMode.textContent = final ? 'VOICE SESSION // SENTENCE READY' : 'VOICE SESSION // TRANSCRIBING';
}

function updateVoiceCapture(detail = {}) {
  if (!state.voiceCapture.active && !['listening', 'retry'].includes(detail.state)) return;
  const phase = detail.state || 'listening'; state.voiceCapture.phase = phase; ui.searchDialog.dataset.capturePhase = phase;
  if (detail.text) updateVoiceCommandTranscript(detail.text, phase === 'final' || phase === 'complete');
  if (phase === 'listening' || phase === 'retry') {
    ui.voiceCaptureState.textContent = phase === 'retry' ? 'LISTEN AGAIN' : 'LISTENING';
    ui.voiceCaptureTranscript.textContent = phase === 'retry' ? 'I detected speech but not a usable sentence. Please say it again.' : 'Listening for your question or command…';
    ui.searchInput.placeholder = 'Speak now…'; ui.searchMode.textContent = `VOICE SESSION // ${phase === 'retry' ? 'RETRY' : 'MIC LIVE'}`;
    startVoiceCaptureCountdown(Number(detail.timeoutMs) || VOICE_COMMAND_TIMEOUT_MS); return;
  }
  if (phase === 'hearing' || phase === 'transcript' || phase === 'final') {
    clearInterval(state.voiceCapture.ticker); state.voiceCapture.ticker = 0; state.voiceCapture.deadline = 0;
    ui.voiceCaptureState.textContent = phase === 'final' ? 'SENTENCE READY' : 'HEARING'; ui.searchCount.textContent = phase === 'final' ? 'FINAL' : 'CAPTURING';
    if (!detail.text && phase === 'hearing') ui.voiceCaptureTranscript.textContent = 'Keep talking. JARVIS will wait for the end of your sentence.';
    return;
  }
  if (phase === 'complete') {
    stopVoiceCaptureTimers(); ui.voiceCaptureState.textContent = 'SENDING'; ui.searchMode.textContent = 'VOICE SESSION // ROUTING'; ui.searchCount.textContent = 'READY'; return;
  }
  if (phase === 'timeout') {
    stopVoiceCaptureTimers(); ui.voiceCaptureState.textContent = 'NO SPEECH DETECTED'; ui.voiceCaptureTranscript.textContent = 'Command capture stopped. Say “Hey Jarvis” to try again.';
    ui.searchMode.textContent = 'VOICE SESSION // CLOSED'; ui.searchCount.textContent = 'TIMEOUT';
    const session = state.wakeSession;
    state.voiceCapture.closeTimer = window.setTimeout(() => { if (session === state.wakeSession) closeSearch({ cancelVoice: false }); }, 1100);
  }
}

function openSearch(initialQuery = '') {
  if (ui.operationDialog?.open) return false;
  if (state.voiceCapture.active) state.voice?.cancelCommandCapture('cancelled');
  stopVoiceCaptureTimers(); state.voiceCapture.active = false; state.voiceCapture.phase = 'idle'; resetSearchPresentation();
  if (!ui.searchDialog.open) {
    try { ui.searchDialog.showModal(); }
    catch { ui.searchDialog.setAttribute('open', ''); }
  }
  document.body.dataset.searchOpen = 'true';
  ui.searchInput.value = String(initialQuery || '').trim(); state.searchSelection = 0;
  renderSearchResults({ resetSelection: true });
  state.galaxy?.setActivity('hearing', .35);
  requestAnimationFrame(() => { ui.searchInput.focus(); ui.searchInput.select(); });
  return true;
}

function closeSearch(options = {}) {
  const cancelVoice = options?.cancelVoice !== false;
  if (state.voiceCapture.active) {
    state.voiceCapture.active = false; stopVoiceCaptureTimers();
    if (cancelVoice) state.voice?.cancelCommandCapture('cancelled');
  }
  if (!ui.searchDialog.open) return;
  try { ui.searchDialog.close(); } catch { ui.searchDialog.removeAttribute('open'); }
  delete document.body.dataset.searchOpen;
  ui.searchInput.removeAttribute('aria-activedescendant'); resetSearchPresentation();
  state.galaxy?.setActivity(state.voiceState, state.voiceLevel);
}

function executeSearchItem(item = state.searchResults[state.searchSelection]) {
  if (!item) return;
  closeSearch();
  if (item.kind === 'navigate') { window.location.assign(item.value); return; }
  if (item.kind === 'mode') { activateCoreMode(item.value, { focus: true }); return; }
  if (item.kind === 'node') {
    if (item.mode) activateCoreMode(item.mode);
    state.galaxy?.selectById(item.value); return;
  }
  if (item.kind === 'voice') { void toggleVoice(); return; }
  if (item.kind === 'gestures') { void toggleGestures(); return; }
  if (item.kind === 'fullscreen') { void toggleFullscreen(); return; }
  if (item.kind === 'prompt' || item.kind === 'ask') void sendPrompt(item.value);
}

function handleVoiceCommand(command) {
  const text = String(command || '').trim();
  if (state.voiceCapture.active) closeSearch({ cancelVoice: false });
  if (/^(?:open|show)(?: the)? (?:jarvis )?search$/i.test(text)) { openSearch(); return; }
  const searchMatch = text.match(/^(?:search (?:the )?dashboard for|find in jarvis)\s+(.+)$/i);
  if (searchMatch) { openSearch(searchMatch[1]); return; }
  void sendPrompt(text);
}

function refreshSearchIfOpen() { if (ui.searchDialog.open) renderSearchResults(); }

function updateClock() {
  const now = new Date();
  ui.clock.textContent = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour12: false });
  ui.date.textContent = `${now.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()} // DUBAI`;
}

function renderMetric(element, bar, value, available = true) {
  element.textContent = available ? percent(value) : 'N/A';
  bar.style.width = available ? `${Math.max(0, Math.min(100, Number(value) || 0))}%` : '0%';
}

function renderMetrics(metrics) {
  state.metrics = metrics;
  renderMetric(ui.cpuValue, ui.cpuBar, metrics.cpu?.percent);
  renderMetric(ui.ramValue, ui.ramBar, metrics.memory?.percent);
  renderMetric(ui.gpuValue, ui.gpuBar, metrics.gpu?.percent, metrics.gpu?.available);
  const temperature = metrics.temperature == null ? Number.NaN : Number(metrics.temperature);
  ui.temperatureValue.textContent = Number.isFinite(temperature) ? `${Math.round(temperature)}°` : 'N/A';
  ui.temperatureBar.style.width = Number.isFinite(temperature) ? `${Math.min(100, Math.max(0, temperature))}%` : '0%';
  ui.cpuDetail.textContent = `${metrics.cpu?.cores || 0} cores // load ${(metrics.cpu?.load?.[0] || 0).toFixed(2)}`;
  ui.ramDetail.textContent = `${bytes(metrics.memory?.used)} / ${bytes(metrics.memory?.total)}`;
  ui.gpuDetail.textContent = metrics.gpu?.available ? metrics.gpu.name : 'counter unavailable';
  ui.address.textContent = metrics.address || '127.0.0.1';
  ui.uptime.textContent = duration(metrics.uptime);
  state.chart.cpu.push(metrics.cpu?.percent || 0); state.chart.cpu.shift();
  state.chart.ram.push(metrics.memory?.percent || 0); state.chart.ram.shift();
  state.chart.gpu.push(metrics.gpu?.percent || 0); state.chart.gpu.shift();
  drawTelemetry();
}

function drawTelemetry() {
  const canvas = ui.chart; const context = canvas.getContext('2d');
  const scale = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * scale)); const height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(100,232,255,.07)'; context.lineWidth = 1;
  for (let y = 0; y <= 4; y += 1) { context.beginPath(); context.moveTo(0, (height / 4) * y); context.lineTo(width, (height / 4) * y); context.stroke(); }
  const plot = (values, color, alpha) => {
    context.beginPath(); values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * width; const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }); context.strokeStyle = color; context.globalAlpha = alpha; context.lineWidth = 1.3 * scale; context.stroke(); context.globalAlpha = 1;
  };
  plot(state.chart.cpu, '#64e8ff', .95); plot(state.chart.ram, '#71ffca', .58); plot(state.chart.gpu, '#f5bd5c', .5);
}

function renderStorage(devices) {
  state.storage = devices;
  const visible = devices.filter((item) => item.mountpoints?.length || ['disk', 'rom'].includes(item.type)).slice(0, 7);
  ui.storageCount.textContent = String(visible.length);
  ui.storageList.innerHTML = visible.length ? visible.map((item) => {
    const used = item.used || Math.max(0, (item.size || 0) - (item.free || item.size || 0));
    const label = item.model || item.name; const mounts = item.mountpoints?.join(', ') || item.type;
    return `<article class="storage-item"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(mounts)} // ${escapeHtml(item.transport || 'local')}</span></div><b>${bytes(used)} / ${bytes(item.size)}</b></article>`;
  }).join('') : '<p class="empty-state">No mounted storage was reported.</p>';
  refreshSearchIfOpen();
}

function renderStatus(payload) {
  state.status = payload;
  const services = [
    { name: 'OpenJarvis', ok: payload.services?.openjarvis?.online, detail: payload.services?.openjarvis?.detail || 'offline' },
    { name: 'Ollama runtime', ok: payload.services?.ollama?.online, detail: `${payload.services?.ollama?.models?.length || 0} models` },
    { name: 'Google Workspace', ok: payload.google?.connected, detail: payload.google?.connected ? 'OAuth linked' : 'not linked' },
    { name: 'Local wake listener', ok: payload.wake?.ready, detail: payload.wake?.model ? 'Hey Jarvis + clap' : payload.wake?.running ? 'clap only' : 'standby' }
  ];
  const online = services.filter((item) => item.ok).length;
  ui.serviceCount.textContent = `${online}/${services.length}`;
  ui.serviceList.innerHTML = services.map((item) => `<article class="service-item"><i class="${item.ok ? 'ok' : ''}"></i><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.detail)}</span></div><b>${item.ok ? 'ONLINE' : 'OFFLINE'}</b></article>`).join('');
  const healthy = payload.services?.openjarvis?.online && payload.services?.ollama?.online;
  ui.systemDot.className = healthy ? 'online' : 'warning'; ui.systemState.textContent = healthy ? 'SYSTEM NOMINAL' : 'DEGRADED';
  if (state.coreMode === 'system') ui.coreSubtitle.textContent = healthy ? 'SPEAK // PINCH // INSPECT // COMMAND' : 'VISUAL CORE READY // MODEL SERVICES STANDBY';
  ui.modelLabel.textContent = payload.services?.ollama?.models?.[0] || 'NO MODEL';
  ui.wakeState.textContent = payload.wake?.ready ? 'LISTENING' : payload.wake?.configured ? 'STARTING' : 'STANDBY';
  state.neuralEnergy = healthy ? .42 : .18;
  renderOperationStatus(payload.operations);
  refreshSearchIfOpen();
}

function renderOperationStatus(operations) {
  state.operationStatus = operations;
  const maintenance = operations?.maintenancePersistent ? 'PERSISTENT STOP' : operations?.maintenanceUntilReboot ? 'STOPPED UNTIL REBOOT' : operations?.available ? 'ARMED' : 'PI ONLY';
  ui.maintenanceState.textContent = maintenance;
  $$('[data-operation]').forEach((button) => { button.disabled = !operations?.available; });
}

function renderDocker(payload) {
  state.docker = payload;
  if (!payload.available) { ui.dockerSummary.textContent = 'UNAVAILABLE'; ui.dockerList.innerHTML = '<p class="empty-state">Docker engine is not available on this host.</p>'; refreshSearchIfOpen(); return; }
  const running = payload.containers.filter((item) => String(item.state).toLowerCase() === 'running').length;
  ui.dockerSummary.textContent = `${running}/${payload.containers.length} RUNNING`;
  ui.dockerList.innerHTML = payload.containers.length ? payload.containers.slice(0, 8).map((item) => `<article class="docker-item"><i class="${String(item.state).toLowerCase() === 'running' ? 'ok' : ''}"></i><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.cpu || item.state)}</span><b>${escapeHtml(item.memoryPercent || item.status)}</b></article>`).join('') : '<p class="empty-state">Docker is online with no containers.</p>';
  refreshSearchIfOpen();
}

function renderPrinter(payload) {
  state.printer = payload || state.printer;
  const online = Boolean(payload?.online); const progress = Math.round((Number(payload?.progress) || 0) * 100);
  ui.printerState.textContent = payload?.configured === false ? 'NOT SET' : online ? String(payload.state || 'online').toUpperCase() : 'OFFLINE';
  ui.printerState.style.color = online ? 'var(--mint)' : '';
  ui.printerFile.textContent = payload?.filename || (online ? 'NO ACTIVE FILE' : 'PRINTER OFFLINE');
  ui.printerEta.textContent = `ETA ${compactDuration(payload?.remaining)}`;
  ui.printerProgress.style.width = `${progress}%`; ui.printerPercent.textContent = `${progress}%`;
  const temperatures = payload?.temperatures || {};
  ui.printerTemps.textContent = online ? `N ${Math.round(temperatures.nozzle || 0)}°/${Math.round(temperatures.nozzleTarget || 0)}° · B ${Math.round(temperatures.bed || 0)}°/${Math.round(temperatures.bedTarget || 0)}°` : 'NOZZLE -- / BED --';
  $$('[data-printer]').forEach((button) => {
    const action = button.dataset.printer;
    button.disabled = !online || (action === 'pause' && payload.state !== 'printing') || (action === 'resume' && payload.state !== 'paused') || (action === 'cancel' && !['printing', 'paused'].includes(payload.state));
  });
  refreshSearchIfOpen();
}

function renderAgents(payload) {
  state.agents = payload;
  ui.agentLink.textContent = payload.online ? 'LIVE' : 'OFFLINE';
  ui.memoryState.textContent = payload.memory?.entries != null ? `${payload.memory.entries} ITEMS` : 'LOCAL';
  renderLane();
}

function renderLane() {
  const meta = laneLabels[state.lane]; const traces = state.agents?.lanes?.[state.lane] || []; const trace = traces[0];
  ui.laneEyebrow.textContent = meta.eyebrow; ui.laneTitle.textContent = meta.title;
  $$('.lane-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.lane === state.lane));
  if (!trace) {
    ui.laneState.textContent = 'WAITING'; ui.laneState.parentElement.classList.remove('active'); ui.traceId.textContent = '—'; ui.traceSteps.textContent = '0'; ui.traceLatency.textContent = '0 ms';
    ui.laneFeed.innerHTML = `<p class="empty-state">Waiting for ${escapeHtml(meta.title)} traces from OpenJarvis. This panel shows tool calls and results, not private model chain-of-thought.</p>`;
    renderCitations([]); return;
  }
  const recent = trace.createdAt && Date.now() - new Date(trace.createdAt).getTime() < 120_000;
  ui.laneState.textContent = recent ? 'ACTIVE' : trace.success ? 'COMPLETE' : 'FAILED'; ui.laneState.parentElement.classList.toggle('active', recent || trace.success);
  ui.traceId.textContent = trace.id.slice(0, 10); ui.traceSteps.textContent = String(trace.steps.length); ui.traceLatency.textContent = `${Math.round(trace.durationMs)} ms`;
  const steps = trace.steps.length ? trace.steps : [{ type: 'result', tool: trace.agent, content: trace.output || trace.input, durationMs: trace.durationMs, success: trace.success }];
  ui.laneFeed.innerHTML = steps.slice(-18).map((step, index) => `<article class="trace-step"><i>${String(index + 1).padStart(2, '0')}</i><div><strong>${escapeHtml(step.tool || step.type)}</strong>${step.content ? `<p>${escapeHtml(step.content)}</p>` : ''}</div><span>${step.durationMs ? `${Math.round(step.durationMs)}ms` : step.success ? 'OK' : 'ERR'}</span></article>`).join('');
  const researchTrace = (state.agents?.lanes?.research || [])[0]; renderCitations(state.lane === 'research' ? trace.citations : researchTrace?.citations || []);
}

function renderCitations(citations) {
  const safeCitations = citations.map(safeCitationUrl).filter(Boolean);
  ui.citationCount.textContent = String(safeCitations.length);
  ui.citationList.innerHTML = safeCitations.length ? safeCitations.map((url, index) => `<a class="citation-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">[${index + 1}] ${escapeHtml(url)}</a>`).join('') : '<p class="empty-state">Research links appear here.</p>';
}

function renderEvents() {
  const compacted = Number(state.eventSummary?.compacted || 0); ui.eventTotal.textContent = `MEMORY ${state.events.length + compacted}`;
  ui.eventFeed.innerHTML = state.events.length ? state.events.slice(0, 20).map((event) => `<article class="event-item"><time>${timeLabel(event.at)}</time><b>${escapeHtml(event.type)}</b><span>${escapeHtml(event.message)}</span></article>`).join('') : '<p class="empty-state">Persistent local activity log ready.</p>';
}

function addEvent(event) {
  if (state.events.some((item) => item.id === event.id)) return;
  state.events.unshift(event); state.events = state.events.slice(0, 120); renderEvents();
  if (event.type === 'wake') handleWake(event);
}

function appendMessage(role, content, source = '') {
  const article = document.createElement('article'); article.className = `message ${role}`;
  article.innerHTML = `<span>${role === 'user' ? 'U' : role === 'error' ? '!' : 'J'}</span><div><b>${role === 'user' ? 'YOU' : role === 'error' ? 'SYSTEM' : `JARVIS${source ? ` // ${escapeHtml(source)}` : ''}`}</b><p>${escapeHtml(content)}</p></div>`;
  ui.messages.append(article); ui.messages.scrollTop = ui.messages.scrollHeight;
}

function updateVoiceVisual(mode = 'standby', level = state.voiceLevel) {
  state.voiceState = mode; state.voiceLevel = Number(level) || 0; document.body.dataset.voiceState = mode;
  ui.voiceButton?.classList.toggle('listening', state.voice?.active && ['listening', 'hearing', 'armed'].includes(mode));
  ui.voiceButton?.classList.toggle('speaking', mode === 'speaking');
  ui.voiceButton?.setAttribute('aria-pressed', String(Boolean(state.voice?.active)));
  state.galaxy?.setActivity(mode, state.voiceLevel);
}

function selectBrowserVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices(); const selected = state.settings?.ttsVoice;
  return voices.find((voice) => voice.voiceURI === selected || voice.name === selected)
    || voices.find((voice) => voice.lang === state.settings?.voiceLanguage)
    || voices.find((voice) => voice.lang?.startsWith(String(state.settings?.voiceLanguage || 'en').split('-')[0]))
    || voices[0] || null;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function requestFishSpeech(text) {
  let lastError = new Error('Fish Audio request failed.');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await (window.jarvisFetch || fetch)('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, mode: 'fish' })
      });
      if (response.ok) return { bytes: await response.arrayBuffer(), contentType: response.headers.get('content-type') || 'audio/mpeg' };
      const detail = await response.json().catch(() => ({}));
      const error = new Error(detail.error || `Fish Audio returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    } catch (error) {
      lastError = error;
      if (error?.name === 'NotAllowedError' || Number(error?.status) < 500 || attempt === 1) break;
      await wait(350);
    }
  }
  throw lastError;
}

async function speak(text, { pendingContext = null } = {}) {
  if (!state.settings?.autoSpeak || !text) return true;
  state.voice?.setSpeaking(true); updateVoiceVisual('speaking', .72);
  try {
    if (state.config?.ttsMode === 'fish') {
      document.body.dataset.ttsProvider = 'fish';
      document.body.dataset.ttsVoice = state.config.fishVoiceId || 'unconfigured';
      document.body.dataset.ttsState = 'requesting';
      try {
        const result = await requestFishSpeech(text);
        document.body.dataset.ttsState = 'playing';
        if (state.voice?.playAudio) await state.voice.playAudio(result.bytes, Number(state.settings?.ttsVolume ?? 1));
        else {
          const url = URL.createObjectURL(new Blob([result.bytes], { type: result.contentType }));
          const audio = new Audio(url); audio.volume = Number(state.settings?.ttsVolume ?? 1);
          try { await new Promise((resolve, reject) => { audio.onended = resolve; audio.onerror = reject; audio.play().catch(reject); }); }
          finally { URL.revokeObjectURL(url); }
        }
        state.pendingSpeech = null; document.body.classList.remove('audio-locked'); document.body.dataset.ttsState = 'complete'; return true;
      } catch (error) {
        if (error?.name === 'NotAllowedError') {
          state.pendingSpeech = { text, context: pendingContext }; document.body.classList.add('audio-locked'); document.body.dataset.ttsState = 'blocked'; state.galaxy?.setActivity('armed', 1); return false;
        }
        document.body.dataset.ttsState = 'error';
        console.warn(`Fish Audio playback failed without changing voices: ${error?.message || error}`);
        if (!state.config?.allowBrowserTtsFallback) { state.galaxy?.setActivity('error', 1); return false; }
      }
    }
    if ('speechSynthesis' in window) {
      document.body.dataset.ttsProvider = 'browser'; document.body.dataset.ttsVoice = selectBrowserVoice()?.voiceURI || 'system-default'; document.body.dataset.ttsState = 'requesting';
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
        state.pendingSpeech = { text, context: pendingContext }; document.body.classList.add('audio-locked'); document.body.dataset.ttsState = 'blocked'; state.galaxy?.setActivity('armed', 1); return false;
      }
      await new Promise((resolve) => {
        speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 1800));
        const timeout = setTimeout(resolve, Math.max(6000, Math.min(120_000, String(text).length * 95)));
        utterance.rate = Number(state.settings?.ttsRate ?? 1.02); utterance.pitch = Number(state.settings?.ttsPitch ?? .92); utterance.volume = Number(state.settings?.ttsVolume ?? 1);
        const voice = selectBrowserVoice(); if (voice) utterance.voice = voice;
        utterance.onstart = () => { document.body.dataset.ttsState = 'playing'; };
        utterance.onend = () => { clearTimeout(timeout); document.body.dataset.ttsState = 'complete'; resolve(); };
        utterance.onerror = () => { clearTimeout(timeout); document.body.dataset.ttsState = 'error'; resolve(); }; speechSynthesis.speak(utterance);
      });
      return document.body.dataset.ttsState === 'complete';
    }
    return false;
  } finally {
    state.voice?.setSpeaking(false);
  }
}

async function unlockAudioFromGesture() {
  if (state.audioPriming || !state.voice?.primeAudio) return;
  state.audioPriming = true;
  try {
    const ready = await state.voice.primeAudio();
    if (!ready) return;
    document.body.classList.remove('audio-locked');
    const pending = state.pendingSpeech; state.pendingSpeech = null;
    if (pending?.text) {
      const played = await speak(pending.text, { pendingContext: pending.context });
      if (played && pending.context?.kind === 'wake') await beginWakeCommandCapture(pending.context.session, pending.context.command);
    }
  } catch {}
  finally { state.audioPriming = false; }
}

async function beginWakeCommandCapture(session, initialCommand = '') {
  if (session !== state.wakeSession || !state.voiceCapture.active) return;
  try {
    if (!state.voice?.active) await state.voice?.start(state.settings);
  } catch (error) {
    stopVoiceCaptureTimers(); state.voiceCapture.phase = 'error'; ui.searchDialog.dataset.capturePhase = 'error';
    ui.voiceCaptureState.textContent = 'MICROPHONE UNAVAILABLE'; ui.voiceCaptureTranscript.textContent = error.message;
    ui.searchMode.textContent = 'VOICE SESSION // ERROR'; ui.searchCount.textContent = 'MIC OFF';
    state.voiceCapture.closeTimer = window.setTimeout(() => { if (session === state.wakeSession) closeSearch({ cancelVoice: false }); }, 2200); return;
  }
  state.voice.beginCommandCapture(VOICE_COMMAND_TIMEOUT_MS);
  if (initialCommand) {
    updateVoiceCommandTranscript(initialCommand, true); state.voice.queueCommand(initialCommand); state.voice.flushCommand();
  }
}

async function handleWake(event) {
  const session = ++state.wakeSession; const initialCommand = String(event?.detail?.command || '').trim();
  if (!openVoiceCommandWindow()) return;
  ui.wakeFlash.classList.remove('active'); void ui.wakeFlash.offsetWidth; ui.wakeFlash.classList.add('active');
  ui.wakeState.textContent = event?.detail?.kind === 'double_clap' ? 'CLAP' : 'HEARD'; state.neuralEnergy = 1;
  updateVoiceVisual('armed', 1);
  const context = { kind: 'wake', session, command: initialCommand };
  const played = isEmbeddedPreview() || !state.settings?.wakeResponse ? true : await speak(state.settings.wakeResponse, { pendingContext: context });
  if (session !== state.wakeSession || !state.voiceCapture.active) return;
  if (!played && document.body.dataset.ttsState === 'blocked') {
    ui.voiceCaptureState.textContent = 'TAP TO ENABLE AUDIO'; ui.voiceCaptureTranscript.textContent = 'Tap anywhere once. JARVIS will reply, then begin listening.';
    ui.searchMode.textContent = 'VOICE SESSION // AUDIO LOCKED'; ui.searchCount.textContent = 'WAIT'; return;
  }
  await beginWakeCommandCapture(session, initialCommand);
  setTimeout(() => { ui.wakeState.textContent = state.status?.wake?.ready ? 'LISTENING' : 'STANDBY'; }, 2200);
}

async function sendPrompt(prompt) {
  const text = String(prompt || '').trim(); if (!text || ui.send.disabled) return;
  state.galaxy?.focusFromText(text);
  const directPrinterAction = /\b(?:cancel|end|stop)\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'cancel'
    : /\bpause\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'pause'
      : /\bresume\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'resume' : '';
  if (directPrinterAction) {
    activateCoreMode('printer');
    appendMessage('user', text); appendMessage('assistant', `I opened the guarded ${directPrinterAction} control. Enter the operations PIN and type ${printerCopy[directPrinterAction].confirmation} exactly. I will not execute it automatically.`, 'LOCAL SAFETY');
    openPrinterAction(directPrinterAction); return;
  }
  appendMessage('user', text); state.history.push({ role: 'user', content: text }); state.history = state.history.slice(-16);
  ui.prompt.value = ''; ui.send.disabled = true; ui.send.innerHTML = '<span>LINK</span><b>RUNNING</b>'; state.neuralEnergy = .95; updateVoiceVisual('processing', .92);
  try {
    const result = await json('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text, history: state.history.slice(0, -1) }) });
    ui.route.textContent = result.route;
    activateCoreMode(routeModes[result.route] || 'system');
    state.lastAssistant = result.content; appendMessage('assistant', result.content, result.source); state.history.push({ role: 'assistant', content: result.content }); state.history = state.history.slice(-16); void speak(result.content);
  } catch (error) { appendMessage('error', error.message); }
  finally { ui.send.disabled = false; ui.send.innerHTML = '<span>RUN</span><b>EXECUTE</b>'; state.neuralEnergy = .42; if (state.voiceState !== 'speaking') updateVoiceVisual(state.voice?.active ? 'listening' : 'standby', .18); }
}

async function toggleVoice() {
  if (!state.voice) return;
  try {
    await state.voice.toggle(state.settings); ui.voiceButton.title = state.voice.active ? 'Stop JARVIS voice listener' : 'Start JARVIS voice listener';
  } catch (error) { appendMessage('error', `Microphone unavailable: ${error.message}`); updateVoiceVisual('error', 1); }
}

function isEmbeddedPreview() { try { return window.self !== window.top; } catch { return true; } }
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
function browserFullscreenActive() {
  const nativeViewport = Math.abs((window.screen?.height || 0) - window.innerHeight) <= 3 && Math.abs((window.screen?.width || 0) - window.innerWidth) <= 3;
  return nativeViewport || window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches;
}
function syncFullscreenUi() {
  const active = Boolean(fullscreenElement()) || browserFullscreenActive();
  ui.fullscreenButton?.classList.toggle('active', active);
  ui.fullscreenButton?.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  if (ui.fullscreenGate) ui.fullscreenGate.hidden = true;
  state.galaxy?.resize();
}
async function toggleFullscreen() {
  if (isEmbeddedPreview()) return;
  try {
    if (fullscreenElement()) await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
    else {
      const root = document.documentElement;
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      if (!request) throw new Error('this browser requires Add to Home Screen or its own fullscreen key');
      try { await request.call(root, { navigationUI: 'hide' }); }
      catch { await request.call(root); }
    }
  } catch (error) {
    document.body.classList.add('standalone-hint');
    if (ui.fullscreenGate) ui.fullscreenGate.hidden = true;
    if (ui.fullscreenButton) ui.fullscreenButton.title = 'Browser blocked page fullscreen. Press F11 or install JARVIS to the home screen.';
    console.info(`JARVIS fullscreen fallback: ${error.message}`);
  }
  syncFullscreenUi();
}

function openOperation(action) {
  const copy = operationCopy[action]; if (!copy) return;
  state.operation = action; state.operationKind = 'system'; ui.operationTitle.textContent = copy.title; ui.operationDescription.textContent = copy.description; ui.confirmationPhrase.textContent = copy.confirmation;
  ui.operationPin.value = ''; ui.operationConfirmation.value = ''; ui.operationError.textContent = ''; ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = 'RUN ON RASPBERRY PI'; ui.operationDialog.showModal(); ui.operationPin.focus();
}
function openPrinterAction(action) {
  const copy = printerCopy[action]; if (!copy) return;
  state.operation = action; state.operationKind = 'printer'; ui.operationTitle.textContent = copy.title; ui.operationDescription.textContent = copy.description; ui.confirmationPhrase.textContent = copy.confirmation;
  ui.operationPin.value = ''; ui.operationConfirmation.value = ''; ui.operationError.textContent = ''; ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = action === 'cancel' ? 'CONFIRM END PRINT' : 'SEND TO PRINTER'; ui.operationDialog.showModal(); ui.operationPin.focus();
}
async function runOperation() {
  const copy = state.operationKind === 'printer' ? printerCopy[state.operation] : operationCopy[state.operation]; if (!copy) return;
  ui.operationError.textContent = ''; ui.confirmOperation.disabled = true; ui.confirmOperation.textContent = 'EXECUTING';
  try {
    const endpoint = state.operationKind === 'printer' ? '/api/printer/action' : '/api/operations/action';
    const result = await json(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: state.operation, pin: ui.operationPin.value, confirmation: ui.operationConfirmation.value }) });
    if (state.operationKind === 'printer') renderPrinter(result.result); else renderOperationStatus(result.result);
    ui.operationDialog.close(); addEvent({ id: `local-${Date.now()}`, at: new Date().toISOString(), type: state.operationKind === 'printer' ? 'printer' : 'control', message: `${state.operation} completed`, detail: {} });
  } catch (error) { ui.operationError.textContent = error.message; }
  finally { ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = state.operationKind === 'printer' ? (state.operation === 'cancel' ? 'CONFIRM END PRINT' : 'SEND TO PRINTER') : 'RUN ON RASPBERRY PI'; }
}

function startEventStream() {
  const source = new EventSource('/api/events');
  source.addEventListener('snapshot', (event) => { const payload = JSON.parse(event.data); state.events = payload.events || []; state.eventSummary = payload.summary || {}; renderEvents(); });
  source.addEventListener('activity', (event) => addEvent(JSON.parse(event.data)));
}
function startPrinterStream() {
  const source = new EventSource('/api/printer/events');
  source.addEventListener('printer', (event) => renderPrinter(JSON.parse(event.data)));
  source.addEventListener('error', () => { if (source.readyState === EventSource.CLOSED) setTimeout(() => void json('/api/printer/status').then(renderPrinter).catch(() => {}), 2500); });
}

async function refreshFast({ force = false } = {}) {
  if (state.refreshFastPending || document.hidden && !force) return;
  state.refreshFastPending = true;
  try {
    const [metrics, status] = await Promise.allSettled([pollJson('/api/metrics', 6000), pollJson('/api/status', 7000)]);
    if (metrics.status === 'fulfilled') renderMetrics(metrics.value);
    if (status.status === 'fulfilled') renderStatus(status.value);
  } finally { state.refreshFastPending = false; }
}
async function refreshSlow({ force = false } = {}) {
  if (state.refreshSlowPending || document.hidden && !force) return;
  state.refreshSlowPending = true;
  try {
    const [storage, docker, agents] = await Promise.allSettled([pollJson('/api/storage', 8000), pollJson('/api/docker', 10_000), pollJson('/api/agents', 8000)]);
    if (storage.status === 'fulfilled') renderStorage(storage.value.devices || []);
    if (docker.status === 'fulfilled') renderDocker(docker.value);
    if (agents.status === 'fulfilled') renderAgents(agents.value);
  } finally { state.refreshSlowPending = false; }
}

async function toggleGestures() {
  if (!state.gesture) return;
  if (state.gesture.active) { await state.gesture.stop(); ui.gestureButton.classList.remove('active'); ui.gestureButton.textContent = 'ENABLE GESTURES'; ui.gestureFeed.hidden = true; return; }
  if (state.settings?.gestureControl === false) { appendMessage('error', 'Gesture control is disabled in /settings.'); return; }
  ui.gestureFeed.hidden = false; ui.gestureButton.disabled = true;
  try {
    await state.gesture.start({ deviceId: state.settings?.browserCamera || '', sensitivity: state.settings?.gestureSensitivity || .42 });
    ui.gestureButton.classList.add('active'); ui.gestureButton.textContent = 'STOP GESTURES';
  } catch (error) { ui.gestureFeed.hidden = true; appendMessage('error', `Gesture camera unavailable: ${error.message}`); }
  finally { ui.gestureButton.disabled = false; }
}

async function autoStartGesturesIfGranted() {
  if (isEmbeddedPreview() || state.settings?.source !== 'browser' || state.settings?.gestureControl === false || !navigator.permissions?.query) return false;
  try {
    const permission = await navigator.permissions.query({ name: 'camera' });
    if (permission.state !== 'granted') return false;
    await toggleGestures(); return Boolean(state.gesture?.active);
  } catch { return false; }
}

ui.composer.addEventListener('submit', (event) => { event.preventDefault(); void sendPrompt(ui.prompt.value); });
ui.prompt.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ui.composer.requestSubmit(); } });
ui.voiceButton.addEventListener('click', () => void toggleVoice());
$$('[data-prompt]').forEach((button) => button.addEventListener('click', () => void sendPrompt(button.dataset.prompt)));
$$('button[data-core-mode]').forEach((button) => button.addEventListener('click', () => activateCoreMode(button.dataset.coreMode, { focus: true })));
$$('.lane-tabs button').forEach((button) => button.addEventListener('click', () => { state.lane = button.dataset.lane; renderLane(); }));
$$('[data-operation]').forEach((button) => button.addEventListener('click', () => openOperation(button.dataset.operation)));
$$('[data-printer]').forEach((button) => button.addEventListener('click', () => openPrinterAction(button.dataset.printer)));
ui.gestureButton.addEventListener('click', () => void toggleGestures());
ui.fullscreenButton?.addEventListener('click', () => void toggleFullscreen());
ui.fullscreenGate?.addEventListener('click', () => void toggleFullscreen());
ui.reactorScan?.addEventListener('click', pulseCore);
ui.searchForm.addEventListener('submit', (event) => { event.preventDefault(); if (!state.voiceCapture.active) executeSearchItem(); });
ui.searchInput.addEventListener('input', () => { if (!state.voiceCapture.active) renderSearchResults({ resetSelection: true }); });
ui.searchClose.addEventListener('click', closeSearch);
ui.searchDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeSearch(); });
ui.searchDialog.addEventListener('pointerdown', (event) => { if (event.target === ui.searchDialog) closeSearch(); });
ui.operationForm.addEventListener('submit', (event) => { event.preventDefault(); void runOperation(); });
ui.operationClose.addEventListener('click', () => ui.operationDialog.close());
window.addEventListener('resize', () => { syncFullscreenUi(); drawTelemetry(); });
document.addEventListener('fullscreenchange', syncFullscreenUi);
document.addEventListener('webkitfullscreenchange', syncFullscreenUi);
window.addEventListener('message', (event) => { if (event.origin === location.origin && event.data?.type === 'jarvis-settings-preview') { state.settings = { ...state.settings, ...event.data.settings }; state.voice?.configure(state.settings); document.documentElement.style.setProperty('--accent', state.settings.accent); } });
window.addEventListener('keydown', (event) => {
  const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
  if (shortcut) { event.preventDefault(); openSearch(ui.searchDialog.open ? ui.searchInput.value : ''); return; }
  if (ui.searchDialog.open) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSearchSelection(state.searchSelection + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setSearchSelection(state.searchSelection - 1); }
    else if (event.key === 'Escape') { event.preventDefault(); closeSearch(); }
    return;
  }
  const editable = event.target?.matches('input,textarea,select,[contenteditable="true"]');
  if (!editable && event.key === '/') { event.preventDefault(); openSearch(); return; }
  if (editable) return;
  if (event.key.toLowerCase() === 'v') void toggleVoice();
  if (event.key.toLowerCase() === 'g') void toggleGestures();
  if (event.key === 'Escape') { void state.voice?.stop(); void state.gesture?.stop(); }
});
window.addEventListener('beforeunload', () => { void state.voice?.stop(); void state.gesture?.stop(); });
document.addEventListener('pointerdown', () => void unlockAudioFromGesture(), { capture: true });
document.addEventListener('keydown', () => void unlockAudioFromGesture(), { capture: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { void refreshFast({ force: true }); void refreshSlow({ force: true }); }
});

async function init() {
  updateClock(); setInterval(updateClock, 1000);
  await window.ensureDashboardAuthentication?.();
  syncFullscreenUi();
  startEventStream(); startPrinterStream();
  const [config, settings] = await Promise.allSettled([json('/api/config'), json('/api/settings')]);
  if (config.status === 'fulfilled') state.config = config.value;
  if (settings.status === 'fulfilled') { state.settings = settings.value; document.documentElement.style.setProperty('--accent', state.settings.accent); }
  state.galaxy = await createKnowledgeGalaxy({ canvas: ui.brain, inspector: ui.nodeInspector, onStatus: (message) => { ui.galaxyState.textContent = message; }, onLongPress: () => openSearch() });
  activateCoreMode('system');
  state.voice = new VoiceController({
    onState: (mode) => updateVoiceVisual(mode),
    onLevel: ({ level }) => {
      state.voiceLevel = level; state.galaxy?.setAudioLevel(level);
      if (state.voiceCapture.active) {
        const shown = Math.max(0, Math.min(1, Number(level) || 0)); ui.voiceCaptureMeter.style.width = `${Math.round(shown * 100)}%`;
        ui.voiceCaptureOrb.style.setProperty('--capture-scale', String(1 + shown * .32)); ui.voiceCaptureOrb.style.setProperty('--capture-glow', `${Math.round(18 + shown * 34)}px`);
      }
    },
    onWake: (detail) => void handleWake({ detail }),
    onCommand: handleVoiceCommand,
    onTranscript: ({ text, final }) => {
      if (state.voiceCapture.active) { updateVoiceCommandTranscript(text, final); return; }
      if (!final) return;
      if (ui.searchDialog.open) { ui.searchInput.value = text; renderSearchResults({ resetSelection: true }); }
      else if (ui.prompt) ui.prompt.value = text;
    },
    onCapture: updateVoiceCapture,
    onError: (error) => { appendMessage('error', error.message); updateVoiceVisual('error', 1); }
  });
  state.voice.configure(state.settings || {});
  updateVoiceVisual('standby', .12);
  state.gesture = new GestureController({
    video: ui.gestureVideo, canvas: ui.gestureCanvas, cursor: ui.gestureCursor,
    onGesture: (gesture) => state.galaxy?.gesture(gesture), onStatus: (message) => { ui.gestureState.textContent = message; }
  });
  if (!isEmbeddedPreview()) void state.voice.autoStartIfGranted(state.settings).catch(() => {});
  if (!isEmbeddedPreview()) void autoStartGesturesIfGranted();
  await Promise.all([refreshFast({ force: true }), refreshSlow({ force: true })]);
  setInterval(() => void refreshFast(), 2500); setInterval(() => void refreshSlow(), 7000);
}

void init();
