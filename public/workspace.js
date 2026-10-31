const $ = (selector) => document.querySelector(selector);
const ui = {
  healthDot: $('#workspace-health-dot'), health: $('#workspace-health'), node: $('#workspace-node'), clock: $('#workspace-clock'),
  phase: $('#workspace-phase'), stateOrb: $('#workspace-state-orb'), stateTitle: $('#workspace-state-title'), stateCopy: $('#workspace-state-copy'),
  tool: $('#workspace-tool'), elapsed: $('#workspace-elapsed'), serviceCount: $('#workspace-service-count'), serviceList: $('#workspace-service-list'),
  printerState: $('#workspace-printer-state'), printerFile: $('#workspace-printer-file'), printerProgress: $('#workspace-printer-progress'),
  printerPercent: $('#workspace-printer-percent'), printerRemaining: $('#workspace-printer-remaining'), nozzle: $('#workspace-nozzle'), bed: $('#workspace-bed'),
  screenTitle: $('#workspace-screen-title'), screenState: $('#workspace-screen-state'), frame: $('#workspace-frame'), screenShareVideo: $('#workspace-screen-share-video'), screenShareToggle: $('#workspace-screen-share-toggle'), screenExplain: $('#workspace-screen-explain'), screenCompact: $('#workspace-screen-compact'), screenFocus: $('#workspace-screen-focus'), screenFullscreen: $('#workspace-screen-fullscreen'), screenStage: $('#workspace-screen-stage'), screenCanvas: $('#workspace-screen-canvas'), screenExplanation: $('#workspace-screen-explanation'), screenExplanationCopy: $('#workspace-screen-explanation-copy'), screenShareState: $('#workspace-screen-share-state'), placeholder: $('#workspace-screen-placeholder'), websiteForm: $('#workspace-website-form'), websiteInput: $('#workspace-website-input'), websiteOpen: $('#workspace-website-open'), websiteRefresh: $('#workspace-website-refresh'), websiteStatus: $('#workspace-website-status'),
  placeholderTitle: $('#workspace-placeholder-title'), placeholderCopy: $('#workspace-placeholder-copy'), frameDot: $('#workspace-frame-dot'), frameState: $('#workspace-frame-state'), frameTime: $('#workspace-frame-time'),
  cameraFrame: $('#workspace-camera-frame'), cameraPlaceholder: $('#workspace-camera-placeholder'), cameraState: $('#workspace-camera-state'), cameraSource: $('#workspace-camera-source'), cameraDevice: $('#workspace-camera-device'), cameraTime: $('#workspace-camera-time'),
  printerCameraFrame: $('#workspace-printer-camera-frame'), printerCameraPlaceholder: $('#workspace-printer-camera-placeholder'), printerCameraState: $('#workspace-printer-camera-state'), printerCameraHost: $('#workspace-printer-camera-host'), printerCameraTime: $('#workspace-printer-camera-time'),
  runStatus: $('#workspace-run-status'), taskCopy: $('#workspace-task-copy'), route: $('#workspace-route'), model: $('#workspace-model'), directiveForm: $('#workspace-directive-form'), directiveInput: $('#workspace-directive-input'), directivePlan: $('#workspace-directive-plan'), directiveRun: $('#workspace-directive-run'), directiveTalk: $('#workspace-directive-talk'), directiveStatus: $('#workspace-directive-status'), missionPlan: $('#workspace-mission-plan'), missionPlanMode: $('#workspace-mission-plan-mode'), missionPlanSummary: $('#workspace-mission-plan-summary'), missionPlanRoute: $('#workspace-mission-plan-route'), missionPlanSpecialists: $('#workspace-mission-plan-specialists'), missionPlanApprovals: $('#workspace-mission-plan-approvals'), missionPlanSteps: $('#workspace-mission-plan-steps'), missionPlanWarnings: $('#workspace-mission-plan-warnings'), eventCount: $('#workspace-event-count'), events: $('#workspace-events'), capabilityCount: $('#workspace-capability-count'), capabilityList: $('#workspace-capability-list'), analyticsWindow: $('#workspace-analytics-window'), analyticsEvents: $('#workspace-analytics-events'), analyticsWake: $('#workspace-analytics-wake'), analyticsCpu: $('#workspace-analytics-cpu'), analyticsRam: $('#workspace-analytics-ram'), analyticsServices: $('#workspace-analytics-services'), analyticsBroadcast: $('#workspace-analytics-broadcast'), analyticsNote: $('#workspace-analytics-note'), mediaState: $('#workspace-media-state'), mediaTitle: $('#workspace-media-title'), mediaQueue: $('#workspace-media-queue'), mediaHistory: $('#workspace-media-history'), mediaNote: $('#workspace-media-note'), liveDeckState: $('#workspace-live-deck-state'), liveDeckObs: $('#workspace-live-deck-obs'), liveDeckScene: $('#workspace-live-deck-scene'), liveDeckStream: $('#workspace-live-deck-stream'), liveDeckRecord: $('#workspace-live-deck-record'), liveDeckMedia: $('#workspace-live-deck-media'), liveDeckAutomation: $('#workspace-live-deck-automation'), liveDeckHealth: $('#workspace-live-deck-health'), liveDeckDropped: $('#workspace-live-deck-dropped'), liveDeckReplay: $('#workspace-live-deck-replay'), liveDeckVcam: $('#workspace-live-deck-vcam'), liveDeckNote: $('#workspace-live-deck-note'), multiDeckState: $('#workspace-multi-deck-state'), multiDeckObs: $('#workspace-multi-deck-obs'), multiDeckVoice: $('#workspace-multi-deck-voice'), multiDeckTwitch: $('#workspace-multi-deck-twitch'), multiDeckJarvis: $('#workspace-multi-deck-jarvis'), multiDeckMusic: $('#workspace-multi-deck-music'), multiDeckSocials: $('#workspace-multi-deck-socials'), multiDeckDesktop: $('#workspace-multi-deck-desktop'), multiDeckViewers: $('#workspace-multi-deck-viewers'), multiDeckChat: $('#workspace-multi-deck-chat'), multiDeckBitrate: $('#workspace-multi-deck-bitrate'), multiDeckNowPlaying: $('#workspace-multi-deck-now-playing'), multiDeckAutomations: $('#workspace-multi-deck-automations'), multiDeckAgents: $('#workspace-multi-deck-agents'), multiDeckNote: $('#workspace-multi-deck-note')
};
const state = { frameVersion: 0, live: null, printer: null, startedAt: 0, screenStream: null, screenRequest: 0, screenBusy: false, previewBusy: false, previewAutoBusy: false, previewRefreshQueued: false, previewRequest: 0, previewRefreshTimer: 0, directiveBusy: false, planBusy: false, talkBusy: false, lastDirectiveText: '', compactView: false, focusView: false, screenRetryTimer: 0, screenRetryCountdownTimer: 0, screenRetryDueAt: 0, screenRetryable: false, screenRetryRequested: false, screenRetryAttempts: 0, cameraTimer: 0, printerCameraAt: 0, printerCameraDiscoveryStarted: false, printerCameraDiscoveryTimer: 0, printerCameraDiscoveryBusy: false, camera: { settings: null, devices: [], available: false }, printerCamera: { configured: false } };
const SCREEN_RETRY_DELAY_MS = 20_000;
const PREVIEW_REFRESH_INTERVAL_MS = 45_000;
const PRINTER_CAMERA_DISCOVERY_RETRY_MS = 30_000;

async function request(url, options = {}) {
  const response = await (window.jarvisFetch || fetch)(url, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function text(element, value) { if (element) element.textContent = String(value ?? '—'); }
function websitePrompt(value) {
  const target = String(value || '').replace(/[\0\r\n]+/g, ' ').trim().slice(0, 300);
  return target ? `open ${target}` : '';
}
function clock() {
  const now = new Date();
  text(ui.clock, now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour12: false }));
  if (state.live?.startedAt) {
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(state.live.startedAt)) / 1000));
    const minutes = Math.floor(seconds / 60); const hours = Math.floor(minutes / 60);
    text(ui.elapsed, hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`);
  } else text(ui.elapsed, '—');
}
function compactDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--';
  const minutes = Math.round(value / 60); const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}
function localScreenActive() { return Boolean(state.screenStream?.active && state.screenStream.getVideoTracks().some((track) => track.readyState === 'live')); }
function agentFrameVisible() { return Boolean(ui.frame && !ui.frame.hidden && ui.frame.complete && ui.frame.naturalWidth > 0); }
function printerCameraVisible() { return Boolean(ui.printerCameraFrame && !ui.printerCameraFrame.hidden && ui.printerCameraFrame.complete && ui.printerCameraFrame.naturalWidth > 0); }
function canExplainVisibleScreen() { return localScreenActive() || agentFrameVisible() || printerCameraVisible(); }
function explainSourceLabel() {
  if (localScreenActive()) return 'the selected local screen';
  if (agentFrameVisible()) return 'the protected browser frame';
  if (printerCameraVisible()) return 'the printer camera frame';
  return 'the selected view';
}
function syncExplainButton() { if (ui.screenExplain) ui.screenExplain.disabled = state.screenBusy || !canExplainVisibleScreen(); }
function renderFrameFooter() {
  if (state.focusView) { text(ui.frameTime, 'LOCAL FOCUS // PAGE UNCHANGED'); return; }
  if (localScreenActive()) { text(ui.frameTime, 'LOCAL ONLY // NO UPLOAD'); return; }
  text(ui.frameTime, state.live?.updatedAt ? `UPDATED ${new Date(state.live.updatedAt).toLocaleTimeString('en-GB', { hour12: false })}` : 'LOCAL ONLY // PROTECTED');
}
function setLocalScreenUi(active) {
  if (ui.screenShareToggle) { if (active) ui.screenShareToggle.setAttribute('data-active', 'true'); else ui.screenShareToggle.removeAttribute('data-active'); }
  if (ui.screenShareToggle) ui.screenShareToggle.textContent = active ? 'STOP SCREEN SHARE' : 'SHARE YOUR SCREEN';
  text(ui.screenShareState, active ? 'LOCAL SCREEN LIVE // NO UPLOAD' : 'LOCAL SCREEN OFF // NO UPLOAD');
  syncExplainButton();
}
function restoreAgentFrameAfterLocalScreen() {
  if (state.live) renderLive(state.live);
  else {
    ui.screenShareVideo && (ui.screenShareVideo.hidden = true);
    ui.frame && (ui.frame.hidden = true);
    ui.placeholder && (ui.placeholder.hidden = false);
    text(ui.screenState, 'ARMED'); text(ui.screenTitle, 'PRIVATE AGENT VIEW'); text(ui.frameState, 'NO FRAME');
  }
}
function clearScreenRetry() {
  if (state.screenRetryTimer) { clearTimeout(state.screenRetryTimer); state.screenRetryTimer = 0; }
  if (state.screenRetryCountdownTimer) { clearInterval(state.screenRetryCountdownTimer); state.screenRetryCountdownTimer = 0; }
  state.screenRetryDueAt = 0;
  state.screenRetryRequested = false;
}
function renderScreenRetryCountdown() {
  const seconds = Math.max(0, Math.ceil((state.screenRetryDueAt - Date.now()) / 1000));
  text(ui.screenShareState, seconds ? `SCREEN RELEASED // RETRY IN ${seconds}s` : 'RETRYING SCREEN SHARE');
  return seconds;
}
function scheduleScreenRetry() {
  if (!state.screenRetryable || !state.screenRetryRequested || state.screenRetryTimer || state.screenRetryAttempts >= 1) return;
  state.screenRetryDueAt = Date.now() + SCREEN_RETRY_DELAY_MS;
  renderScreenRetryCountdown();
  state.screenRetryCountdownTimer = window.setInterval(() => {
    if (!state.screenRetryDueAt || renderScreenRetryCountdown() <= 0) {
      if (state.screenRetryCountdownTimer) { clearInterval(state.screenRetryCountdownTimer); state.screenRetryCountdownTimer = 0; }
    }
  }, 250);
  text(ui.placeholderTitle, 'SCREEN LINK RELEASED');
  text(ui.placeholderCopy, 'Escape or the browser stopped the selected display. JARVIS will make one bounded retry in 20 seconds.');
  state.screenRetryTimer = window.setTimeout(() => {
    state.screenRetryTimer = 0;
    state.screenRetryDueAt = 0;
    if (state.screenRetryCountdownTimer) { clearInterval(state.screenRetryCountdownTimer); state.screenRetryCountdownTimer = 0; }
    if (!state.screenRetryable || localScreenActive()) return;
    state.screenRetryAttempts += 1;
    text(ui.screenShareState, 'RETRYING SCREEN SHARE');
    void toggleLocalScreenShare({ automaticRetry: true });
  }, SCREEN_RETRY_DELAY_MS);
}
function handleScreenRelease() {
  if (!state.screenStream && !state.screenRetryable) return;
  state.screenRetryable = true;
  state.screenRetryRequested = true;
  if (state.screenStream) stopLocalScreenShare({ preserveRetry: true });
  scheduleScreenRetry();
}
function stopLocalScreenShare({ preserveRetry = false } = {}) {
  state.screenRequest += 1;
  const stream = state.screenStream;
  state.screenStream = null;
  // The agent frame may have the same version as before the local share. Force
  // renderLive() to re-attach it after the user stops sharing their screen.
  state.frameVersion = -1;
  stream?.getTracks().forEach((track) => track.stop());
  if (ui.screenShareVideo) { ui.screenShareVideo.pause(); ui.screenShareVideo.srcObject = null; ui.screenShareVideo.hidden = true; }
  if (!preserveRetry) { state.screenRetryable = false; state.screenRetryAttempts = 0; clearScreenRetry(); }
  setLocalScreenUi(false);
  restoreAgentFrameAfterLocalScreen();
}

function clearScreenExplanation() {
  ui.screenExplanation?.setAttribute('hidden', '');
  text(ui.screenExplanationCopy, 'Press EXPLAIN VIEW after sharing a display, when a protected browser frame is visible, or when a printer camera snapshot is live.');
}

function captureVisibleScreenSnapshot() {
  const source = localScreenActive() ? ui.screenShareVideo : agentFrameVisible() ? ui.frame : printerCameraVisible() ? ui.printerCameraFrame : null;
  if (!source) throw new Error('Share a display, wait for a protected browser frame, or wait for a printer camera snapshot first.');
  const sourceWidth = source.videoWidth || source.naturalWidth;
  const sourceHeight = source.videoHeight || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error('The selected screen has not produced a frame yet.');
  // Keep the approved snapshot useful on a Pi 5 without making the vision
  // model ingest a full desktop-sized JPEG. Compact view intentionally uses a
  // smaller frame because its contract is a short visible-summary response.
  const width = Math.min(state.compactView ? 768 : 1024, sourceWidth);
  const height = Math.max(1, Math.round(sourceHeight * width / sourceWidth));
  ui.screenCanvas.width = width; ui.screenCanvas.height = height;
  ui.screenCanvas.getContext('2d', { alpha: false }).drawImage(source, 0, 0, width, height);
  return ui.screenCanvas.toDataURL('image/jpeg', state.compactView ? 0.58 : 0.66);
}

async function explainVisibleScreen() {
  if (state.screenBusy) return;
  state.screenBusy = true;
  if (ui.screenExplain) { ui.screenExplain.disabled = true; ui.screenExplain.textContent = 'READING…'; }
  ui.screenExplanation?.removeAttribute('hidden');
  text(ui.screenExplanationCopy, `JARVIS is reading one approved ${explainSourceLabel()} snapshot locally. It does not receive a continuous screen or camera stream.`);
  try {
    const image = captureVisibleScreenSnapshot();
    const prompt = state.compactView
      ? 'Summarize only the visible website, application, or printer-camera image in 5 short bullets. Include the page title or visible scene, the main content, important visible controls or printer details, and anything that needs attention. Do not infer hidden content. Do not mention ads or suggest bypassing ads, paywalls, login, or permissions.'
      : 'Explain only what is visibly shown in this website, application, or printer-camera image. Identify the page, app, or visible printer scene, its main content or state, important controls or details, and anything that needs attention. Do not infer hidden content and do not suggest bypassing ads, paywalls, login, or permissions.';
    const result = await (window.jarvisFetch || fetch)('/api/screen/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, prompt }) });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(payload.error || `HTTP ${result.status}`);
    text(ui.screenExplanationCopy, payload.content || 'The local vision model returned no visible summary.');
  } catch (error) {
    text(ui.screenExplanationCopy, `VIEW ANALYSIS UNAVAILABLE // ${error.message}`);
  } finally {
    state.screenBusy = false;
    syncExplainButton();
  }
}

function toggleCompactView() {
  state.compactView = !state.compactView;
  if (state.compactView && state.focusView) {
    state.focusView = false;
    ui.screenStage?.classList.remove('focus');
    ui.screenFocus?.setAttribute('aria-pressed', 'false');
    if (ui.screenFocus) ui.screenFocus.textContent = 'FOCUS VIEW';
  }
  ui.screenStage?.classList.toggle('compact', state.compactView);
  ui.screenCompact?.setAttribute('aria-pressed', String(state.compactView));
  if (ui.screenCompact) ui.screenCompact.textContent = state.compactView ? 'FULL VIEW' : 'COMPACT VIEW';
  if (state.compactView) ui.screenExplanation?.removeAttribute('hidden');
}
function toggleFocusView() {
  state.focusView = !state.focusView;
  if (state.focusView && state.compactView) {
    state.compactView = false;
    ui.screenStage?.classList.remove('compact');
    ui.screenCompact?.setAttribute('aria-pressed', 'false');
    if (ui.screenCompact) ui.screenCompact.textContent = 'COMPACT VIEW';
  }
  ui.screenStage?.classList.toggle('focus', state.focusView);
  ui.screenFocus?.setAttribute('aria-pressed', String(state.focusView));
  if (ui.screenFocus) ui.screenFocus.textContent = state.focusView ? 'NORMAL VIEW' : 'FOCUS VIEW';
  renderFrameFooter();
}
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
function stageFullscreenActive() { return Boolean(ui.screenStage && fullscreenElement() === ui.screenStage); }
function syncStageFullscreenUi() {
  const supported = Boolean(ui.screenStage?.requestFullscreen || ui.screenStage?.webkitRequestFullscreen);
  const active = stageFullscreenActive();
  if (ui.screenFullscreen) {
    ui.screenFullscreen.disabled = !supported;
    ui.screenFullscreen.setAttribute('aria-pressed', String(active));
    ui.screenFullscreen.textContent = active ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
    ui.screenFullscreen.title = supported ? (active ? 'Return the JARVIS screen to the workspace' : 'Make the JARVIS screen fill the display') : 'Fullscreen is unavailable in this browser';
  }
}
async function toggleStageFullscreen() {
  if (!ui.screenStage) return;
  try {
    if (stageFullscreenActive()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) await exit.call(document);
    } else {
      const request = ui.screenStage.requestFullscreen || ui.screenStage.webkitRequestFullscreen;
      if (!request) throw new Error('Fullscreen is unavailable in this browser');
      await request.call(ui.screenStage);
    }
  } catch (error) {
    if (ui.screenFullscreen) ui.screenFullscreen.title = `Fullscreen unavailable: ${error.message || 'browser rejected the request'}`;
    console.info(`JARVIS workspace fullscreen unavailable: ${error.message || error}`);
  } finally {
    syncStageFullscreenUi();
  }
}

function renderCameraState({ state: label, device = '', frame = false } = {}) {
  text(ui.cameraState, label || 'NOT SELECTED'); text(ui.cameraDevice, device || 'NO DEVICE');
  if (ui.cameraFrame) ui.cameraFrame.hidden = !frame;
  if (ui.cameraPlaceholder) ui.cameraPlaceholder.hidden = Boolean(frame);
}

async function refreshPiCamera() {
  try {
    const [settings, devices] = await Promise.all([request('/api/settings'), request('/api/media/devices')]);
    const selected = settings?.source === 'pi' ? String(settings.piCamera || '') : '';
    const cameras = Array.isArray(devices?.cameras) ? devices.cameras : [];
    state.camera = { settings, devices: cameras, available: Boolean(selected && cameras.some((item) => item.id === selected)) };
    if (!selected) { renderCameraState({ state: settings?.source === 'browser' ? 'BROWSER SOURCE' : 'NOT SELECTED' }); return; }
    if (!state.camera.available) { renderCameraState({ state: 'OFFLINE', device: selected }); return; }
    const label = cameras.find((item) => item.id === selected)?.label || selected;
    if (ui.cameraFrame) {
      ui.cameraFrame.onload = () => { text(ui.cameraTime, new Date().toLocaleTimeString('en-GB', { hour12: false })); renderCameraState({ state: 'LIVE FRAME', device: label, frame: true }); };
      ui.cameraFrame.onerror = () => { renderCameraState({ state: 'CAPTURE ERROR', device: label }); text(ui.cameraTime, 'RETRYING'); };
      ui.cameraFrame.src = `/api/media/pi-camera/frame.jpg?device=${encodeURIComponent(selected)}&v=${Date.now()}`;
    }
  } catch (error) {
    state.camera = { settings: null, devices: [], available: false };
    renderCameraState({ state: 'UNAVAILABLE' }); text(ui.cameraTime, error.message || 'RETRYING');
  }
}
function renderPrinterCamera(status = {}) {
  state.printerCamera = status || { configured: false };
  const configured = Boolean(status?.configured);
  const host = status?.host || 'NO ENDPOINT';
  text(ui.printerCameraHost, host);
  if (!configured) {
    text(ui.printerCameraState, status?.discovery === 'pending' ? 'DISCOVERING' : status?.discovery === 'not-found' ? 'NOT FOUND' : status?.configError ? 'CONFIG ERROR' : 'NOT CONFIGURED');
    text(ui.printerCameraTime, status?.discovery === 'pending' ? 'CHECKING SAME-HOST WEBCAM PATHS' : status?.configError || (status?.autoDiscovery ? 'NO SNAPSHOT ENDPOINT // SET PRINTER_CAMERA_URL' : 'SET PRINTER_CAMERA_URL'));
    if (ui.printerCameraFrame) ui.printerCameraFrame.hidden = true;
    if (ui.printerCameraPlaceholder) ui.printerCameraPlaceholder.hidden = false;
    syncExplainButton();
    schedulePrinterCameraDiscovery(status);
    return;
  }
  if (ui.printerCameraFrame && Date.now() - state.printerCameraAt >= 5_000) {
    state.printerCameraAt = Date.now();
    ui.printerCameraFrame.onload = () => { text(ui.printerCameraState, 'LIVE SNAPSHOT'); text(ui.printerCameraTime, new Date().toLocaleTimeString('en-GB', { hour12: false })); if (ui.printerCameraPlaceholder) ui.printerCameraPlaceholder.hidden = true; ui.printerCameraFrame.hidden = false; syncExplainButton(); };
    ui.printerCameraFrame.onerror = () => { text(ui.printerCameraState, 'OFFLINE'); text(ui.printerCameraTime, 'RETRYING'); ui.printerCameraFrame.hidden = true; if (ui.printerCameraPlaceholder) ui.printerCameraPlaceholder.hidden = false; syncExplainButton(); };
    ui.printerCameraFrame.src = `${status.endpoint || '/api/media/printer-camera/frame.jpg'}?v=${Date.now()}`;
  }
}
function schedulePrinterCameraDiscovery(status = {}) {
  if (!status?.autoDiscovery || status?.discovery === 'found' || state.printerCameraDiscoveryTimer) return;
  state.printerCameraDiscoveryTimer = window.setTimeout(() => {
    state.printerCameraDiscoveryTimer = 0;
    void discoverPrinterCamera({ ...status, retry: status.discovery === 'not-found' });
  }, status.discovery === 'pending' ? 0 : PRINTER_CAMERA_DISCOVERY_RETRY_MS);
}
async function discoverPrinterCamera(status = {}) {
  if (!status?.autoDiscovery || state.printerCameraDiscoveryBusy) return;
  if (status.discovery === 'pending' && state.printerCameraDiscoveryStarted) return;
  state.printerCameraDiscoveryBusy = true;
  state.printerCameraDiscoveryStarted = true;
  try {
    const retry = status.discovery === 'not-found' ? '?retry=1' : '';
    const response = await (window.jarvisFetch || fetch)(`/api/media/printer-camera/discover${retry}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    renderPrinterCamera(payload);
  } catch (error) {
    renderPrinterCamera({ ...status, discovery: 'not-found', configError: error.message || 'Printer camera discovery failed.' });
  } finally {
    state.printerCameraDiscoveryBusy = false;
    if (state.printerCamera?.configured && state.printerCameraDiscoveryTimer) { clearTimeout(state.printerCameraDiscoveryTimer); state.printerCameraDiscoveryTimer = 0; }
  }
}
async function toggleLocalScreenShare({ automaticRetry = false } = {}) {
  if (localScreenActive()) { stopLocalScreenShare(); return; }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    text(ui.screenShareState, 'SCREEN CAPTURE UNAVAILABLE');
    text(ui.placeholderTitle, 'SCREEN CAPTURE UNAVAILABLE');
    text(ui.placeholderCopy, 'Use a current browser on localhost or HTTPS to share a screen locally.');
    return;
  }
  const requestId = ++state.screenRequest;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 12, max: 20 } }, audio: false });
    if (!stream.getVideoTracks().length) throw new Error('No screen track returned');
    if (requestId !== state.screenRequest) { stream.getTracks().forEach((track) => track.stop()); return; }
    state.screenStream = stream;
    state.screenRetryable = true;
    state.screenRetryRequested = false;
    state.screenRetryAttempts = automaticRetry ? state.screenRetryAttempts : 0;
    stream.getVideoTracks().forEach((track) => track.addEventListener('ended', handleScreenRelease, { once: true }));
    if (ui.screenShareVideo) { ui.screenShareVideo.srcObject = stream; ui.screenShareVideo.hidden = false; }
    // Reflect a granted local stream immediately. Video playback can take a
    // few frames to resolve (especially on Pi/remote Chromium); delaying the
    // state badge made a working capture look OFF and allowed a second click
    // to race the first request.
    ui.frame && (ui.frame.hidden = true); ui.frame?.removeAttribute('src'); ui.placeholder && (ui.placeholder.hidden = true);
    setLocalScreenUi(true);
    text(ui.screenState, 'LOCAL SCREEN'); text(ui.screenTitle, 'YOUR SELECTED SCREEN'); text(ui.frameState, 'LOCAL SCREEN'); text(ui.frameTime, 'LOCAL ONLY // NO UPLOAD');
    if (ui.screenShareVideo) await ui.screenShareVideo.play().catch(() => {});
    if (requestId !== state.screenRequest || state.screenStream !== stream) { stream.getTracks().forEach((track) => track.stop()); return; }
  } catch (error) {
    if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') console.warn('Local screen share failed', error);
    setLocalScreenUi(false);
    if (automaticRetry) {
      state.screenRetryable = false;
      state.screenRetryRequested = false;
      text(ui.screenShareState, 'SCREEN RETRY NEEDS CLICK');
      text(ui.placeholderTitle, 'SCREEN CAPTURE NEEDS APPROVAL');
      text(ui.placeholderCopy, 'The browser requires a fresh user gesture before another display can be selected. Press SHARE YOUR SCREEN once.');
    }
  }
}

async function openWorkspaceWebsite(event) {
  event?.preventDefault();
  const prompt = websitePrompt(ui.websiteInput?.value);
  if (!prompt) { text(ui.websiteStatus, 'Enter a public URL or a supported site alias first.'); ui.websiteInput?.focus(); return; }
  // A previous short-lived preview may already have an auto-refresh timer.
  // Cancel that timer before a new navigation so it cannot disable the fresh
  // preview button or race the new Camoufox page while the user is opening it.
  clearPreviewRefreshTimer();
  state.previewBusy = false;
  state.previewAutoBusy = false;
  state.previewRefreshQueued = false;
  if (ui.websiteRefresh) { ui.websiteRefresh.textContent = 'REFRESH PREVIEW'; ui.websiteRefresh.disabled = !(state.live?.viewKind === 'browser-preview' && Boolean(state.live?.previewUrl)); }
  if (ui.websiteOpen) { ui.websiteOpen.disabled = true; ui.websiteOpen.textContent = 'OPENING…'; }
  text(ui.websiteStatus, 'Validating public URL // launching isolated profile…');
  try {
    const response = await (window.jarvisFetch || fetch)('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    const opened = payload.action?.type === 'open_url';
    text(ui.websiteStatus, opened
      ? `OPENED ${new URL(payload.action.url).hostname} // press SHARE YOUR SCREEN to watch it here`
      : String(payload.content || 'The browser did not return an open confirmation.').slice(0, 240));
    if (opened) {
      text(ui.placeholderTitle, 'WEBSITE READY TO SHARE');
      text(ui.placeholderCopy, 'The isolated JARVIS browser opened the public page. Press SHARE YOUR SCREEN to select that window or display, then use EXPLAIN VIEW for one local snapshot.');
      // The navigation and the short-lived screenshot use separate bounded
      // operations. If the first capture loses a Camoufox slot or times out,
      // make one explicit read-only retry so the own-screen preview can still
      // recover without asking the user to reopen the site.
      if (payload.action.preview !== 'ready-read-only' && payload.action.url) {
        try {
          await request('/api/browser/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: payload.action.url }) });
        } catch {}
      }
    }
  } catch (error) {
    text(ui.websiteStatus, `OPEN FAILED // ${error.message || 'public navigation rejected'}`);
  } finally {
    if (ui.websiteOpen) { ui.websiteOpen.disabled = false; ui.websiteOpen.textContent = 'OPEN WEBSITE'; }
  }
}
function clearPreviewRefreshTimer() {
  if (state.previewRefreshTimer) { clearTimeout(state.previewRefreshTimer); state.previewRefreshTimer = 0; }
  state.previewBusy = false;
  state.previewAutoBusy = false;
  state.previewRefreshQueued = false;
  // Invalidate a refresh already in flight. Its late response may finish on
  // the server, but it must not put the new navigation back into a disabled
  // or stale UI state.
  state.previewRequest += 1;
}
function schedulePreviewRefresh() {
  if (state.previewRefreshTimer || state.previewBusy || state.screenStream || state.live?.viewKind !== 'browser-preview' || !state.live?.visible) return;
  state.previewRefreshTimer = window.setTimeout(() => {
    state.previewRefreshTimer = 0;
    if (document.visibilityState === 'hidden') { schedulePreviewRefresh(); return; }
    void refreshWorkspacePreview({ automatic: true });
  }, PREVIEW_REFRESH_INTERVAL_MS);
}
async function refreshWorkspacePreview({ automatic = false } = {}) {
  if (state.previewBusy) {
    if (!automatic) {
      state.previewRefreshQueued = true;
      text(ui.websiteStatus, 'PREVIEW REFRESH QUEUED // WAITING FOR CURRENT FRAME');
    }
    return;
  }
  const url = String(state.live?.previewUrl || '').trim();
  if (!url) { text(ui.websiteStatus, 'OPEN A PUBLIC WEBSITE FIRST // NO PREVIEW URL'); return; }
  const requestId = ++state.previewRequest;
  state.previewBusy = true;
  state.previewAutoBusy = automatic;
  if (ui.websiteRefresh) {
    // Automatic refresh is deliberately non-blocking: a manual click made
    // during its bounded request is queued instead of looking disabled.
    ui.websiteRefresh.disabled = automatic ? false : true;
    ui.websiteRefresh.textContent = automatic ? 'REFRESH PREVIEW' : 'REFRESHING…';
  }
  text(ui.websiteStatus, automatic ? 'AUTO-REFRESHING READ-ONLY PREVIEW // NO COOKIES' : 'CAPTURING FRESH READ-ONLY PREVIEW // NO COOKIES');
  try {
    const payload = await request('/api/browser/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    if (requestId !== state.previewRequest) return;
    state.frameVersion = -1;
    text(ui.websiteStatus, `${automatic ? 'PREVIEW AUTO-REFRESHED' : 'PREVIEW REFRESHED'} // ${new URL(payload.preview?.url || url).hostname} // EXPIRES AUTOMATICALLY`);
    await refresh();
  } catch (error) { text(ui.websiteStatus, `PREVIEW REFRESH FAILED // ${error.message || 'try again'}`); }
  finally {
    if (requestId !== state.previewRequest) return;
    const queued = state.previewRefreshQueued;
    state.previewBusy = false;
    state.previewAutoBusy = false;
    state.previewRefreshQueued = false;
    if (ui.websiteRefresh) { ui.websiteRefresh.textContent = 'REFRESH PREVIEW'; ui.websiteRefresh.disabled = !(state.live?.viewKind === 'browser-preview' && Boolean(state.live?.previewUrl)); }
    schedulePreviewRefresh();
    if (queued) void refreshWorkspacePreview();
  }
}
function renderMissionPlanList(element, items, { warning = false } = {}) {
  if (!element) return;
  const values = Array.isArray(items) ? items : [];
  if (!values.length) {
    const item = document.createElement('li');
    item.textContent = warning ? 'NONE // NO BLOCKING WARNING' : 'NONE // DIRECT ANSWER';
    if (warning) item.dataset.kind = 'warning';
    element.replaceChildren(item);
    return;
  }
  element.replaceChildren(...values.slice(0, 6).map((value) => {
    const item = document.createElement('li');
    item.textContent = typeof value === 'string' ? value : String(value?.label || value?.message || value?.id || '—');
    if (warning) item.dataset.kind = 'warning';
    return item;
  }));
}
function renderMissionPlan(plan) {
  if (!plan) return;
  ui.missionPlan?.removeAttribute('hidden');
  text(ui.missionPlanMode, String(plan.executionMode || 'read-only-local').replaceAll('-', ' ').toUpperCase());
  text(ui.missionPlanSummary, plan.orchestration?.mode === 'fan-out-then-synthesize'
    ? `JARVIS will fan out to ${Number(plan.orchestration.specialistCount) || 0} bounded specialist lanes, then synthesize locally. No tool has run.`
    : 'JARVIS will use one bounded specialist lane. This is a preview only; no tool has run.');
  text(ui.missionPlanRoute, `${plan.agent || 'GENERAL'} // ${plan.model || 'LOCAL'}`);
  text(ui.missionPlanSpecialists, `${Number(plan.orchestration?.specialistCount) || 1} ${plan.orchestration?.mode === 'fan-out-then-synthesize' ? 'LANES' : 'LANE'}`);
  text(ui.missionPlanApprovals, `${Array.isArray(plan.approvals) ? plan.approvals.length : 0} REQUIRED`);
  const steps = (Array.isArray(plan.steps) ? plan.steps : []).map((step) => `${String(step.mode || 'read').toUpperCase()} // ${step.label || step.id || 'step'}`);
  const warnings = (Array.isArray(plan.warnings) ? plan.warnings : []).map((warning) => warning.message || warning.code || 'warning');
  renderMissionPlanList(ui.missionPlanSteps, steps);
  renderMissionPlanList(ui.missionPlanWarnings, warnings, { warning: true });
}
async function previewWorkspaceMission() {
  if (state.planBusy) return;
  const prompt = String(ui.directiveInput?.value || '').replace(/[\0\r\n]+/g, ' ').trim().slice(0, 1200);
  if (!prompt) { text(ui.directiveStatus, 'ENTER A DIRECTIVE FIRST'); ui.directiveInput?.focus(); return; }
  state.planBusy = true;
  if (ui.directivePlan) { ui.directivePlan.disabled = true; ui.directivePlan.textContent = 'PLANNING…'; }
  text(ui.directiveStatus, 'BUILDING BOUNDED MISSION PREVIEW // NO EXECUTION');
  try {
    const plan = await request('/api/mission/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    renderMissionPlan(plan);
    text(ui.directiveStatus, `PLAN READY // ${String(plan.executionMode || 'read-only').replaceAll('-', ' ').toUpperCase()}`);
  } catch (error) {
    ui.missionPlan?.removeAttribute('hidden');
    text(ui.missionPlanMode, 'UNAVAILABLE'); text(ui.missionPlanSummary, `MISSION PREVIEW FAILED // ${error.message || 'try again'}`);
    renderMissionPlanList(ui.missionPlanSteps, []); renderMissionPlanList(ui.missionPlanWarnings, ['The request was not executed.'], { warning: true });
    text(ui.directiveStatus, 'PLAN FAILED // REQUEST NOT EXECUTED');
  } finally {
    state.planBusy = false;
    if (ui.directivePlan) { ui.directivePlan.disabled = false; ui.directivePlan.textContent = 'PLAN'; }
  }
}
async function submitWorkspaceDirective(event) {
  event?.preventDefault();
  if (state.directiveBusy) return;
  const prompt = String(ui.directiveInput?.value || '').replace(/[\0\r\n]+/g, ' ').trim().slice(0, 1200);
  if (!prompt) { text(ui.directiveStatus, 'ENTER A DIRECTIVE FIRST'); ui.directiveInput?.focus(); return; }
  state.directiveBusy = true;
  if (ui.directiveRun) { ui.directiveRun.disabled = true; ui.directiveRun.textContent = 'THINKING…'; }
  text(ui.runStatus, 'RUNNING'); text(ui.taskCopy, prompt); text(ui.directiveStatus, 'ROUTING LOCALLY // WAITING FOR JARVIS');
  try {
    const payload = await request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    text(ui.runStatus, payload.route || 'DONE'); text(ui.route, payload.route || 'GENERAL'); text(ui.model, payload.model || 'LOCAL');
    state.lastDirectiveText = String(payload.content || 'JARVIS returned no response.').slice(0, 2_400); text(ui.taskCopy, state.lastDirectiveText);
    if (ui.directiveTalk) ui.directiveTalk.disabled = !state.lastDirectiveText;
    text(ui.directiveStatus, payload.action?.type ? `READY // ${String(payload.action.type).replaceAll('_', ' ').toUpperCase()}` : `DONE // ${payload.source || 'LOCAL ROUTER'}`);
    void refresh();
  } catch (error) {
    text(ui.runStatus, 'ERROR'); text(ui.taskCopy, `Directive failed: ${error.message || 'JARVIS did not return a response.'}`); text(ui.directiveStatus, 'REQUEST FAILED // RETRY');
  } finally {
    state.directiveBusy = false;
    if (ui.directiveRun) { ui.directiveRun.disabled = false; ui.directiveRun.textContent = 'ASK JARVIS'; }
  }
}
async function talkWorkspaceDirective() {
  if (state.talkBusy || !state.lastDirectiveText) return;
  state.talkBusy = true;
  if (ui.directiveTalk) { ui.directiveTalk.disabled = true; ui.directiveTalk.textContent = 'PLAYING…'; }
  text(ui.directiveStatus, 'TALKBACK // REQUESTING JARVIS VOICE');
  try {
    const response = await (window.jarvisFetch || fetch)('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: state.lastDirectiveText.slice(0, 2_400), mode: 'fish' }) });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error || `HTTP ${response.status}`); }
    const bytes = await response.arrayBuffer();
    const url = URL.createObjectURL(new Blob([bytes], { type: response.headers.get('content-type') || 'audio/mpeg' }));
    try {
      const audio = new Audio(url); audio.preload = 'auto'; audio.volume = .95; await audio.play();
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (settled) return; settled = true; clearTimeout(timeout); resolve(); };
        const timeout = window.setTimeout(finish, 15_000);
        audio.addEventListener('ended', finish, { once: true }); audio.addEventListener('error', finish, { once: true });
      });
    } finally { URL.revokeObjectURL(url); }
    text(ui.directiveStatus, 'TALKBACK // COMPLETE');
  } catch (error) { text(ui.directiveStatus, `TALKBACK UNAVAILABLE // ${error.message || 'audio blocked'}`); }
  finally { state.talkBusy = false; if (ui.directiveTalk) { ui.directiveTalk.disabled = !state.lastDirectiveText; ui.directiveTalk.textContent = 'TALK'; } }
}
function renderLive(live) {
  state.live = live; const visible = Boolean(live?.visible); const active = Boolean(live?.active); const preview = live?.viewKind === 'browser-preview';
  const phase = String(live?.phase || 'standby').replaceAll('-', ' ').toUpperCase();
  text(ui.phase, preview ? 'BROWSER PREVIEW' : phase); text(ui.tool, preview ? 'READ-ONLY PREVIEW' : live?.tool || '—'); text(ui.screenState, visible ? (live.frameAvailable ? (preview ? 'BROWSER PREVIEW' : 'LIVE FRAME') : phase) : active ? phase : 'ARMED');
  text(ui.route, live?.route || 'GENERAL');
  text(ui.model, live?.model ? `${live.modelFallback ? 'PRIMARY // ' : ''}${live.model}` : 'LOCAL');
  text(ui.screenTitle, visible ? (preview ? 'PRIVATE BROWSER PREVIEW' : 'PRIVATE AGENT VIEW') : active ? 'AGENT WORKING' : 'PRIVATE AGENT VIEW');
  text(ui.stateTitle, active ? phase : 'READY');
  text(ui.stateCopy, visible ? (preview ? `Read-only preview from ${live.previewTitle || live.previewUrl || 'the public page'}. It expires automatically; SHARE YOUR SCREEN is still required for a continuous local stream.` : 'JARVIS is showing its isolated browser screen while the approved task runs.') : active ? 'JARVIS is processing the task. The screen will appear when a protected browser frame is available.' : 'The private screen is armed. A protected browser or agent task will appear here while it is active.');
  ui.stateOrb?.classList.toggle('active', active); ui.stateOrb?.classList.toggle('live', Boolean(live?.frameAvailable));
  // The live-state event can arrive one turn after a successful preview
  // capture. Keep the explicit refresh action available while the bounded
  // preview URL is still current instead of leaving the button stuck disabled.
  if (ui.websiteRefresh) ui.websiteRefresh.disabled = !(preview && Boolean(live?.previewUrl)) || (state.previewBusy && !state.previewAutoBusy);
  if (preview && visible) schedulePreviewRefresh(); else clearPreviewRefreshTimer();
  ui.frameDot?.classList.toggle('active', Boolean(live?.frameAvailable)); text(ui.frameState, live?.frameAvailable ? (preview ? 'READ-ONLY PREVIEW' : 'LIVE FRAME') : active ? 'WAITING FOR FRAME' : 'NO FRAME');
  if (localScreenActive()) {
    ui.frame && (ui.frame.hidden = true); ui.placeholder && (ui.placeholder.hidden = true); ui.screenShareVideo && (ui.screenShareVideo.hidden = false);
    setLocalScreenUi(true); text(ui.screenState, 'LOCAL SCREEN'); text(ui.screenTitle, 'YOUR SELECTED SCREEN'); text(ui.frameState, 'LOCAL SCREEN'); renderFrameFooter(); clock(); return;
  }
  if (live?.frameAvailable && Number(live.frameVersion) !== state.frameVersion) {
    state.frameVersion = Number(live.frameVersion) || 0; ui.frame.dataset.frameVersion = String(state.frameVersion); ui.frame.hidden = false; ui.placeholder.hidden = true; ui.frame.src = `/api/agent/live-frame?v=${encodeURIComponent(state.frameVersion)}`;
  } else if (!visible) { ui.frame.hidden = true; ui.frame.removeAttribute('src'); ui.placeholder.hidden = false; }
  renderFrameFooter();
  if (ui.screenExplain) ui.screenExplain.disabled = !canExplainVisibleScreen();
  clock();
}
function renderServices(status, workspace, pipeline) {
  const desktopCount = Number(workspace?.desktopApps?.count) || 0;
  const desktopPlatform = String(workspace?.desktopApps?.platform || '').toUpperCase();
  const localModels = Number(status?.services?.ollama?.models?.length) || 0;
  const modelRouterReady = Boolean(status?.services?.ollama?.online && localModels);
  const engineering = pipeline || workspace?.engineering || status?.engineering || {};
  const engineeringRun = engineering.active || engineering.last;
  const engineeringDetail = engineering.busy
    ? `${String(engineeringRun?.phase || 'RUNNING').toUpperCase()} // ${String(engineeringRun?.profile || 'CHECK').toUpperCase()}`
    : engineeringRun?.status
      ? `${String(engineeringRun.status).toUpperCase()} // ${String(engineeringRun.profile || 'CHECK').toUpperCase()}`
      : 'READY // ARCHITECT → CRITIC → DEBUGGER';
  const services = [
    ['OPENJARVIS', Boolean(status?.services?.openjarvis?.online), status?.services?.openjarvis?.detail || 'offline'],
    ['OLLAMA', Boolean(status?.services?.ollama?.online), `${localModels} models`],
    ['MODEL ROUTER', modelRouterReady, modelRouterReady ? `${localModels} local models // AUTO SWITCH` : 'no local models'],
    ['ENGINEERING PIPELINE', Boolean(engineering.available !== false), engineeringDetail],
    ['VISION', Boolean(workspace?.vision?.ready), workspace?.vision?.runtime === 'ready' ? `${workspace.vision.model}${workspace.vision.capabilityVerified === false ? ' // tag fallback' : ''}` : workspace?.vision?.runtime === 'missing' ? 'model missing' : workspace?.vision?.runtime === 'unsupported' ? 'text-only model' : workspace?.vision?.runtime === 'unknown' ? 'probe unavailable' : 'not configured'],
    ['GOOGLE', Boolean(status?.google?.liveVerified), status?.google?.liveVerified ? 'OAuth live' : status?.google?.connected ? 'OAuth configured // VERIFY' : 'not linked'],
    ['OBS', Boolean(status?.services?.obs?.online), status?.services?.obs?.online ? `LIVE // ${status.services.obs.scene || 'ready'} // ${String(status.services.obs.streamHealth || 'idle').toUpperCase()}${status.services.obs.previewScene ? ` // PREVIEW ${status.services.obs.previewScene}` : ''}${status.services.obs.replayBuffer ? ' // REPLAY' : ''}${status.services.obs.virtualCamera ? ' // V-CAM' : ''}` : status?.services?.obs?.configured ? status.services.obs.detail || 'offline' : 'not configured'],
    ['PRINTER', Boolean(state.printer?.online), state.printer?.online ? String(state.printer.state || 'ready') : 'offline'],
    ['PRINTER CAMERA', Boolean(workspace?.printerCamera?.configured), workspace?.printerCamera?.configured ? `${workspace.printerCamera.host || 'same host'} // snapshot` : 'not configured'],
    ['PI CAMERA', Boolean(workspace?.camera?.available || state.camera.available), workspace?.camera?.available ? `${workspace.camera.selected || 'selected'} // live frame` : state.camera.settings?.source === 'browser' ? 'browser source selected' : 'not selected'],
    ['HOST APPS', desktopCount > 0, desktopCount > 0 ? `${desktopCount} discovered${desktopPlatform ? ` // ${desktopPlatform}` : ''}` : 'catalog unavailable']
  ];
  const online = services.filter((item) => item[1]).length; text(ui.serviceCount, `${online}/${services.length}`);
  ui.serviceList.replaceChildren(...services.map(([name, ok, detail]) => { const row = document.createElement('div'); row.className = 'workspace-service'; const dot = document.createElement('i'); dot.className = ok ? 'online' : ''; const label = document.createElement('span'); label.textContent = name; const value = document.createElement('b'); value.textContent = detail; row.append(dot, label, value); return row; }));
  ui.healthDot?.classList.toggle('online', online >= 2); text(ui.health, online >= 2 ? 'SYSTEM NOMINAL' : 'DEGRADED');
}
function renderPrinter(printer) {
  state.printer = printer; const progress = Math.max(0, Math.min(1, Number(printer?.progress) || 0));
  text(ui.printerState, printer?.online ? String(printer.state || 'READY').toUpperCase() : 'OFFLINE'); text(ui.printerFile, printer?.filename || 'NO ACTIVE FILE');
  ui.printerProgress.style.width = `${Math.round(progress * 100)}%`; text(ui.printerPercent, `${Math.round(progress * 100)}%`); text(ui.printerRemaining, `ETA ${compactDuration(printer?.remaining)}`);
  text(ui.nozzle, Number.isFinite(Number(printer?.temperatures?.nozzle)) ? `${Math.round(printer.temperatures.nozzle)}°` : '--'); text(ui.bed, Number.isFinite(Number(printer?.temperatures?.bed)) ? `${Math.round(printer.temperatures.bed)}°` : '--');
}
function renderEvents(snapshot) {
  const events = Array.isArray(snapshot?.events) ? snapshot.events.slice(0, 14) : []; text(ui.eventCount, events.length);
  if (!events.length) { ui.events.innerHTML = '<p>Waiting for local activity…</p>'; return; }
  ui.events.replaceChildren(...events.map((event) => { const row = document.createElement('article'); row.className = `workspace-event workspace-event-${String(event.type || 'system').toLowerCase()}`; const time = document.createElement('time'); time.textContent = event.at ? new Date(event.at).toLocaleTimeString('en-GB', { hour12: false }) : '--:--:--'; const kind = document.createElement('b'); kind.textContent = String(event.type || 'system').toUpperCase(); const message = document.createElement('span'); message.textContent = event.message || ''; row.append(time, kind, message); return row; }));
}
function renderCapabilities(snapshot) {
  const items = Array.isArray(snapshot?.capabilities) ? snapshot.capabilities : [];
  const ready = items.filter((item) => item.status?.available).length;
  text(ui.capabilityCount, `${ready}/${items.length}`);
  if (!items.length) { ui.capabilityList.innerHTML = '<p>No capability data yet…</p>'; return; }
  ui.capabilityList.replaceChildren(...items.map((item) => {
    const row = document.createElement('div'); row.className = 'workspace-capability';
    const dot = document.createElement('i'); dot.className = item.status?.available ? 'online' : '';
    const copy = document.createElement('span'); const label = document.createElement('b'); label.textContent = item.label || item.id; const detail = document.createElement('small'); detail.textContent = item.status?.detail || 'offline'; copy.append(label, detail);
    const tag = document.createElement('em'); tag.textContent = item.requiresApproval ? 'PIN' : item.localOnly ? 'LOCAL' : 'WEB';
    row.append(dot, copy, tag); return row;
  }));
}
function renderAnalytics(snapshot) {
  const events = snapshot?.events || {};
  const byType = events.byType || {};
  const host = snapshot?.host || {};
  const services = snapshot?.services || {};
  const broadcast = snapshot?.broadcast || {};
  text(ui.analyticsWindow, `${Number(events.windowHours) || 24}H`);
  text(ui.analyticsEvents, Number(events.events) || 0);
  text(ui.analyticsWake, Number(byType.wake) || 0);
  text(ui.analyticsCpu, `${Math.round(Number(host.cpuPercent) || 0)}%`);
  text(ui.analyticsRam, `${Math.round(Number(host.ramPercent) || 0)}%`);
  text(ui.analyticsServices, `${Number(services.online) || 0}/${Number(services.total) || 0}`);
  text(ui.analyticsBroadcast, (Number(broadcast.timers) || 0) + (Number(broadcast.polls) || 0) + (Number(broadcast.giveaways) || 0));
  text(ui.analyticsNote, snapshot?.readOnly === true ? 'Host-local counts only // no telemetry upload.' : 'Analytics unavailable.');
}
function renderMediaDeck(snapshot) {
  const current = snapshot?.mediaDeck?.state?.current || null;
  const queue = snapshot?.mediaDeck?.state?.queue || [];
  const history = snapshot?.mediaDeck?.state?.history || [];
  text(ui.mediaState, snapshot?.mediaDeck?.externalConnected === false ? 'LOCAL' : 'CHECK');
  text(ui.mediaTitle, current?.title || 'NO MEDIA STAGED');
  text(ui.mediaQueue, queue.length);
  text(ui.mediaHistory, history.length);
  text(ui.mediaNote, snapshot?.mediaDeck?.externalConnected === false ? 'Host-local staging only // no external service writes.' : 'Media deck unavailable.');
}
function renderLiveDeck(status, workspace) {
  const obs = status?.services?.obs || {};
  const media = workspace?.mediaDeck?.state || {};
  const routines = workspace?.routines || {};
  const currentMedia = media.current?.title || 'EMPTY';
  const obsConfigured = Boolean(obs.configured);
  const obsOnline = Boolean(obs.online);
  const streamActive = Boolean(obs.streaming);
  const recordActive = Boolean(obs.recording);
  const activeRoutines = Number(routines.active) || 0;
  const totalRoutines = Number(routines.count) || 0;
  const streamHealth = String(obs.streamHealth || 'idle').toUpperCase();
  const droppedPercent = Number(obs.streamDroppedPercent);
  const deckState = obsOnline ? (streamActive ? 'LIVE' : recordActive ? 'RECORDING' : 'READY') : obsConfigured ? 'OFFLINE' : 'LOCAL STAGE';
  text(ui.liveDeckState, deckState);
  text(ui.liveDeckObs, obsOnline ? (streamActive ? 'LIVE' : recordActive ? 'REC' : 'READY') : obsConfigured ? 'OFFLINE' : 'N/A');
  text(ui.liveDeckScene, obsOnline && obs.scene ? obs.scene : '—');
  text(ui.liveDeckStream, streamActive ? String(obs.streamHealth || 'GOOD').toUpperCase() : 'OFF');
  text(ui.liveDeckRecord, recordActive ? (obs.recordingPaused ? 'PAUSED' : 'ON') : 'OFF');
  text(ui.liveDeckMedia, currentMedia);
  text(ui.liveDeckAutomation, totalRoutines ? `${activeRoutines}/${totalRoutines}` : '0');
  text(ui.liveDeckHealth, obsOnline ? streamHealth : 'N/A');
  text(ui.liveDeckDropped, obsOnline && Number.isFinite(droppedPercent) ? `${(droppedPercent * 100).toFixed(2)}%` : '--');
  text(ui.liveDeckReplay, obsOnline ? (obs.replayBuffer ? 'ON' : 'OFF') : '--');
  text(ui.liveDeckVcam, obsOnline ? (obs.virtualCamera ? 'ON' : 'OFF') : '--');
  text(ui.liveDeckNote, obsOnline ? 'OBS state is read-only here; controls remain PIN-and-phrase gated.' : 'OBS is not connected; local media and routines remain available.');
}
function renderMultiPurposeDeck(workspace, status = {}) {
  const deck = workspace?.multiPurposeDeck || {};
  const stats = deck.stats || {};
  const desktop = deck.desktop || {};
  const social = deck.social || {};
  const audio = deck.audio || {};
  const broadcast = deck.broadcast || {};
  const agents = deck.agents || {};
  const obs = status?.services?.obs || {};
  const statsObs = stats.obs || {};
  const statsVoice = stats.voice || {};
  const statsTwitch = stats.twitch || social.twitch || {};
  const statsJarvis = stats.jarvis || {};
  const statsMusic = stats.music || {};
  const statsSocials = stats.socials || {};
  const statsDesktop = stats.desktop || desktop;
  const statsAutomation = stats.automation || {};
  const statsAgents = stats.agents || agents;
  const socialReady = Boolean(statsSocials.connected || social.twitch?.connected || social.discord?.connected);
  text(ui.multiDeckState, deck.mode === 'local-first' ? 'LOCAL FIRST' : 'STANDBY');
  text(ui.multiDeckObs, statsObs.state ? String(statsObs.state).toUpperCase() : (obs.online ? 'READY' : obs.configured ? 'OFFLINE' : 'LOCAL'));
  text(ui.multiDeckVoice, statsVoice.state ? `${String(statsVoice.state).toUpperCase()}${statsVoice.gate && statsVoice.gate !== 'n/a' ? ` / ${String(statsVoice.gate).toUpperCase()}` : ''}` : 'BROWSER');
  text(ui.multiDeckTwitch, statsTwitch.connected ? 'LINKED' : 'READ ONLY');
  text(ui.multiDeckJarvis, statsJarvis.online === false ? 'OFFLINE' : 'ONLINE');
  text(ui.multiDeckMusic, statsMusic.state ? String(statsMusic.state).toUpperCase() : (audio.playing ? 'PLAYING' : audio.queue ? `${audio.queue} QUEUED` : 'IDLE'));
  text(ui.multiDeckSocials, socialReady ? 'LINKED' : String(statsSocials.mode || 'PUBLIC ONLY').toUpperCase());
  text(ui.multiDeckDesktop, statsDesktop.count != null ? `${statsDesktop.count || 0} APPS` : (desktop.available ? `${desktop.count || 0} APPS` : 'OFFLINE'));
  text(ui.multiDeckViewers, statsTwitch.viewers == null ? 'N/A' : statsTwitch.viewers);
  text(ui.multiDeckChat, statsTwitch.chatters == null ? 'LOCAL ONLY' : statsTwitch.chatters);
  text(ui.multiDeckBitrate, statsTwitch.bitrate == null ? (obs.online ? 'OBS DATA' : 'N/A') : statsTwitch.bitrate);
  text(ui.multiDeckNowPlaying, statsMusic.nowPlaying || audio.playing || audio.queue ? (statsMusic.nowPlaying || audio.playing || `${audio.queue} QUEUED`) : 'NONE');
  const automationTotal = Number(statsAutomation.timers || 0) + Number(statsAutomation.polls || 0) + Number(statsAutomation.giveaways || 0);
  text(ui.multiDeckAutomations, `${automationTotal || (Number(broadcast.timers) || 0) + (Number(broadcast.polls) || 0) + (Number(broadcast.giveaways) || 0)} LOCAL`);
  text(ui.multiDeckAgents, statsAgents.routes ? `${statsAgents.routes} ROUTES` : 'READY');
  text(ui.multiDeckNote, `Desktop ${statsDesktop.platform || desktop.platform || 'host'} // ${statsAutomation.timers ?? broadcast.timers ?? 0} timers // ${statsAutomation.pendingReadAloud ?? broadcast.pendingReadAloud ?? 0} voice cues // pipeline ${String(statsAgents.pipeline || agents.pipeline || 'READY').toUpperCase()}. Viewers/chat/bitrate show N/A until an approved connector supplies them.`);
}
async function refresh() {
  const [live, status, printer, events, capabilities, workspace, analytics, pipeline] = await Promise.allSettled([request('/api/agent/live'), request('/api/status'), request('/api/printer/status'), request('/api/events/history'), request('/api/capabilities'), request('/api/workspace/status'), request('/api/analytics'), request('/api/engineering/pipeline')]);
  if (live.status === 'fulfilled') renderLive(live.value);
  if (printer.status === 'fulfilled') renderPrinter(printer.value);
  if (status.status === 'fulfilled') {
    const workspaceValue = workspace.status === 'fulfilled' ? workspace.value : null;
    renderServices(status.value, workspaceValue, pipeline.status === 'fulfilled' ? pipeline.value : null);
    renderLiveDeck(status.value, workspaceValue);
  }
  if (events.status === 'fulfilled') renderEvents(events.value);
  if (capabilities.status === 'fulfilled') renderCapabilities(capabilities.value);
  if (analytics.status === 'fulfilled') renderAnalytics(analytics.value);
  if (workspace.status === 'fulfilled') { renderMediaDeck(workspace.value); renderMultiPurposeDeck(workspace.value, status.status === 'fulfilled' ? status.value : {}); renderPrinterCamera(workspace.value?.printerCamera); void discoverPrinterCamera(workspace.value?.printerCamera); }
  clock();
}
ui.frame.addEventListener('error', () => { ui.frame.hidden = true; ui.placeholder.hidden = false; text(ui.placeholderTitle, 'SCREEN FRAME UNAVAILABLE'); text(ui.placeholderCopy, 'The private browser is active, but its latest frame could not be loaded.'); text(ui.frameState, 'FRAME ERROR'); });
ui.frame.addEventListener('load', () => { if (!localScreenActive()) { if (ui.screenExplain) ui.screenExplain.disabled = false; } });
ui.screenShareToggle?.addEventListener('click', () => void toggleLocalScreenShare());
ui.screenExplain?.addEventListener('click', () => void explainVisibleScreen());
ui.screenCompact?.addEventListener('click', toggleCompactView);
ui.screenFocus?.addEventListener('click', toggleFocusView);
ui.screenFullscreen?.addEventListener('click', () => void toggleStageFullscreen());
ui.websiteForm?.addEventListener('submit', (event) => void openWorkspaceWebsite(event));
ui.websiteRefresh?.addEventListener('click', () => void refreshWorkspacePreview());
ui.directiveForm?.addEventListener('submit', (event) => void submitWorkspaceDirective(event));
ui.directivePlan?.addEventListener('click', () => void previewWorkspaceMission());
ui.directiveTalk?.addEventListener('click', () => void talkWorkspaceDirective());
document.querySelectorAll('[data-workspace-prompt]').forEach((button) => button.addEventListener('click', () => {
  if (!ui.directiveInput) return;
  ui.directiveInput.value = button.dataset.workspacePrompt || '';
  ui.directiveInput.focus();
}));
document.querySelectorAll('[data-website-alias]').forEach((button) => button.addEventListener('click', () => {
  if (!ui.websiteInput || !ui.websiteForm) return;
  ui.websiteInput.value = button.dataset.websiteAlias || '';
  ui.websiteForm.requestSubmit();
}));
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') handleScreenRelease(); });
document.addEventListener('fullscreenchange', syncStageFullscreenUi);
document.addEventListener('webkitfullscreenchange', syncStageFullscreenUi);
window.addEventListener('beforeunload', () => { clearPreviewRefreshTimer(); state.screenStream?.getTracks().forEach((track) => track.stop()); });
setLocalScreenUi(false);
clearScreenExplanation();
syncStageFullscreenUi();
setInterval(clock, 1000); setInterval(() => void refresh(), 2000); setInterval(() => void refreshPiCamera(), 4000); void refresh(); void refreshPiCamera();
