import { createKnowledgeGalaxy } from './galaxy.js';
import { GestureController } from './gesture-controller.js';
import { VoiceController } from './voice-controller.js';
import { searchCatalog } from './search-utils.js';
import { shouldApplyTranscriptToInput } from './voice-utils.js';
import { hasWakeCommand, normalizeWakeCommand } from './wake-command.js';
import { wakeCaptureLabel } from './wake-state.js';

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
  coreState: $('#core-state'), coreSubtitle: $('#core-subtitle'), coreKicker: $('#core-kicker'), modelLabel: $('#model-label'), wakeState: $('#wake-state'), missionState: $('#mission-state'), missionInspect: $('#mission-inspect'),
  memoryState: $('#memory-state'), wakeFlash: $('#wake-flash'), messages: $('#messages'), composer: $('#composer'),
  prompt: $('#prompt'), send: $('#send-button'), voiceButton: $('#voice-button'), voiceDeckState: $('#voice-deck-state'), agentLink: $('#agent-link-state'),
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
  coreLink: $('#core-link'), coreHealth: $('#core-health'), reactorScan: $('#reactor-scan'), missionInspectCore: $('#mission-inspect-core'),
  searchDialog: $('#jarvis-search'), searchForm: $('#jarvis-search-form'), searchInput: $('#jarvis-search-input'), searchTitle: $('#jarvis-search-title'),
  searchResults: $('#jarvis-search-results'), searchClose: $('#jarvis-search-close'), searchMode: $('#jarvis-search-mode'), searchCount: $('#jarvis-search-count'),
  voiceCapture: $('#jarvis-voice-capture'), voiceCaptureState: $('#jarvis-voice-capture-state'), voiceCaptureTranscript: $('#jarvis-voice-capture-transcript'),
  voiceCaptureOrb: $('.jarvis-voice-orb'), voiceCaptureMeter: $('#jarvis-voice-meter-level'),
  agentLiveView: $('#agent-live-view'), agentLiveState: $('#agent-live-state'), agentLiveFrame: $('#agent-live-frame'),
  agentLivePlaceholder: $('#agent-live-placeholder'), agentLiveTool: $('#agent-live-tool'), agentLiveTime: $('#agent-live-time'),
  emailDialog: $('#email-dialog'), emailForm: $('#email-form'), emailClose: $('#email-close'), emailTo: $('#email-to'),
  emailSubject: $('#email-subject'), emailBody: $('#email-body'), emailPin: $('#email-pin'), emailConfirmation: $('#email-confirmation'),
  emailError: $('#email-error'), emailSafety: $('#email-safety'), confirmEmail: $('#confirm-email'),
  browserControlDialog: $('#browser-control-dialog'), browserControlForm: $('#browser-control-form'), browserControlClose: $('#browser-control-close'),
  browserControlTask: $('#browser-control-task'), browserControlSafety: $('#browser-control-safety'), browserControlPin: $('#browser-control-pin'),
  browserControlConfirmation: $('#browser-control-confirmation'), browserControlError: $('#browser-control-error'), confirmBrowserControl: $('#confirm-browser-control'),
  artifactDialog: $('#artifact-dialog'), artifactClose: $('#artifact-close'), artifactTitle: $('#artifact-title'), artifactSubtitle: $('#artifact-subtitle'),
  artifactType: $('#artifact-type'), artifactFile: $('#artifact-file'), artifactSize: $('#artifact-size'), artifactOutline: $('#artifact-outline'), artifactDownload: $('#artifact-download'),
  missionDialog: $('#mission-dialog'), missionClose: $('#mission-close'), missionMode: $('#mission-dialog-mode'), missionSubtitle: $('#mission-dialog-subtitle'),
  missionRoute: $('#mission-dialog-route'), missionAgent: $('#mission-dialog-agent'), missionModel: $('#mission-dialog-model'), missionScope: $('#mission-dialog-scope'), missionWorkflow: $('#mission-dialog-workflow'),
  missionCapabilityCount: $('#mission-capability-count'), missionCapabilities: $('#mission-capabilities'), missionStepCount: $('#mission-step-count'), missionSteps: $('#mission-steps'),
  missionApprovalCount: $('#mission-approval-count'), missionApprovals: $('#mission-approvals'), missionWarningCount: $('#mission-warning-count'), missionWarnings: $('#mission-warnings')
};

const state = {
  config: null, settings: null, metrics: null, status: null, storage: [], docker: null,
  agents: { lanes: { code: [], research: [], monitor: [] }, traces: [] }, events: [], eventSummary: {},
  history: [], lane: 'code', operation: null, operationKind: 'system', obsSceneName: '', obsInputName: '', obsVolumeDb: null, obsSceneItemId: null, obsEnabled: null, obsFilterName: '', obsTransitionName: '', desktopAppId: '', desktopAppName: '', operationStatus: null, lastAssistant: '',
  galaxy: null, gesture: null, voice: null, printer: { configured: false, online: false, state: 'checking' },
  chart: { cpu: Array(52).fill(0), ram: Array(52).fill(0), gpu: Array(52).fill(0) },
  neuralEnergy: 0.22, coreMode: 'system', voiceState: 'standby', voiceLevel: 0, searchResults: [], searchSelection: 0,
  refreshFastPending: false, refreshSlowPending: false, pendingSpeech: null, audioPriming: false, wakeSession: 0, thinkingSound: null,
  voiceCapture: { active: false, phase: 'idle', deadline: 0, ticker: 0, closeTimer: 0 },
  agentLive: { pending: false, timer: 0, frameVersion: 0 }, emailDraft: null, browserRequest: null, artifact: null, missionPlan: null
};

// Small readiness marker for the local smoke harness. It is intentionally
// non-sensitive and does not expose application state; it only tells an
// authenticated browser test that the media controllers are constructed.
window.__jarvisReady = false;

// Release streams opened by this authenticated page during navigation and
// device rescans. This is a lifecycle hook only; it grants no new capability.
window.__jarvisReleaseMedia = async () => {
  try { closeSearch({ cancelVoice: true }); } catch {}
  try { await state.voice?.stop(); } catch {}
  try { await state.gesture?.stop(); } catch {}
};

const VOICE_COMMAND_TIMEOUT_MS = 15_000;
// Wake acknowledgements must not hold the command window behind a slow TTS
// provider. Normal replies keep the server's longer bounded timeout, while
// the short acknowledgement timeout lets JARVIS remain responsive and start
// listening even when Fish Audio is temporarily slow or unavailable.
const FISH_TTS_WAKE_TIMEOUT_MS = 12_000;
const FISH_TTS_REPLY_TIMEOUT_MS = 30_000;
const COMMAND_ACKNOWLEDGEMENT = 'On it, sir.';
let mediaDeviceChangeTimer = 0;

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
  MEMORY: 'memory', FABRICATOR: 'printer', CONNECTOR: 'system', BROADCAST: 'agents', MEDIA: 'system', SOCIAL: 'research'
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
  { id: 'workspace-screen', label: 'JARVIS Private Workspace', detail: 'Open JARVIS’s dedicated screen for agent, browser, printer, and service activity', keywords: 'own screen workspace private browser live agent task printer services', category: 'WORKSPACE', kind: 'navigate', value: '/workspace', priority: 78 },
  { id: 'workspace-live-view', label: 'Live Website + Camera View', detail: 'Share one display, explain one snapshot, or inspect the selected Pi camera', keywords: 'website live screen share explain compact camera pi printer current page ads paywall', category: 'WORKSPACE', kind: 'navigate', value: '/workspace', priority: 79 },
  { id: 'workspace-apps', label: 'Host App Bridge', detail: 'See the host application catalog and guarded launch rules', keywords: 'desktop app application launch calculator windows linux macos host', category: 'WORKSPACE', kind: 'navigate', value: '/settings#integrations', priority: 77 },
  { id: 'workspace-routines', label: 'Read-only Routines', detail: 'Schedule safe local health, Docker, printer, weather, news, Calendar, or briefing checks', keywords: 'routine automation schedule reminder health docker printer weather news calendar briefing digest read only', category: 'WORKSPACE', kind: 'navigate', value: '/settings#integrations', priority: 76 },
  { id: 'workspace-memory', label: 'Local Notes & Reminders', detail: 'Capture private notes and local due reminders on this host', keywords: 'notes remember reminder todo memory local private schedule', category: 'WORKSPACE', kind: 'navigate', value: '/settings#integrations', priority: 75 },
  { id: 'workspace-analytics', label: 'Local Activity Analytics', detail: 'Inspect bounded wake, tool, broadcast, and service counts', keywords: 'analytics activity events wakes commands broadcast services metrics history', category: 'WORKSPACE', kind: 'navigate', value: '/workspace#analytics', priority: 74 },
  { id: 'workspace-media', label: 'Local Media Deck', detail: 'Stage local music, ambient audio, podcasts, and track history', keywords: 'music media playlist song track podcast lofi ambient queue now playing', category: 'WORKSPACE', kind: 'navigate', value: '/settings#integrations', priority: 73 },
  { id: 'workspace-knowledge', label: 'Local Knowledge Index', detail: 'Inspect bounded project files and private knowledge roots', keywords: 'knowledge files folders project structure index archive memory second brain', category: 'WORKSPACE', kind: 'navigate', value: '/workspace', priority: 72 },
  { id: 'workspace-engineering', label: 'Architect / Critic / Debugger', detail: 'Open the bounded engineering pipeline state and evidence', keywords: 'architect critic debugger tests checks pipeline code repair verify', category: 'WORKSPACE', kind: 'navigate', value: '/workspace', priority: 70 },
  { id: 'action-voice', label: 'Toggle Voice Listener', detail: 'Start or stop the selected microphone listener', keywords: 'speak listen microphone wake voice', category: 'ACTION', kind: 'voice', priority: 76 },
  { id: 'action-ptt', label: 'Push-to-talk Voice', detail: 'Press Ctrl+Space or Ctrl+Alt+Space to open a focused 15-second command session', keywords: 'push to talk ptt keyboard shortcut microphone voice command dexter talk button', category: 'ACTION', kind: 'ptt', priority: 75 },
  { id: 'action-gestures', label: 'Toggle Camera Gestures', detail: 'Start or stop local hand tracking', keywords: 'camera hands pinch zoom gesture vision', category: 'ACTION', kind: 'gestures', priority: 72 },
  { id: 'action-mission', label: 'Mission Inspector', detail: 'View the latest route, steps, approvals, and warnings', keywords: 'mission plan preflight route approvals warnings capabilities', category: 'ACTION', kind: 'mission', priority: 71 },
  { id: 'action-fullscreen', label: 'Toggle Fullscreen', detail: 'Enter or leave the immersive neural display', keywords: 'screen immersive f11 display', category: 'ACTION', kind: 'fullscreen', priority: 68 },
  { id: 'prompt-health', label: 'Ask for a Health Report', detail: 'CPU, RAM, storage, temperature, and services', keywords: 'system status cpu ram gpu storage temperature', category: 'JARVIS', kind: 'prompt', value: 'Give me a concise health report for this Pi and its services.', priority: 56 },
  { id: 'prompt-docker', label: 'Ask about Docker', detail: 'Explain containers, resource use, and unhealthy services', keywords: 'docker compose containers status', category: 'JARVIS', kind: 'prompt', value: 'Explain the current Docker containers, resource use, and anything unhealthy.', priority: 54 },
  { id: 'prompt-printer', label: 'Ask for Print ETA', detail: 'Current print progress, time left, and temperatures', keywords: 'printer print eta time nozzle bed', category: 'JARVIS', kind: 'prompt', value: 'How much time is left on my 3D print and what are the current printer temperatures?', priority: 52 },
  { id: 'prompt-github', label: 'Research GitHub', detail: 'Find public repositories for a technical topic', keywords: 'github repository repo open source code project research', category: 'JARVIS', kind: 'prompt', value: 'Search GitHub for local Raspberry Pi voice assistant projects.', priority: 50 },
  { id: 'prompt-briefing', label: 'Run a Morning Briefing', detail: 'Health, weather, news, printer, Docker, and Calendar', keywords: 'briefing morning start day weather news calendar docker printer health', category: 'JARVIS', kind: 'prompt', value: 'Give me a morning briefing with local system health, default-location weather, current technology news, printer status, Docker status, and Google Calendar if connected.', priority: 49 },
  { id: 'prompt-map', label: 'Look Up a Place', detail: 'Keyless OpenStreetMap location and coordinates', keywords: 'map maps location coordinates nearby place geocode openstreetmap weather time', category: 'JARVIS', kind: 'prompt', value: 'Show me a map and coordinates for my default location.', priority: 48 }
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
const obsCopy = {
  'start-stream': { title: 'Start the OBS stream', confirmation: 'START STREAM', description: 'Starts the configured local OBS output only after the dashboard PIN and exact confirmation phrase. JARVIS never publishes a stream automatically.' },
  'stop-stream': { title: 'Stop the OBS stream', confirmation: 'STOP STREAM', description: 'Stops the active local OBS output only after the dashboard PIN and exact confirmation phrase.' },
  'start-record': { title: 'Start OBS recording', confirmation: 'START RECORDING', description: 'Starts the configured local OBS recording only after the dashboard PIN and exact confirmation phrase.' },
  'stop-record': { title: 'Stop OBS recording', confirmation: 'STOP RECORDING', description: 'Stops the active local OBS recording only after the dashboard PIN and exact confirmation phrase.' },
  'pause-record': { title: 'Pause OBS recording', confirmation: 'PAUSE RECORDING', description: 'Pauses the active local OBS recording only after the dashboard PIN and exact confirmation phrase.' },
  'resume-record': { title: 'Resume OBS recording', confirmation: 'RESUME RECORDING', description: 'Resumes the paused local OBS recording only after the dashboard PIN and exact confirmation phrase.' },
  'start-replay': { title: 'Start the OBS replay buffer', confirmation: 'START REPLAY BUFFER', description: 'Starts the local OBS replay buffer only after the dashboard PIN and exact confirmation phrase.' },
  'stop-replay': { title: 'Stop the OBS replay buffer', confirmation: 'STOP REPLAY BUFFER', description: 'Stops the local OBS replay buffer only after the dashboard PIN and exact confirmation phrase.' },
  'save-replay': { title: 'Save the OBS replay', confirmation: 'SAVE REPLAY', description: 'Saves the current local OBS replay buffer only after the dashboard PIN and exact confirmation phrase.' },
  'start-virtualcam': { title: 'Start the OBS virtual camera', confirmation: 'START VIRTUAL CAMERA', description: 'Starts the local OBS virtual camera only after the dashboard PIN and exact confirmation phrase.' },
  'stop-virtualcam': { title: 'Stop the OBS virtual camera', confirmation: 'STOP VIRTUAL CAMERA', description: 'Stops the local OBS virtual camera only after the dashboard PIN and exact confirmation phrase.' },
  'studio-take': { title: 'Take the OBS studio preview', confirmation: 'TAKE PREVIEW', description: 'Transitions the OBS studio preview to program only after the dashboard PIN and exact confirmation phrase.' },
  'enable-studio': { title: 'Enable OBS studio mode', confirmation: 'ENABLE STUDIO MODE', description: 'Enables OBS studio mode only after the dashboard PIN and exact confirmation phrase.' },
  'disable-studio': { title: 'Disable OBS studio mode', confirmation: 'DISABLE STUDIO MODE', description: 'Disables OBS studio mode only after the dashboard PIN and exact confirmation phrase.' },
  'refresh-browser-source': { title: 'Refresh an OBS browser source', confirmation: 'REFRESH BROWSER SOURCE', description: 'Refreshes one local OBS browser source without changing its URL or settings, only after the dashboard PIN and exact confirmation phrase.' },
  'restart-media-source': { title: 'Restart an OBS media source', confirmation: 'RESTART MEDIA SOURCE', description: 'Restarts one local OBS media source only after the dashboard PIN and exact confirmation phrase.' },
  'set-transition': { title: 'Set the OBS scene transition', confirmation: 'SET OBS TRANSITION', description: 'Selects one configured OBS transition by name only after the dashboard PIN and exact confirmation phrase.' },
  'toggle-filter': { title: 'Toggle an OBS source filter', confirmation: 'TOGGLE OBS FILTER', description: 'Enables or disables one named filter on one OBS source only after the dashboard PIN and exact confirmation phrase.' },
  'switch-scene': { title: 'Switch the OBS scene', confirmation: 'SWITCH SCENE', description: 'Switches the configured local OBS program scene only after the dashboard PIN and exact confirmation phrase.' },
  'mute-source': { title: 'Mute an OBS source', confirmation: 'MUTE SOURCE', description: 'Mutes one configured local OBS audio input only after the dashboard PIN and exact confirmation phrase.' },
  'unmute-source': { title: 'Unmute an OBS source', confirmation: 'UNMUTE SOURCE', description: 'Unmutes one configured local OBS audio input only after the dashboard PIN and exact confirmation phrase.' },
  'set-volume': { title: 'Set OBS source volume', confirmation: 'SET OBS VOLUME', description: 'Changes one configured local OBS audio input in decibels, clamped to the safe OBS range, only after the dashboard PIN and exact confirmation phrase.' },
  'toggle-source': { title: 'Toggle an OBS source', confirmation: 'TOGGLE SOURCE', description: 'Enables or disables one scene item in the configured local OBS scene only after the dashboard PIN and exact confirmation phrase.' }
};
const desktopCopy = {
  launch: { title: 'Launch a host application', confirmation: 'LAUNCH APP', description: 'Starts only an app discovered from this host’s allow-listed application catalog. JARVIS never accepts arbitrary executable paths or shell commands.' }
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
    { id: 'obs', label: 'OBS Stream Studio', detail: services.obs?.online ? `Connected${services.obs.scene ? ` // ${services.obs.scene}` : ''}` : services.obs?.configured ? services.obs?.detail || 'Offline' : 'Not configured', keywords: 'obs stream broadcast recording scene overlay twitch youtube producer', value: 'system-agents', mode: 'agents', online: services.obs?.online },
    { id: 'wake', label: 'Wake Listener', detail: state.status?.wake?.ready ? 'Hey JARVIS is listening' : state.status?.wake?.configured ? 'Starting' : 'Standby', keywords: 'voice microphone clap openwakeword', value: 'system-system', mode: 'system', online: state.status?.wake?.ready }
  ];
  if (state.status?.routines) liveServices.push({ id: 'routines', label: 'Read-only Routines', detail: `${state.status.routines.active || 0} active // ${state.status.routines.count || 0} total`, keywords: 'routine automation schedule health docker printer weather news calendar briefing', value: 'system-system', mode: 'system', online: true });
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
  if (ui.operationDialog?.open || ui.emailDialog?.open) return false;
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
  if (ui.operationDialog?.open || ui.emailDialog?.open) return false;
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
  if (item.kind === 'ptt') { beginPushToTalk(); return; }
  if (item.kind === 'gestures') { void toggleGestures(); return; }
  if (item.kind === 'mission') { openMissionInspector(); return; }
  if (item.kind === 'fullscreen') { void toggleFullscreen(); return; }
  if (item.kind === 'prompt' || item.kind === 'ask') void sendPrompt(item.value);
}

function handleVoiceCommand(command) {
  const text = String(command || '').trim();
  if (state.voiceCapture.active) closeSearch({ cancelVoice: false });
  if (/^(?:open|show)(?: the)? (?:jarvis )?search$/i.test(text)) { openSearch(); return; }
  const searchMatch = text.match(/^(?:search (?:the )?dashboard for|find in jarvis)\s+(.+)$/i);
  if (searchMatch) { openSearch(searchMatch[1]); return; }
  void sendPrompt(text, { fromVoice: true });
}

function beginPushToTalk() {
  if (state.voiceCapture.active || ui.operationDialog?.open || ui.emailDialog?.open || ui.browserControlDialog?.open) return false;
  void handleWake({ detail: { kind: 'push_to_talk', phrase: 'push to talk', score: 1 } });
  return true;
}

function missionModeLabel(value) { return String(value || 'standby').replaceAll('-', ' ').toUpperCase(); }

function missionList(container, items, renderItem, emptyText) {
  if (!container) return;
  container.replaceChildren();
  const values = Array.isArray(items) ? items : [];
  if (!values.length) {
    const empty = document.createElement('li'); empty.className = 'mission-empty'; empty.textContent = emptyText; container.append(empty); return;
  }
  for (const item of values) container.append(renderItem(item));
}

function missionItem(label, detail, tag = '') {
  const item = document.createElement('li');
  const strong = document.createElement('strong'); strong.textContent = String(label || 'ITEM'); item.append(strong);
  if (detail) { const small = document.createElement('small'); small.textContent = String(detail); item.append(small); }
  if (tag) { const badge = document.createElement('small'); badge.textContent = String(tag); item.append(badge); }
  return item;
}

function renderMissionPlan(plan = state.missionPlan) {
  if (!plan) {
    if (ui.missionMode) ui.missionMode.textContent = 'STANDBY';
    if (ui.missionSubtitle) ui.missionSubtitle.textContent = 'No mission has been planned yet.';
    if (ui.missionRoute) ui.missionRoute.textContent = '—';
    if (ui.missionAgent) ui.missionAgent.textContent = '—';
    if (ui.missionModel) ui.missionModel.textContent = '—';
    if (ui.missionScope) ui.missionScope.textContent = '—';
    if (ui.missionWorkflow) ui.missionWorkflow.textContent = '—';
    missionList(ui.missionCapabilities, [], () => missionItem('NONE'), 'No plan yet.');
    missionList(ui.missionSteps, [], () => missionItem('NONE'), 'No plan yet.');
    missionList(ui.missionApprovals, [], () => missionItem('NONE'), 'None.');
    missionList(ui.missionWarnings, [], () => missionItem('NONE'), 'None.');
    return;
  }
  const mode = missionModeLabel(plan.executionMode);
  if (ui.missionMode) ui.missionMode.textContent = mode;
  if (ui.missionSubtitle) ui.missionSubtitle.textContent = `Classified ${Number(plan.requestLength) || 0} characters // policy preview only`;
  if (ui.missionRoute) ui.missionRoute.textContent = plan.route || 'GENERAL';
  if (ui.missionAgent) ui.missionAgent.textContent = plan.agent || 'JARVIS';
  if (ui.missionModel) ui.missionModel.textContent = plan.model || 'LOCAL';
  if (ui.missionScope) ui.missionScope.textContent = plan.localOnly ? 'LOCAL' : 'WEB / CONNECTORS';
  if (ui.missionWorkflow) ui.missionWorkflow.textContent = plan.orchestration?.mode === 'fan-out-then-synthesize'
    ? `${plan.orchestration.specialistCount || 0} LANES`
    : 'DIRECT';
  const capabilities = Array.isArray(plan.capabilities) ? plan.capabilities : [];
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const approvals = Array.isArray(plan.approvals) ? plan.approvals : [];
  const warnings = Array.isArray(plan.warnings) ? plan.warnings : [];
  if (ui.missionCapabilityCount) ui.missionCapabilityCount.textContent = String(capabilities.length);
  if (ui.missionStepCount) ui.missionStepCount.textContent = String(steps.length);
  if (ui.missionApprovalCount) ui.missionApprovalCount.textContent = String(approvals.length);
  if (ui.missionWarningCount) ui.missionWarningCount.textContent = String(warnings.length);
  missionList(ui.missionCapabilities, capabilities, (item) => missionItem(item.label, item.kind, `${item.available ? 'AVAILABLE' : 'OFFLINE'} // ${item.readOnly ? 'READ' : 'CONTROL'}`), 'No capability selected.');
  missionList(ui.missionSteps, steps, (item) => missionItem(item.label, '', item.mode || 'read'), 'No execution steps.');
  missionList(ui.missionApprovals, approvals, (item) => missionItem(item.label, item.confirmation, item.available ? 'READY' : 'UNAVAILABLE'), 'No approval required.');
  missionList(ui.missionWarnings, warnings, (item) => missionItem(item.code, item.message), 'No warnings.');
}

function openMissionInspector() {
  renderMissionPlan();
  if (!ui.missionDialog) return;
  try { ui.missionDialog.showModal(); } catch { ui.missionDialog.setAttribute('open', ''); }
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
    { name: 'OBS stream studio', ok: payload.services?.obs?.online, detail: payload.services?.obs?.online ? `LIVE // ${payload.services.obs.scene || 'scene ready'} // ${(payload.services.obs.streamHealth || 'idle').toUpperCase()}${payload.services.obs.previewScene ? ` // PREVIEW ${payload.services.obs.previewScene}` : ''} // ${payload.services.obs.sourceCount || 0} sources` : payload.services?.obs?.configured ? payload.services.obs.detail || 'offline' : 'not configured' },
    { name: 'Local wake listener', ok: payload.wake?.ready, detail: payload.wake?.model ? 'Hey Jarvis + clap' : payload.wake?.running ? 'clap only' : 'standby' }
  ];
  const online = services.filter((item) => item.ok).length;
  ui.serviceCount.textContent = `${online}/${services.length}`;
  ui.serviceList.innerHTML = services.map((item) => `<article class="service-item"><i class="${item.ok ? 'ok' : ''}"></i><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.detail)}</span></div><b>${item.ok ? 'ONLINE' : 'OFFLINE'}</b></article>`).join('');
  const ollamaFallback = Boolean(payload.services?.ollama?.online && state.config?.allowOllamaFallback !== false);
  const healthy = Boolean(payload.services?.ollama?.online && (payload.services?.openjarvis?.online || ollamaFallback));
  const statusLabel = payload.services?.openjarvis?.online ? 'SYSTEM NOMINAL' : ollamaFallback ? 'OLLAMA FALLBACK' : 'DEGRADED';
  ui.systemDot.className = healthy ? 'online' : 'warning'; ui.systemState.textContent = statusLabel;
  if (state.coreMode === 'system') ui.coreSubtitle.textContent = healthy ? 'SPEAK // PINCH // INSPECT // COMMAND' : 'VISUAL CORE READY // MODEL SERVICES STANDBY';
  setModelDisplay({ model: payload.services?.ollama?.models?.[0] || 'NO MODEL' });
  const capture = payload.wake?.commandCapture;
  const captureAt = Date.parse(capture?.at || '');
  const captureFresh = capture && (capture.state === 'warming' || capture.state === 'listening' || (capture.state === 'complete' && Number.isFinite(captureAt) && Date.now() - captureAt < 8_000));
  ui.wakeState.textContent = captureFresh ? (wakeCaptureLabel(capture) || 'CAPTURING') : payload.wake?.ready ? 'LISTENING' : payload.wake?.configured ? 'STARTING' : 'STANDBY';
  state.neuralEnergy = healthy ? .42 : .18;
  renderOperationStatus(payload.operations);
  refreshSearchIfOpen();
}

function setModelDisplay({ route = '', agent = '', model = '', requestedModel = '', modelFallback = '' } = {}) {
  const chosen = String(model || '').trim() || 'NO MODEL';
  const role = String(agent || route || '').trim().toUpperCase();
  const label = role && chosen !== 'NO MODEL' ? `${role} // ${chosen}` : chosen;
  ui.modelLabel.textContent = label;
  ui.modelLabel.dataset.fallback = modelFallback ? 'true' : 'false';
  ui.modelLabel.title = modelFallback
    ? `${role || 'SPECIALIST'} requested ${requestedModel || 'a specialist model'}; using ${chosen}. ${modelFallback}`
    : role ? `${role} specialist // ${chosen}` : chosen;
  ui.modelLabel.setAttribute('aria-label', ui.modelLabel.title);
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
  const voiceCopy = {
    standby: 'Enable browser microphone',
    listening: 'JARVIS is listening for Hey Jarvis',
    hearing: 'JARVIS hears microphone audio',
    armed: 'JARVIS is ready for your command',
    speaking: 'JARVIS is speaking',
    processing: 'JARVIS is processing your request',
    'audio-only': 'Microphone active; speech recognition is unavailable in this browser',
    error: 'Voice listener error; open Settings for microphone and speech diagnostics'
  };
  const label = voiceCopy[mode] || 'JARVIS voice listener';
  ui.voiceButton?.setAttribute('aria-label', label);
  ui.voiceButton?.setAttribute('title', label);
  if (ui.voiceButton) ui.voiceButton.dataset.voiceMode = mode;
  const deckCopy = {
    standby: 'MIC OFF // CLICK TO ENABLE',
    listening: 'LISTENING // HEY JARVIS',
    hearing: 'HEARING // PHYSICAL MIC',
    armed: 'ARMED // COMMAND WINDOW OPEN',
    speaking: 'TALKBACK // FISH AUDIO',
    processing: 'THINKING // LOCAL ROUTER',
    'audio-only': 'MIC LIVE // SPEECH API UNAVAILABLE',
    error: 'VOICE ERROR // OPEN SETTINGS'
  };
  if (ui.voiceDeckState) {
    ui.voiceDeckState.textContent = deckCopy[mode] || 'VOICE LINK // READY';
    ui.voiceDeckState.dataset.voiceMode = mode;
  }
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

async function startThinkingSound({ phase = 'thinking' } = {}) {
  if (state.thinkingSound) {
    document.body.dataset.thinking = 'true';
    document.body.dataset.thinkingPhase = phase;
    return true;
  }
  // Keep the thinking state observable even when Web Audio is unavailable or
  // the browser refuses to resume an audio context. The visual neural field
  // must never look idle just because a sound device is locked down.
  const sound = { context: null, master: null, ownsContext: false, timer: 0, stopped: false, audioReady: false };
  state.thinkingSound = sound;
  document.body.dataset.thinking = 'true';
  document.body.dataset.thinkingPhase = phase;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  let context = state.voice?.context || null;
  let ownsContext = false;
  try {
    if (!context || context.state === 'closed') { context = new AudioContextClass({ latencyHint: 'interactive' }); ownsContext = true; }
    if (context.state !== 'running') {
      // Some headless/browser-policy paths leave AudioContext.resume() pending
      // forever. Keep the visual thinking state, but never block the actual
      // command/TTS request on a sound device that cannot be resumed.
      const resumed = await Promise.race([
        context.resume().then(() => true).catch(() => false),
        wait(1_500).then(() => false)
      ]);
      if (!resumed) return false;
    }
    if (context.state !== 'running') return false;
    const master = context.createGain();
    master.gain.value = Math.min(0.08, Math.max(0.01, Number(state.settings?.ttsVolume ?? 1) * 0.045));
    master.connect(context.destination);
    sound.context = context; sound.master = master; sound.ownsContext = ownsContext; sound.audioReady = true;
    const pulse = () => {
      if (sound.stopped) return;
      const now = context.currentTime;
      const oscillator = context.createOscillator(); const envelope = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(310, now); oscillator.frequency.exponentialRampToValueAtTime(470, now + 0.16);
      envelope.gain.setValueAtTime(0.0001, now); envelope.gain.exponentialRampToValueAtTime(1, now + 0.025); envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      oscillator.connect(envelope).connect(master); oscillator.start(now); oscillator.stop(now + 0.38);
      oscillator.onended = () => { try { oscillator.disconnect(); envelope.disconnect(); } catch {} };
      sound.timer = window.setTimeout(pulse, 820);
    };
    pulse();
    return true;
  } catch { return false; }
}

function stopThinkingSound() {
  const sound = state.thinkingSound;
  if (!sound) { document.body.dataset.thinking = 'false'; delete document.body.dataset.thinkingPhase; return; }
  sound.stopped = true; clearTimeout(sound.timer); state.thinkingSound = null;
  document.body.dataset.thinking = 'false';
  delete document.body.dataset.thinkingPhase;
  try {
    if (!sound.context || !sound.master) return;
    const now = sound.context.currentTime; sound.master.gain.cancelScheduledValues(now); sound.master.gain.setTargetAtTime(0.0001, now, 0.04);
    window.setTimeout(() => { try { sound.master.disconnect(); } catch {} if (sound.ownsContext) void sound.context.close().catch(() => {}); }, 180);
  } catch {}
}

// A smoke-only handle lets the real browser test exercise the same cue without
// spending a full local-model generation just to hold a request open. It is
// never created on the normal dashboard route and carries no host capability.
// Install it both before and after authentication: the auth helper may reload
// the protected route, and a fresh module evaluation must expose the handle
// deterministically even when a browser restores a cached document.
function installSmokeThinkingCue() {
  let smoke = false;
  try { smoke = new URLSearchParams(window.location.search).get('smoke') === '1'; } catch {}
  if (!smoke || window.__jarvisThinkingCue) return;
  window.__jarvisThinkingCue = {
    start: (options) => startThinkingSound(options),
    stop: () => stopThinkingSound(),
    state: () => ({ thinking: document.body.dataset.thinking || 'false', phase: document.body.dataset.thinkingPhase || '' })
  };
}
installSmokeThinkingCue();

async function requestFishSpeech(text, { timeoutMs = FISH_TTS_REPLY_TIMEOUT_MS } = {}) {
  let lastError = new Error('Fish Audio request failed.');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeout = 0;
    try {
      const request = {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, mode: 'fish' })
      };
      if (controller) {
        request.signal = controller.signal;
        timeout = window.setTimeout(() => controller.abort(), Math.max(4_000, Math.min(60_000, Number(timeoutMs) || FISH_TTS_REPLY_TIMEOUT_MS)));
      }
      const response = await (window.jarvisFetch || fetch)('/api/tts', request);
      if (response.ok) return { bytes: await response.arrayBuffer(), contentType: response.headers.get('content-type') || 'audio/mpeg' };
      const detail = await response.json().catch(() => ({}));
      const error = new Error(detail.error || `Fish Audio returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? Object.assign(new Error('Fish Audio timed out before audio was ready.'), { name: 'TimeoutError' })
        : error;
      if (error?.name === 'NotAllowedError' || Number(error?.status) < 500 || attempt === 1) break;
      await wait(350);
    } finally { if (timeout) window.clearTimeout(timeout); }
  }
  throw lastError;
}

async function speak(text, { pendingContext = null, onPlaybackStart = null, fishTimeoutMs = null } = {}) {
  if (!state.settings?.autoSpeak || !text) return true;
  state.voice?.setSpeaking(true); updateVoiceVisual('speaking', .72);
  try {
    if (state.config?.ttsMode === 'fish') {
      document.body.dataset.ttsProvider = 'fish';
      document.body.dataset.ttsVoice = state.config.fishVoiceId || 'unconfigured';
      document.body.dataset.ttsState = 'requesting';
      try {
        const result = await requestFishSpeech(text, { timeoutMs: fishTimeoutMs || (pendingContext?.kind === 'wake' ? FISH_TTS_WAKE_TIMEOUT_MS : FISH_TTS_REPLY_TIMEOUT_MS) });
        onPlaybackStart?.();
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
          onPlaybackStart?.();
          state.pendingSpeech = { text, context: pendingContext }; document.body.classList.add('audio-locked'); document.body.dataset.ttsState = 'blocked'; state.galaxy?.setActivity('armed', 1); return false;
        }
        document.body.dataset.ttsState = error?.name === 'TimeoutError' ? 'timeout' : 'error';
        console.warn(`Fish Audio playback failed without changing voices: ${error?.message || error}`);
        if (!state.config?.allowBrowserTtsFallback) { onPlaybackStart?.(); state.galaxy?.setActivity('error', 1); return false; }
      }
    }
    if ('speechSynthesis' in window) {
      document.body.dataset.ttsProvider = 'browser'; document.body.dataset.ttsVoice = selectBrowserVoice()?.voiceURI || 'system-default'; document.body.dataset.ttsState = 'requesting';
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
        onPlaybackStart?.();
        state.pendingSpeech = { text, context: pendingContext }; document.body.classList.add('audio-locked'); document.body.dataset.ttsState = 'blocked'; state.galaxy?.setActivity('armed', 1); return false;
      }
      await new Promise((resolve) => {
        speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 1800));
        const timeout = setTimeout(resolve, Math.max(6000, Math.min(120_000, String(text).length * 95)));
        utterance.rate = Number(state.settings?.ttsRate ?? 1.02); utterance.pitch = Number(state.settings?.ttsPitch ?? .92); utterance.volume = Number(state.settings?.ttsVolume ?? 1);
        const voice = selectBrowserVoice(); if (voice) utterance.voice = voice;
        utterance.onstart = () => { document.body.dataset.ttsState = 'playing'; };
        utterance.onend = () => { clearTimeout(timeout); document.body.dataset.ttsState = 'complete'; resolve(); };
        utterance.onerror = () => { clearTimeout(timeout); document.body.dataset.ttsState = 'error'; resolve(); }; onPlaybackStart?.(); speechSynthesis.speak(utterance);
      });
      return document.body.dataset.ttsState === 'complete';
    }
    onPlaybackStart?.();
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
  // The Pi listener can finish a bounded local Vosk sentence before the wake
  // event reaches the dashboard. Route that verified command immediately;
  // opening a second browser microphone first would drop it on a headless Pi
  // or any host where the dashboard tab has no capture permission.
  const directCommand = normalizeWakeCommand(initialCommand);
  if (hasWakeCommand(directCommand)) {
    updateVoiceCommandTranscript(directCommand, true);
    handleVoiceCommand(directCommand);
    return;
  }
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

async function beginConversationCapture() {
  if (!state.settings?.conversationMode || state.voiceCapture.active || ui.operationDialog?.open || ui.emailDialog?.open || ui.browserControlDialog?.open) return false;
  const session = ++state.wakeSession;
  if (!openVoiceCommandWindow()) return false;
  ui.wakeState.textContent = 'FOLLOW-UP';
  ui.voiceCaptureState.textContent = 'FOLLOW-UP READY';
  ui.voiceCaptureTranscript.textContent = 'Ask another question without saying Hey Jarvis.';
  ui.searchMode.textContent = 'VOICE SESSION // FOLLOW-UP';
  try {
    await beginWakeCommandCapture(session);
    return session === state.wakeSession && state.voiceCapture.active;
  } catch { return false; }
}

async function handleWake(event) {
  const session = ++state.wakeSession; const initialCommand = String(event?.detail?.command || '').trim();
  if (!openVoiceCommandWindow()) return;
  ui.wakeFlash.classList.remove('active'); void ui.wakeFlash.offsetWidth; ui.wakeFlash.classList.add('active');
  ui.wakeState.textContent = event?.detail?.kind === 'double_clap' ? 'CLAP' : event?.detail?.kind === 'push_to_talk' ? 'PTT' : 'HEARD'; state.neuralEnergy = 1;
  updateVoiceVisual('armed', 1);
  const context = { kind: 'wake', session, command: initialCommand };
  const played = isEmbeddedPreview() || !state.settings?.wakeResponse ? true : await speak(state.settings.wakeResponse, { pendingContext: context, fishTimeoutMs: FISH_TTS_WAKE_TIMEOUT_MS });
  if (session !== state.wakeSession || !state.voiceCapture.active) return;
  if (!played && document.body.dataset.ttsState === 'blocked') {
    ui.voiceCaptureState.textContent = 'TAP TO ENABLE AUDIO'; ui.voiceCaptureTranscript.textContent = 'Tap anywhere once. JARVIS will reply, then begin listening.';
    ui.searchMode.textContent = 'VOICE SESSION // AUDIO LOCKED'; ui.searchCount.textContent = 'WAIT'; return;
  }
  await beginWakeCommandCapture(session, initialCommand);
  setTimeout(() => { ui.wakeState.textContent = state.status?.wake?.ready ? 'LISTENING' : 'STANDBY'; }, 2200);
}

async function sendPrompt(prompt, { browserGrant = '', appendUser = true, fromVoice = false } = {}) {
  const text = String(prompt || '').trim(); if (!text || ui.send.disabled) return;
  state.galaxy?.focusFromText(text);
  const desktopMatch = text.match(/^\s*(?:please\s+)?(?:open|launch|start)\s+(?:the\s+)?(?:(?:desktop|host)\s+)?(?:app|application)\s+["']?(.{1,120}?)["']?\s*$/i);
  if (desktopMatch) { await openDesktopAction(desktopMatch[1].trim().replace(/^["']|["']$/g, '')); return; }
  // Natural host-app phrasing is accepted only when the redacted catalog has a
  // match. Otherwise the request continues through the normal web/AI lane.
  const naturalDesktopMatch = text.match(/^\s*(?:please\s+)?(?:open|launch|start)\s+(?:the\s+)?["']?([^"']{1,120}?)["']?\s*$/i);
  if (naturalDesktopMatch && !/[/:?&=]/.test(naturalDesktopMatch[1])) {
    const catalog = await json('/api/desktop/apps').catch(() => null);
    if (findDesktopApp(catalog, naturalDesktopMatch[1])) {
      await openDesktopAction(naturalDesktopMatch[1], { catalog }); return;
    }
  }
  const directPrinterAction = /\b(?:cancel|end|stop)\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'cancel'
    : /\bpause\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'pause'
      : /\bresume\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'resume' : '';
  if (directPrinterAction) {
    activateCoreMode('printer');
    appendMessage('user', text); appendMessage('assistant', `I opened the guarded ${directPrinterAction} control. Enter the operations PIN and type ${printerCopy[directPrinterAction].confirmation} exactly. I will not execute it automatically.`, 'LOCAL SAFETY');
    openPrinterAction(directPrinterAction); return;
  }
  const sceneMatch = text.match(/^\s*(?:please\s+)?(?:switch|change)\s+(?:the\s+)?(?:obs\s+)?scene\s+(?:to\s+)?["']?([^"']{1,100})["']?\s*$/i);
  const muteMatch = text.match(/^\s*(?:please\s+)?(mute|unmute)\s+(?:the\s+)?(?:obs\s+)?(?:audio\s+)?source\s+["']?(.{1,120}?)["']?\s*$/i);
  const volumeMatch = text.match(/^\s*(?:please\s+)?set\s+(?:the\s+)?(?:obs\s+)?(?:audio\s+)?source\s+["']?(.{1,100}?)["']?\s+(?:volume|gain)\s+(?:to\s+)?(-?\d+(?:\.\d+)?)\s*d?b\s*$/i);
  const toggleMatch = text.match(/^\s*(?:please\s+)?(enable|disable|show|hide)\s+(?:the\s+)?(?:obs\s+)?source\s+["']?(.{1,120}?)["']?\s+(?:in|on)\s+(?:scene\s+)?["']?(.{1,100}?)["']?\s*$/i);
  const browserSourceMatch = text.match(/^\s*(?:please\s+)?refresh\s+(?:the\s+)?(?:obs\s+)?browser\s+source\s+["']?(.{1,120}?)["']?\s*$/i);
  const mediaSourceMatch = text.match(/^\s*(?:please\s+)?restart\s+(?:the\s+)?(?:obs\s+)?media\s+source\s+["']?(.{1,120}?)["']?\s*$/i);
  const transitionMatch = text.match(/^\s*(?:please\s+)?set\s+(?:the\s+)?(?:obs\s+)?(?:scene\s+)?transition\s+(?:to\s+)?["']?(.{1,120}?)["']?\s*$/i);
  const filterMatch = text.match(/^\s*(enable|disable)\s+(?:the\s+)?(?:obs\s+)?filter\s+["']?(.{1,100}?)["']?\s+(?:on|for)\s+(?:source\s+)?["']?(.{1,120}?)["']?\s*$/i);
  const directObsAction = sceneMatch ? 'switch-scene'
    : /^(?:\s*please\s+)?(?:start|begin)\s+(?:the\s+)?(?:obs\s+)?stream\s*$/i.test(text) || /^\s*go\s+live\s*$/i.test(text) ? 'start-stream'
      : /^(?:\s*please\s+)?(?:stop|end)\s+(?:the\s+)?(?:obs\s+)?stream\s*$/i.test(text) ? 'stop-stream'
        : /^(?:\s*please\s+)?(?:start|begin)\s+(?:obs\s+)?record(?:ing)?\s*$/i.test(text) ? 'start-record'
          : /^(?:\s*please\s+)?(?:stop|end)\s+(?:obs\s+)?record(?:ing)?\s*$/i.test(text) ? 'stop-record'
            : /^\s*(?:please\s+)?pause\s+(?:the\s+)?obs\s+record(?:ing)?\s*$/i.test(text) ? 'pause-record'
              : /^\s*(?:please\s+)?resume\s+(?:the\s+)?obs\s+record(?:ing)?\s*$/i.test(text) ? 'resume-record'
                : /^\s*(?:please\s+)?(?:start|begin)\s+(?:the\s+)?obs\s+replay(?:\s+buffer)?\s*$/i.test(text) ? 'start-replay'
                  : /^\s*(?:please\s+)?(?:stop|end)\s+(?:the\s+)?obs\s+replay(?:\s+buffer)?\s*$/i.test(text) ? 'stop-replay'
                    : /^\s*(?:please\s+)?(?:save|clip)\s+(?:the\s+)?obs\s+replay(?:\s+buffer)?\s*$/i.test(text) ? 'save-replay'
                      : /^\s*(?:please\s+)?(?:start|begin)\s+(?:the\s+)?obs\s+virtual\s+camera\s*$/i.test(text) ? 'start-virtualcam'
                        : /^\s*(?:please\s+)?(?:stop|end)\s+(?:the\s+)?obs\s+virtual\s+camera\s*$/i.test(text) ? 'stop-virtualcam'
                          : /^\s*(?:please\s+)?(?:take|apply)\s+(?:the\s+)?obs\s+preview\s*$/i.test(text) ? 'studio-take'
                            : /^\s*(?:please\s+)?enable\s+(?:the\s+)?obs\s+studio\s+mode\s*$/i.test(text) ? 'enable-studio'
                              : /^\s*(?:please\s+)?disable\s+(?:the\s+)?obs\s+studio\s+mode\s*$/i.test(text) ? 'disable-studio'
                                : browserSourceMatch ? 'refresh-browser-source'
                                  : mediaSourceMatch ? 'restart-media-source'
                                    : transitionMatch ? 'set-transition'
                                      : filterMatch ? 'toggle-filter'
                                        : muteMatch ? (muteMatch[1].toLowerCase() === 'mute' ? 'mute-source' : 'unmute-source')
                              : volumeMatch ? 'set-volume' : toggleMatch ? 'toggle-source' : '';
  if (directObsAction) {
    activateCoreMode('agents');
    const sceneName = sceneMatch ? sceneMatch[1].trim() : '';
    const inputName = muteMatch ? muteMatch[2].trim() : volumeMatch ? volumeMatch[1].trim() : toggleMatch ? toggleMatch[2].trim() : browserSourceMatch ? browserSourceMatch[1].trim() : mediaSourceMatch ? mediaSourceMatch[1].trim() : filterMatch ? filterMatch[3].trim() : '';
    const volumeDb = volumeMatch ? Number(volumeMatch[2]) : null;
    const enabled = toggleMatch ? ['enable', 'show'].includes(toggleMatch[1].toLowerCase()) : filterMatch ? filterMatch[1].toLowerCase() === 'enable' : null;
    const filterName = filterMatch ? filterMatch[2].trim() : '';
    const transitionName = transitionMatch ? transitionMatch[1].trim() : '';
    const targetScene = toggleMatch ? toggleMatch[3].trim() : sceneName;
    const target = filterName ? ` Target filter: ${filterName} on ${inputName}.` : transitionName ? ` Target transition: ${transitionName}.` : inputName ? ` Target source: ${inputName}${Number.isFinite(volumeDb) ? ` at ${volumeDb} dB` : ''}.` : targetScene ? ` Target scene: ${targetScene}.` : '';
    appendMessage('user', text); appendMessage('assistant', `I opened the guarded OBS ${directObsAction.replaceAll('-', ' ')} control. Enter the operations PIN and type ${obsCopy[directObsAction].confirmation} exactly. I will not execute it automatically.`, 'LOCAL SAFETY');
    openObsAction(directObsAction, targetScene, { inputName, volumeDb, enabled, filterName, transitionName, sceneItemId: null, target }); return;
  }
  if (appendUser) { appendMessage('user', text); state.history.push({ role: 'user', content: text }); state.history = state.history.slice(-16); }
  if (ui.missionState) { ui.missionState.textContent = 'PLANNING'; ui.missionState.title = 'JARVIS is classifying data sources, specialist route, and required approvals.'; }
  ui.prompt.value = ''; ui.send.disabled = true; ui.send.innerHTML = '<span>LINK</span><b>RUNNING</b>'; state.neuralEnergy = .95; updateVoiceVisual('processing', .92);
  window.setTimeout(() => void refreshAgentLive({ force: true }), 80);
  let responseSettled = false; let thinkingStart = null; let responseSpeechPending = false;
  const missionPlanPromise = json('/api/mission/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text }) }).catch(() => null);
  const responsePromise = json('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text, history: state.history.slice(0, -1), browserGrant }) })
    .finally(() => { responseSettled = true; });
  try {
    if (state.settings?.autoSpeak !== false) {
      await speak(COMMAND_ACKNOWLEDGEMENT).catch(() => false);
    }
    if (!responseSettled) thinkingStart = startThinkingSound();
    const result = await responsePromise;
    const missionPlan = await missionPlanPromise;
    state.missionPlan = missionPlan;
    renderMissionPlan(missionPlan);
    if (missionPlan && ui.missionState) {
      const mode = String(missionPlan.executionMode || 'read-only-local').replaceAll('-', ' ').toUpperCase();
      ui.missionState.textContent = mode;
      ui.missionState.title = [
        `ROUTE ${missionPlan.route || 'GENERAL'}`,
        `${missionPlan.steps?.length || 0} STEPS`,
        missionPlan.approvals?.length ? `${missionPlan.approvals.length} APPROVAL${missionPlan.approvals.length === 1 ? '' : 'S'}` : 'NO APPROVAL',
        missionPlan.warnings?.length ? `${missionPlan.warnings.length} WARNING${missionPlan.warnings.length === 1 ? '' : 'S'}` : 'NO WARNINGS'
      ].join(' // ');
    }
    if (thinkingStart) await thinkingStart;
    ui.route.textContent = result.route;
    activateCoreMode(routeModes[result.route] || 'system');
    setModelDisplay(result);
    const coordinationLabel = Array.isArray(result.coordination) && result.coordination.length > 1 ? `${result.coordination.length} SPECIALIST LANES` : '';
    const responseSource = [result.source, coordinationLabel, result.modelFallback ? 'MODEL FALLBACK' : ''].filter(Boolean).join(' // ');
    state.lastAssistant = result.content; appendMessage('assistant', result.content, responseSource); state.history.push({ role: 'assistant', content: result.content }); state.history = state.history.slice(-16);
    if (Array.isArray(result.citations) && result.citations.length) { renderCitations(result.citations); activateCoreMode('research'); }
    if (result.action?.type === 'email_draft') openEmailDraft(result.action);
    if (result.action?.type === 'browser_control_request') openBrowserControlRequest(result.action, text);
    if (result.action?.type === 'artifact_ready') openArtifact(result.action.artifact);
    responseSpeechPending = Boolean(state.settings?.autoSpeak !== false && result.content);
    const continueConversation = Boolean(fromVoice && state.settings?.conversationMode && result.content && !result.action);
    if (responseSpeechPending) {
      void speak(result.content, { onPlaybackStart: stopThinkingSound })
        .then(() => { if (continueConversation) void beginConversationCapture(); })
        .finally(stopThinkingSound);
    } else {
      stopThinkingSound();
      if (continueConversation) void beginConversationCapture();
    }
  } catch (error) { stopThinkingSound(); if (ui.missionState) { ui.missionState.textContent = 'ERROR'; ui.missionState.title = error.message || 'Mission failed.'; } appendMessage('error', error.message); }
  finally { if (!responseSpeechPending) stopThinkingSound(); ui.send.disabled = false; ui.send.innerHTML = '<span>RUN</span><b>EXECUTE</b>'; state.neuralEnergy = .42; if (state.voiceState !== 'speaking') updateVoiceVisual(state.voice?.active ? 'listening' : 'standby', .18); }
}

function hideAgentLiveView() {
  ui.agentLiveView.hidden = true;
  ui.agentLiveFrame.hidden = true;
  ui.agentLiveFrame.removeAttribute('src');
  ui.agentLivePlaceholder.hidden = false;
  state.agentLive.frameVersion = 0;
}

async function refreshAgentLive({ force = false } = {}) {
  if (state.agentLive.pending || document.hidden && !force) return;
  state.agentLive.pending = true;
  try {
    const live = await pollJson('/api/agent/live', 1800);
    if (!live.visible) { hideAgentLiveView(); return; }
    ui.agentLiveView.hidden = false;
    ui.agentLiveState.textContent = String(live.phase || 'CONTROLLING').replaceAll('-', ' ').toUpperCase();
    ui.agentLiveTool.textContent = String(live.tool || 'OPENJARVIS').replaceAll('_', ' ').toUpperCase();
    ui.agentLiveTime.textContent = live.startedAt ? new Date(live.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'LIVE';
    if (live.frameAvailable && live.frameVersion !== state.agentLive.frameVersion) {
      state.agentLive.frameVersion = live.frameVersion;
      ui.agentLiveFrame.onload = () => { ui.agentLiveFrame.hidden = false; ui.agentLivePlaceholder.hidden = true; };
      ui.agentLiveFrame.onerror = () => { ui.agentLiveFrame.hidden = true; ui.agentLivePlaceholder.hidden = false; };
      ui.agentLiveFrame.src = `/api/agent/live-frame?v=${encodeURIComponent(live.frameVersion)}`;
    } else if (!live.frameAvailable) {
      ui.agentLiveFrame.hidden = true; ui.agentLiveFrame.removeAttribute('src'); ui.agentLivePlaceholder.hidden = false;
    }
  } catch { hideAgentLiveView(); }
  finally { state.agentLive.pending = false; }
}

async function toggleVoice() {
  if (!state.voice) return;
  try {
    await state.voice.toggle(state.settings); ui.voiceButton.title = state.voice.active ? 'Stop JARVIS voice listener' : 'Start JARVIS voice listener';
  } catch (error) { appendMessage('error', `Microphone unavailable: ${error.message}`); updateVoiceVisual('error', 1); }
}

function isEmbeddedPreview() { try { return window.self !== window.top; } catch { return true; } }
function isSmokeMode() { try { return new URLSearchParams(window.location.search).get('smoke') === '1'; } catch { return false; } }
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

function openEmailDraft(action) {
  const draft = action?.draft;
  if (!draft?.id) return;
  state.emailDraft = { ...draft };
  ui.emailTo.value = draft.to || ''; ui.emailSubject.value = draft.subject || ''; ui.emailBody.value = draft.body || '';
  ui.emailPin.value = ''; ui.emailConfirmation.value = ''; ui.emailError.textContent = '';
  ui.confirmEmail.disabled = action.sendEnabled !== true;
  ui.confirmEmail.textContent = action.sendEnabled === true ? 'SEND THIS EXACT EMAIL' : 'SENDING DISABLED — ENABLE GMAIL.SEND';
  ui.emailSafety.textContent = action.sendEnabled === true
    ? `NOT SENT // EXPIRES ${new Date(draft.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'NOT SENT // RE-AUTHORIZE GOOGLE WITH GMAIL.SEND, THEN ENABLE APPROVED SENDING';
  ui.emailDialog.showModal(); ui.emailTo.focus();
}

async function sendApprovedEmail() {
  if (!state.emailDraft?.id) return;
  ui.confirmEmail.disabled = true; ui.confirmEmail.textContent = 'SENDING…'; ui.emailError.textContent = '';
  try {
    const result = await json('/api/google/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftId: state.emailDraft.id, to: ui.emailTo.value, subject: ui.emailSubject.value, body: ui.emailBody.value,
        pin: ui.emailPin.value, confirmation: ui.emailConfirmation.value
      })
    });
    ui.emailDialog.close(); state.emailDraft = null;
    const message = `Email sent to ${result.result.to} with subject “${result.result.subject}”.`;
    appendMessage('assistant', message, 'GMAIL APPROVED SEND');
    addEvent({ id: `email-${Date.now()}`, at: new Date().toISOString(), type: 'connector', message: 'Approved Gmail message sent', detail: {} });
    void speak('Email sent, sir.');
  } catch (error) { ui.emailError.textContent = error.message; }
  finally {
    if (state.emailDraft) { ui.confirmEmail.disabled = false; ui.confirmEmail.textContent = 'SEND THIS EXACT EMAIL'; }
  }
}

function openBrowserControlRequest(action, fallbackTask = '') {
  const request = action?.request;
  if (!request?.id) return;
  state.browserRequest = { ...request, task: request.task || fallbackTask };
  ui.browserControlTask.textContent = state.browserRequest.task;
  ui.browserControlPin.value = ''; ui.browserControlConfirmation.value = ''; ui.browserControlError.textContent = '';
  ui.browserControlSafety.textContent = `NO CLICKS OR TYPING YET // REQUEST EXPIRES ${new Date(request.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  ui.confirmBrowserControl.disabled = false; ui.confirmBrowserControl.textContent = 'RUN THIS ONE BROWSER TASK';
  ui.browserControlDialog.showModal(); ui.browserControlPin.focus();
}

async function approveBrowserControl() {
  if (!state.browserRequest?.id) return;
  ui.confirmBrowserControl.disabled = true; ui.confirmBrowserControl.textContent = 'AUTHORIZING…'; ui.browserControlError.textContent = '';
  try {
    const result = await json('/api/browser/control/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: state.browserRequest.id, pin: ui.browserControlPin.value, confirmation: ui.browserControlConfirmation.value })
    });
    const task = state.browserRequest.task; state.browserRequest = null; ui.browserControlDialog.close();
    await sendPrompt(task, { browserGrant: result.grant.token, appendUser: false });
  } catch (error) { ui.browserControlError.textContent = error.message; }
  finally { if (state.browserRequest) { ui.confirmBrowserControl.disabled = false; ui.confirmBrowserControl.textContent = 'RUN THIS ONE BROWSER TASK'; } }
}

function artifactSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`;
}

function openArtifact(artifact) {
  if (!artifact?.id || !artifact.downloadUrl) return;
  state.artifact = { ...artifact };
  ui.artifactTitle.textContent = artifact.title || 'Artifact ready'; ui.artifactSubtitle.textContent = artifact.subtitle || 'Generated locally by JARVIS.';
  ui.artifactType.textContent = String(artifact.type || 'FILE').toUpperCase(); ui.artifactFile.textContent = artifact.fileName || 'download'; ui.artifactSize.textContent = artifactSize(artifact.bytes);
  ui.artifactOutline.replaceChildren(...(artifact.outline || []).map((heading) => { const item = document.createElement('li'); item.textContent = heading; return item; }));
  ui.artifactDownload.href = artifact.downloadUrl; ui.artifactDownload.download = artifact.fileName || '';
  ui.artifactDialog.showModal();
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
function openObsAction(action, sceneName = '', details = {}) {
  const copy = obsCopy[action]; if (!copy) return;
  state.operation = action; state.operationKind = 'obs'; state.obsSceneName = sceneName; state.obsInputName = String(details.inputName || ''); state.obsVolumeDb = Number.isFinite(Number(details.volumeDb)) ? Number(details.volumeDb) : null; state.obsSceneItemId = Number.isSafeInteger(Number(details.sceneItemId)) ? Number(details.sceneItemId) : null; state.obsEnabled = typeof details.enabled === 'boolean' ? details.enabled : null; state.obsFilterName = String(details.filterName || ''); state.obsTransitionName = String(details.transitionName || '');
  ui.operationTitle.textContent = copy.title; ui.operationDescription.textContent = `${copy.description}${details.target || (sceneName ? ` Target scene: ${sceneName}.` : state.obsInputName ? ` Target source: ${state.obsInputName}.` : '')}`; ui.confirmationPhrase.textContent = copy.confirmation;
  ui.operationPin.value = ''; ui.operationConfirmation.value = ''; ui.operationError.textContent = ''; ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = 'RUN OBS CONTROL'; ui.operationDialog.showModal(); ui.operationPin.focus();
}
function findDesktopApp(catalog, requestedName) {
  const normalized = String(requestedName || '').trim().toLocaleLowerCase();
  if (!normalized || !Array.isArray(catalog?.apps)) return null;
  return catalog.apps.find((item) => String(item.name || '').toLocaleLowerCase() === normalized)
    || catalog.apps.find((item) => String(item.name || '').toLocaleLowerCase().includes(normalized));
}
async function openDesktopAction(requestedName, { catalog = null } = {}) {
  const name = String(requestedName || '').trim();
  if (!name) return;
  appendMessage('user', `Open app ${name}`);
  try {
    const resolvedCatalog = catalog || await json('/api/desktop/apps');
    const app = findDesktopApp(resolvedCatalog, name);
    if (!app) {
      const examples = (catalog.apps || []).slice(0, 8).map((item) => item.name).join(', ');
      appendMessage('error', examples ? `I could not find “${name}” in the host app catalog. Available examples: ${examples}.` : 'No host applications were discovered. Refresh the dashboard on the computer that should launch the app.');
      return;
    }
    state.operationKind = 'desktop'; state.operation = 'launch'; state.desktopAppId = app.id; state.desktopAppName = app.name;
    const copy = desktopCopy.launch;
    ui.operationTitle.textContent = `${copy.title}: ${app.name}`; ui.operationDescription.textContent = `${copy.description} Platform: ${app.platform}.`;
    ui.confirmationPhrase.textContent = copy.confirmation; ui.operationPin.value = ''; ui.operationConfirmation.value = ''; ui.operationError.textContent = '';
    ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = 'LAUNCH HOST APP'; ui.operationDialog.showModal(); ui.operationPin.focus();
  } catch (error) { appendMessage('error', `Host app catalog unavailable: ${error.message}`); }
}
async function runOperation() {
  const copy = state.operationKind === 'printer' ? printerCopy[state.operation] : state.operationKind === 'obs' ? obsCopy[state.operation] : state.operationKind === 'desktop' ? desktopCopy[state.operation] : operationCopy[state.operation]; if (!copy) return;
  ui.operationError.textContent = ''; ui.confirmOperation.disabled = true; ui.confirmOperation.textContent = 'EXECUTING';
  try {
    const endpoint = state.operationKind === 'printer' ? '/api/printer/action' : state.operationKind === 'obs' ? '/api/obs/action' : state.operationKind === 'desktop' ? '/api/desktop/launch' : '/api/operations/action';
    const body = { action: state.operation, pin: ui.operationPin.value, confirmation: ui.operationConfirmation.value };
    if (state.operationKind === 'desktop') body.appId = state.desktopAppId;
    if (state.operationKind === 'obs') {
      if (state.obsSceneName) body.sceneName = state.obsSceneName;
      if (state.obsInputName) body.inputName = state.obsInputName;
      if (state.obsVolumeDb !== null) body.volumeDb = state.obsVolumeDb;
      if (state.obsSceneItemId !== null) body.sceneItemId = state.obsSceneItemId;
      if (state.obsEnabled !== null) body.enabled = state.obsEnabled;
      if (state.obsFilterName) body.filterName = state.obsFilterName;
      if (state.obsTransitionName) body.transitionName = state.obsTransitionName;
    }
    const result = await json(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (state.operationKind === 'printer') renderPrinter(result.result); else if (state.operationKind !== 'obs' && state.operationKind !== 'desktop') renderOperationStatus(result.result);
    if (state.operationKind === 'obs' && result.status) { state.status = { ...(state.status || {}), services: { ...(state.status?.services || {}), obs: { online: result.status.online, configured: result.status.configured, detail: result.status.error || (result.status.online ? 'ready' : 'offline'), scene: result.status.scenes?.current || '', previewScene: result.status.scenes?.preview || '', streaming: result.status.streaming?.active, streamHealth: result.status.streaming?.health?.status || 'idle', streamCongestion: result.status.streaming?.health?.congestion || 0, streamSkippedFrames: result.status.streaming?.health?.skippedFrames || 0, streamDroppedPercent: result.status.streaming?.health?.droppedPercent || 0, recording: result.status.recording?.active, recordingPaused: result.status.recording?.paused, replayBuffer: result.status.replayBuffer?.active, virtualCamera: result.status.virtualCamera?.active, studioMode: result.status.studioMode?.enabled, sourceCount: Object.values(result.status.scenes?.sources || {}).reduce((total, items) => total + (Array.isArray(items) ? items.length : 0), 0) } } }; renderStatus(state.status); }
    ui.operationDialog.close(); addEvent({ id: `local-${Date.now()}`, at: new Date().toISOString(), type: state.operationKind === 'printer' ? 'printer' : state.operationKind === 'desktop' ? 'desktop' : 'control', message: state.operationKind === 'desktop' ? `${state.desktopAppName} launched` : `${state.operation} completed`, detail: {} });
    if (state.operationKind === 'desktop') { appendMessage('assistant', `${state.desktopAppName} launched on the host.`, 'LOCAL APP BRIDGE'); void speak(`${state.desktopAppName} is open, sir.`); }
  } catch (error) { ui.operationError.textContent = error.message; }
  finally { ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = state.operationKind === 'printer' ? (state.operation === 'cancel' ? 'CONFIRM END PRINT' : 'SEND TO PRINTER') : state.operationKind === 'obs' ? 'RUN OBS CONTROL' : state.operationKind === 'desktop' ? 'LAUNCH HOST APP' : 'RUN ON RASPBERRY PI'; }
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
  if (isEmbeddedPreview() || isSmokeMode() || state.settings?.source !== 'browser' || state.settings?.gestureControl === false || !navigator.permissions?.query) return false;
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
ui.missionInspect?.addEventListener('click', openMissionInspector);
ui.missionInspectCore?.addEventListener('click', openMissionInspector);
ui.missionClose?.addEventListener('click', () => ui.missionDialog?.close());
ui.missionDialog?.addEventListener('cancel', (event) => { event.preventDefault(); ui.missionDialog.close(); });
ui.missionDialog?.addEventListener('pointerdown', (event) => { if (event.target === ui.missionDialog) ui.missionDialog.close(); });
ui.searchForm.addEventListener('submit', (event) => { event.preventDefault(); if (!state.voiceCapture.active) executeSearchItem(); });
ui.searchInput.addEventListener('input', () => { if (!state.voiceCapture.active) renderSearchResults({ resetSelection: true }); });
ui.searchClose.addEventListener('click', closeSearch);
ui.searchDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeSearch(); });
ui.searchDialog.addEventListener('pointerdown', (event) => { if (event.target === ui.searchDialog) closeSearch(); });
ui.operationForm.addEventListener('submit', (event) => { event.preventDefault(); void runOperation(); });
ui.operationClose.addEventListener('click', () => ui.operationDialog.close());
ui.emailForm.addEventListener('submit', (event) => { event.preventDefault(); void sendApprovedEmail(); });
ui.emailClose.addEventListener('click', () => { state.emailDraft = null; ui.emailDialog.close(); });
ui.emailDialog.addEventListener('cancel', () => { state.emailDraft = null; });
ui.browserControlForm.addEventListener('submit', (event) => { event.preventDefault(); void approveBrowserControl(); });
ui.browserControlClose.addEventListener('click', () => { state.browserRequest = null; ui.browserControlDialog.close(); });
ui.browserControlDialog.addEventListener('cancel', () => { state.browserRequest = null; });
ui.artifactClose.addEventListener('click', () => { state.artifact = null; ui.artifactDialog.close(); });
ui.artifactDialog.addEventListener('cancel', () => { state.artifact = null; });
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
  if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'Space' && !event.repeat && !event.target?.matches('input,textarea,select,[contenteditable="true"]')) {
    event.preventDefault(); beginPushToTalk(); return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'Space' && !event.repeat && !event.target?.matches('input,textarea,select,[contenteditable="true"]')) {
    event.preventDefault(); beginPushToTalk(); return;
  }
  const editable = event.target?.matches('input,textarea,select,[contenteditable="true"]');
  // Fast local wake path inspired by the observable desktop-assistant flow.
  // It opens the same acknowledgement and microphone session as a wake word;
  // it never grants a browser, host, email, printer, OBS, or PDF mutation.
  if (event.ctrlKey && event.altKey && event.code === 'KeyD' && !event.repeat && !editable) {
    event.preventDefault(); void handleWake({ detail: { kind: 'hotkey', phrase: 'ctrl alt d', score: 1 } }); return;
  }
  if (!editable && event.key === '/') { event.preventDefault(); openSearch(); return; }
  if (editable) return;
  if (event.key.toLowerCase() === 'v') void toggleVoice();
  if (event.key.toLowerCase() === 'g') void toggleGestures();
  if (event.key === 'Escape') { void state.voice?.stop(); void state.gesture?.stop(); }
});
window.addEventListener('beforeunload', () => { clearInterval(state.agentLive.timer); clearTimeout(mediaDeviceChangeTimer); void state.voice?.stop(); void state.gesture?.stop(); });
navigator.mediaDevices?.addEventListener?.('devicechange', () => {
  // Deterministic smoke pages use synthetic Camoufox devices. Firefox emits a
  // devicechange event while that fixture is being opened, which is not a
  // physical hot-plug and would immediately stop the gesture stream under
  // test. The production path remains guarded by the normal device-change
  // shutdown below.
  if (isSmokeMode()) return;
  clearTimeout(mediaDeviceChangeTimer);
  mediaDeviceChangeTimer = window.setTimeout(async () => {
    mediaDeviceChangeTimer = 0;
    const voiceWasActive = Boolean(state.voice?.active);
    const gestureWasActive = Boolean(state.gesture?.active);
    if (!voiceWasActive && !gestureWasActive) return;
    await state.voice?.stop();
    await state.gesture?.stop();
    updateVoiceVisual('standby', 0);
    ui.voiceButton.title = 'Start JARVIS voice listener';
    ui.gestureButton.classList.remove('active');
    ui.gestureButton.textContent = 'ENABLE GESTURES';
    ui.gestureFeed.hidden = true;
    appendMessage('assistant', 'A camera or microphone changed. I stopped the active listener safely; choose the device in Settings, then re-enable it.', 'DEVICE BUS');
  }, 250);
});
document.addEventListener('pointerdown', () => void unlockAudioFromGesture(), { capture: true });
document.addEventListener('keydown', () => void unlockAudioFromGesture(), { capture: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { void refreshFast({ force: true }); void refreshSlow({ force: true }); }
});

async function init() {
  updateClock(); setInterval(updateClock, 1000);
  await window.ensureDashboardAuthentication?.();
  installSmokeThinkingCue();
  syncFullscreenUi();
  startEventStream(); startPrinterStream();
  const [config, settings] = await Promise.allSettled([json('/api/config'), json('/api/settings')]);
  if (config.status === 'fulfilled') state.config = config.value;
  if (settings.status === 'fulfilled') { state.settings = settings.value; document.documentElement.style.setProperty('--accent', state.settings.accent); }
  // Construct the media controller before the heavier 3D knowledge graph and
  // knowledge fetch. Camera gestures should be immediately usable even if the
  // visual index is still loading or a private knowledge root is slow.
  state.gesture = new GestureController({
    video: ui.gestureVideo, canvas: ui.gestureCanvas, cursor: ui.gestureCursor,
    onGesture: (gesture) => state.galaxy?.gesture(gesture), onStatus: (message) => { ui.gestureState.textContent = message; }
  });
  window.__jarvisReady = true;
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
    onTranscript: ({ text, final, accepted = true }) => {
      // A speech provider can emit confident text while the physical audio
      // gate is quiet. VoiceController marks those guesses rejected; do not
      // surface them in the command window or overwrite the user's text.
      if (accepted === false) return;
      if (state.voiceCapture.active) { updateVoiceCommandTranscript(text, final); return; }
      if (!final) return;
      const transcript = String(text || '').trim();
      // Recognition providers can emit a delayed empty/final segment after a
      // listener is stopped. Never let that clear a typed command. Likewise,
      // a live provider result must not overwrite text while the user is
      // actively editing the directive field.
      if (!shouldApplyTranscriptToInput(transcript, { focused: document.activeElement === ui.prompt, currentValue: ui.prompt?.value })) return;
      if (ui.searchDialog.open) { ui.searchInput.value = transcript; renderSearchResults({ resetSelection: true }); }
      else if (ui.prompt && !(document.activeElement === ui.prompt && ui.prompt.value.trim())) ui.prompt.value = transcript;
    },
    onCapture: updateVoiceCapture,
    onError: (error) => { appendMessage('error', error.message); updateVoiceVisual('error', 1); }
  });
  state.voice.configure(state.settings || {});
  updateVoiceVisual('standby', .12);
  // The deterministic Camoufox smoke profile must not claim the fake mic in
  // the background before its explicit capture checks. Production pages still
  // retain the normal granted-permission auto-start path.
  if (!isEmbeddedPreview() && !isSmokeMode()) void state.voice.autoStartIfGranted(state.settings).catch(() => {});
  if (!isEmbeddedPreview()) void autoStartGesturesIfGranted();
  await Promise.all([refreshFast({ force: true }), refreshSlow({ force: true }), refreshAgentLive({ force: true })]);
  state.agentLive.timer = window.setInterval(() => void refreshAgentLive(), 700);
  setInterval(() => void refreshFast(), 2500); setInterval(() => void refreshSlow(), 7000);
}

void init();
