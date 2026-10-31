import {
  DEFAULT_VOICE_VOCABULARY, normalizeVocabulary, normalizeWakePhrases, recommendVoiceSettings, selectRecognitionAlternative
} from './voice-utils.js';
import { analyzeVoiceFrame, analyzeVoiceSpectrum, clearVoiceProfile, configureRecognitionCapabilities, isSpeechBandEligible, loadVoiceProfile, saveVoiceProfile, stabilizeNoiseFloor, startRecognitionWithTrack } from './voice-controller.js';
import { deviceIdConstraint, deviceSelectionAvailability, friendlyMediaError, getUserMediaWithFallback, normalizeDeviceId } from './media-utils.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const form = $('#settings-form');

const ui = {
  status: $('#settings-status'), message: $('#settings-message'), profile: $('#settings-profile'), version: $('#settings-version'), node: $('#settings-node'),
  source: $('#source'), sourceBrowser: $('#source-browser'), sourcePi: $('#source-pi'), browserCamera: $('#browser-camera'), browserMicrophone: $('#browser-microphone'), microphoneProfile: $('#microphone-profile'), resetMicrophoneProfile: $('#reset-microphone-profile'), piCamera: $('#pi-camera'), piMicrophone: $('#pi-microphone'), defaultCountry: $('#default-country'), defaultLocation: $('#default-location'),
  browserDeviceCount: $('#browser-device-count'), piDeviceCount: $('#pi-device-count'), refreshDevices: $('#refresh-devices'),
  personDetection: $('#person-detection'), voiceActivity: $('#voice-activity'), wakeWord: $('#wake-word'), doubleClap: $('#double-clap'), gestureControl: $('#gesture-control'), autoSpeak: $('#auto-speak'), autoRepair: $('#auto-repair'),
  personThreshold: $('#person-threshold'), micSensitivity: $('#mic-sensitivity'), wakeSensitivity: $('#wake-sensitivity'), clapSensitivity: $('#clap-sensitivity'), gestureSensitivity: $('#gesture-sensitivity'), doubleClapWindow: $('#double-clap-window'), scanInterval: $('#scan-interval'), accent: $('#accent'),
  voiceLanguage: $('#voice-language'), wakePhrases: $('#wake-phrases'), voiceVocabulary: $('#voice-vocabulary'), recognitionConfidence: $('#recognition-confidence'), commandSilence: $('#command-silence'),
  voiceAutoStart: $('#voice-auto-start'), preferLocalRecognition: $('#prefer-local-recognition'), echoCancellation: $('#echo-cancellation'), noiseSuppression: $('#noise-suppression'), autoGainControl: $('#auto-gain-control'), bargeIn: $('#barge-in'), conversationMode: $('#conversation-mode'),
  ttsVoice: $('#tts-voice'), ttsRate: $('#tts-rate'), ttsPitch: $('#tts-pitch'), ttsVolume: $('#tts-volume'), wakeResponse: $('#wake-response'), responseStyle: $('#response-style'), responseLength: $('#response-length'),
  ttsProviderNote: $('#tts-provider-note'),
  speechSupport: $('#speech-support'), voiceTranscript: $('#voice-transcript'), voiceConfidence: $('#voice-confidence'), voiceEvidence: $('#voice-evidence'), voiceEvidenceDetail: $('#voice-evidence-detail'), voiceSnr: $('#voice-snr'), voiceGate: $('#voice-gate'), voiceSpectrum: $('#voice-spectrum'), voiceSpectrumDetail: $('#voice-spectrum-detail'), voiceEpoch: $('#voice-epoch'), voiceDecision: $('#voice-decision'), voiceProvider: $('#voice-provider'), testRecognition: $('#test-recognition'), testTalkback: $('#test-talkback'), autoTuneVoice: $('#auto-tune-voice'), installLocalSpeech: $('#install-local-speech'),
  cameraPreview: $('#camera-preview'), video: $('#camera-video'), image: $('#pi-camera-image'), canvas: $('#sensor-canvas'), placeholder: $('#camera-placeholder'), cameraSource: $('#camera-source'),
  personReadout: $('#person-readout'), micReadout: $('#mic-readout'), micMeter: $('#mic-meter'), wakeReadout: $('#wake-readout'), sensorState: $('#sensor-state'), sensorGuidance: $('#sensor-guidance'),
  start: $('#start-sensors'), stop: $('#stop-sensors'), testWake: $('#test-wake'), googleGrid: $('#google-grid'), googleNote: $('#google-note'), googleState: $('#google-state'), stirlingGrid: $('#stirling-grid'), stirlingState: $('#stirling-state'), stirlingNote: $('#stirling-note'), testStirling: $('#test-stirling'), testStirlingProcessing: $('#test-stirling-processing'), workspaceGrid: $('#workspace-grid'), workspaceState: $('#workspace-state'), broadcastKitGrid: $('#broadcast-kit-grid'), broadcastKitState: $('#broadcast-kit-state'), broadcastActionStatus: $('#broadcast-action-status'), broadcastTimerName: $('#broadcast-timer-name'), broadcastTimerSeconds: $('#broadcast-timer-seconds'), broadcastStartTimer: $('#broadcast-start-timer'), broadcastPollQuestion: $('#broadcast-poll-question'), broadcastPollOptions: $('#broadcast-poll-options'), broadcastCreatePoll: $('#broadcast-create-poll'), broadcastReadAloud: $('#broadcast-read-aloud'), broadcastQueueReadAloud: $('#broadcast-queue-read-aloud'), mediaDeckGrid: $('#media-deck-grid'), mediaDeckState: $('#media-deck-state'), mediaActionStatus: $('#media-action-status'), mediaTitle: $('#media-title'), mediaArtist: $('#media-artist'), mediaDuration: $('#media-duration'), mediaQueue: $('#media-queue'), mediaPlay: $('#media-play'), mediaEnqueue: $('#media-enqueue'), mediaPause: $('#media-pause'), mediaNext: $('#media-next'), mediaStop: $('#media-stop'), desktopAppsGrid: $('#desktop-apps-grid'), desktopAppsState: $('#desktop-app-state'),
  testGoogle: $('#test-google'), reauthorizeGoogle: $('#reauthorize-google'), googleReauthNote: $('#google-reauth-note'), googleReauthLink: $('#google-reauth-link'), obsOverlayState: $('#obs-overlay-state'), obsOverlayUrl: $('#obs-overlay-url'), copyObsOverlayUrl: $('#copy-obs-overlay-url'), openObsOverlay: $('#open-obs-overlay'), routinesState: $('#routines-state'), routineList: $('#routine-list'), routineKind: $('#routine-kind'), routineName: $('#routine-name'), routineInterval: $('#routine-interval'), routineTopicWrap: $('#routine-topic-wrap'), routineTopic: $('#routine-topic'), routineLocationWrap: $('#routine-location-wrap'), routineLocation: $('#routine-location'), createRoutine: $('#create-routine'), memoryState: $('#memory-state'), memoryNoteTitle: $('#memory-note-title'), memoryNoteBody: $('#memory-note-body'), memoryNoteTags: $('#memory-note-tags'), saveMemoryNote: $('#save-memory-note'), memoryReminderTitle: $('#memory-reminder-title'), memoryReminderDue: $('#memory-reminder-due'), saveMemoryReminder: $('#save-memory-reminder'), memoryNoteCount: $('#memory-note-count'), memoryReminderCount: $('#memory-reminder-count'), memoryNoteList: $('#memory-note-list'), memoryReminderList: $('#memory-reminder-list'), screenState: $('#screen-state'), screenStage: $('#screen-share-stage'), screenVideo: $('#screen-share-video'), screenCanvas: $('#screen-share-canvas'), screenPlaceholder: $('#screen-share-placeholder'), screenSource: $('#screen-share-source'), screenQuestion: $('#screen-question'), screenAnswer: $('#screen-answer'), screenVisionNote: $('#screen-vision-note'), startScreen: $('#start-screen-share'), stopScreen: $('#stop-screen-share'), analyzeScreen: $('#analyze-screen'),
  preview: $('#live-preview'), previewViewport: $('#preview-viewport'), previewResolution: $('#preview-resolution'), reloadPreview: $('#reload-preview'), openPreview: $('#open-preview'),
  search: $('#settings-search'), workspace: $('#settings-workspace'), searchEmpty: $('#search-empty'), save: $('#save-settings'), revert: $('#revert-settings'), recommended: $('#recommended-settings'), dirtyDot: $('#dirty-dot'), saveStateTitle: $('#save-state-title')
};

const recommendedProfile = {
  defaultCountry: 'AE', defaultLocation: 'Dubai',
  personDetection: true, voiceActivity: true, wakeWord: true, doubleClap: true, gestureControl: true, autoSpeak: true,
  personThreshold: 0.55, micSensitivity: 0.28, wakeSensitivity: 0.72, clapSensitivity: 0.42,
  gestureSensitivity: 0.42, doubleClapWindow: 700, scanInterval: 900, accent: '#64e8ff',
  voiceLanguage: 'en-US', wakePhrases: ['hey jarvis', 'jarvis', 'جارفيس', 'يا جارفيس'], voiceVocabulary: DEFAULT_VOICE_VOCABULARY, recognitionConfidence: .55, commandSilenceMs: 700,
  voiceAutoStart: true, preferLocalRecognition: true, echoCancellation: true, noiseSuppression: true, autoGainControl: true, bargeIn: false, conversationMode: false,
  ttsVoice: '', ttsRate: 1.02, ttsPitch: .92, ttsVolume: 1, wakeResponse: 'Yes sir, how can I help you today?', responseStyle: 'jarvis', responseLength: 'normal'
};

const state = {
  savedSettings: {}, currentSection: 'devices', media: null, stream: null, audioContext: null, analyser: null, talkbackContext: null, talkbackSource: null,
  initialized: false, pendingVoiceAutoTune: false,
  animation: 0, detector: null, detectTimer: 0, piTimer: 0, lastClap: 0, clapAbove: false, sensorsActive: false, dirty: false, frequencySamples: null, profileDevice: '',
  testRecognition: null, testRecognitionStream: null, testRecognitionPending: false, testRecognitionTimer: 0, speechCheck: 0, noiseFloor: .008, noiseFloorBaseline: .008, lastNoiseFloor: .008, lastSignalToNoiseDb: 18, voiceDiagnosticsFresh: false, lastAudioLevel: 0,
  voiceEvidenceActive: false, voiceCandidateSince: 0, voiceQuietSince: 0, voiceEvidenceEpoch: 0,
  screenStream: null, screenRequest: 0, screenBusy: false, screenRetryTimer: 0, screenRetryCountdownTimer: 0, screenRetryDueAt: 0, screenRetryable: false, screenRetryRequested: false, screenRetryAttempts: 0, routines: [], notes: [], reminders: [],
  config: { ttsMode: 'local', fishVoiceId: '', fishConfigured: false, fishRetryPolicy: { maxAttempts: 2, retryableStatusCodes: [500, 502, 503, 504], backoffMs: 350 }, fishReplyTimeoutMs: 30_000, fishWakeTimeoutMs: 12_000, allowBrowserTtsFallback: false, visionModel: '', visionConfigured: false }
};
const SCREEN_RETRY_DELAY_MS = 20_000;

const valueBindings = [
  ['personThreshold', 'person-threshold-output', (value) => `${Math.round(value * 100)}%`],
  ['micSensitivity', 'mic-sensitivity-output', (value) => `${Math.round(value * 100)}%`],
  ['wakeSensitivity', 'wake-sensitivity-output', (value) => `${Math.round(value * 100)}%`],
  ['clapSensitivity', 'clap-sensitivity-output', (value) => `${Math.round(value * 100)}%`],
  ['gestureSensitivity', 'gesture-sensitivity-output', (value) => `${Math.round(value * 100)}%`],
  ['doubleClapWindow', 'double-clap-window-output', (value) => `${value} ms`],
  ['scanInterval', 'scan-interval-output', (value) => `${value} ms`],
  ['recognitionConfidence', 'recognition-confidence-output', (value) => `${Math.round(value * 100)}%`],
  ['commandSilence', 'command-silence-output', (value) => `${value} ms`],
  ['ttsRate', 'tts-rate-output', (value) => `${value.toFixed(2)}×`],
  ['ttsPitch', 'tts-pitch-output', (value) => `${value.toFixed(2)}`],
  ['ttsVolume', 'tts-volume-output', (value) => `${Math.round(value * 100)}%`]
];

async function json(url, options) {
  const response = await (window.jarvisFetch || fetch)(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function setStatus(label, mode = 'ready') {
  ui.status.textContent = label;
  ui.status.dataset.state = mode;
}

function setMessage(message) { ui.message.textContent = message; }
function option(value, label) { const item = document.createElement('option'); item.value = value; item.textContent = label; return item; }

function fillSelect(select, items, placeholder, selected) {
  selected = normalizeDeviceId(selected);
  select.replaceChildren(option('', placeholder));
  for (const item of items) select.append(option(item.id || item.deviceId, item.label || item.id || item.deviceId));
  if (selected && ![...select.options].some((item) => item.value === selected)) select.append(option(selected, `Saved device (currently unavailable): ${selected}`));
  select.value = selected || '';
}

function renderMicrophoneProfile(deviceId = ui.browserMicrophone?.value) {
  if (!ui.microphoneProfile) return;
  const selected = normalizeDeviceId(deviceId);
  const profile = selected ? loadVoiceProfile(selected) : null;
  if (!selected) {
    ui.microphoneProfile.textContent = 'DEFAULT MIC // CALIBRATE TO LEARN';
    ui.microphoneProfile.dataset.state = 'default';
    return;
  }
  if (!profile) {
    ui.microphoneProfile.textContent = 'NO LOCAL PROFILE // CALIBRATE THIS MIC';
    ui.microphoneProfile.dataset.state = 'empty';
    return;
  }
  ui.microphoneProfile.textContent = `LOCAL PROFILE // FLOOR ${(profile.noiseFloor * 100).toFixed(2)}% // SNR ${profile.signalToNoiseDb.toFixed(1)} dB`;
  ui.microphoneProfile.dataset.state = 'ready';
}

function currentSettings() {
  return {
    source: ui.source.value, browserCamera: normalizeDeviceId(ui.browserCamera.value), browserMicrophone: normalizeDeviceId(ui.browserMicrophone.value),
    defaultCountry: ui.defaultCountry.value, defaultLocation: ui.defaultLocation.value.trim(),
    piCamera: ui.piCamera.value, piMicrophone: ui.piMicrophone.value,
    personDetection: ui.personDetection.checked, voiceActivity: ui.voiceActivity.checked, wakeWord: ui.wakeWord.checked,
    doubleClap: ui.doubleClap.checked, gestureControl: ui.gestureControl.checked, autoSpeak: ui.autoSpeak.checked, autoRepair: ui.autoRepair.checked,
    personThreshold: Number(ui.personThreshold.value), micSensitivity: Number(ui.micSensitivity.value),
    wakeSensitivity: Number(ui.wakeSensitivity.value), clapSensitivity: Number(ui.clapSensitivity.value), gestureSensitivity: Number(ui.gestureSensitivity.value),
    doubleClapWindow: Number(ui.doubleClapWindow.value), scanInterval: Number(ui.scanInterval.value), accent: ui.accent.value,
    voiceLanguage: ui.voiceLanguage.value, wakePhrases: normalizeWakePhrases(ui.wakePhrases.value), voiceVocabulary: normalizeVocabulary(ui.voiceVocabulary.value), recognitionConfidence: Number(ui.recognitionConfidence.value),
    commandSilenceMs: Number(ui.commandSilence.value), voiceAutoStart: ui.voiceAutoStart.checked, preferLocalRecognition: ui.preferLocalRecognition.checked, echoCancellation: ui.echoCancellation.checked,
    noiseSuppression: ui.noiseSuppression.checked, autoGainControl: ui.autoGainControl.checked, bargeIn: ui.bargeIn.checked, conversationMode: ui.conversationMode.checked,
    ttsVoice: ui.ttsVoice.value, ttsRate: Number(ui.ttsRate.value), ttsPitch: Number(ui.ttsPitch.value), ttsVolume: Number(ui.ttsVolume.value), wakeResponse: ui.wakeResponse.value.trim(), responseStyle: ui.responseStyle.value, responseLength: ui.responseLength.value
  };
}

function comparable(settings) {
  const ordered = Object.keys(settings).sort().reduce((result, key) => { result[key] = settings[key]; return result; }, {});
  return JSON.stringify(ordered);
}

function syncSourceCards() {
  ui.sourceBrowser.checked = ui.source.value === 'browser';
  ui.sourcePi.checked = ui.source.value === 'pi';
  document.body.dataset.sensorHost = ui.source.value;
  ui.profile.textContent = ui.source.value === 'pi' ? 'PI NATIVE' : 'LAPTOP TEST';
}

function updateOutputs() {
  for (const [key, outputId, format] of valueBindings) $(`#${outputId}`).value = format(Number(ui[key].value));
  document.documentElement.style.setProperty('--accent', ui.accent.value);
  syncSourceCards();
}

function updateDirty() {
  state.dirty = comparable(currentSettings()) !== comparable(state.savedSettings);
  ui.save.disabled = !state.dirty;
  ui.revert.disabled = !state.dirty;
  ui.dirtyDot.classList.toggle('dirty', state.dirty);
  ui.saveStateTitle.textContent = state.dirty ? 'UNSAVED PROFILE CHANGES' : 'PROFILE SYNCHRONIZED';
  setStatus(state.dirty ? 'UNSAVED' : 'READY', state.dirty ? 'dirty' : 'ready');
}

function previewSettings() {
  ui.preview.contentWindow?.postMessage({ type: 'jarvis-settings-preview', settings: currentSettings() }, location.origin);
}

function applySettings(settings, { saved = false, message = '' } = {}) {
  settings = { ...settings, browserCamera: normalizeDeviceId(settings.browserCamera), browserMicrophone: normalizeDeviceId(settings.browserMicrophone) };
  ui.wakePhrases.value = normalizeWakePhrases(settings.wakePhrases).join(', ');
  ui.voiceVocabulary.value = normalizeVocabulary(settings.voiceVocabulary ?? DEFAULT_VOICE_VOCABULARY).join(', ');
  if (settings.ttsVoice && ![...ui.ttsVoice.options].some((item) => item.value === settings.ttsVoice)) ui.ttsVoice.append(option(settings.ttsVoice, `Saved voice (currently unavailable): ${settings.ttsVoice}`));
  for (const [key, element] of [
    ['source', ui.source], ['browserCamera', ui.browserCamera], ['browserMicrophone', ui.browserMicrophone], ['piCamera', ui.piCamera], ['piMicrophone', ui.piMicrophone], ['defaultCountry', ui.defaultCountry], ['defaultLocation', ui.defaultLocation],
    ['personThreshold', ui.personThreshold], ['micSensitivity', ui.micSensitivity], ['wakeSensitivity', ui.wakeSensitivity], ['clapSensitivity', ui.clapSensitivity],
    ['gestureSensitivity', ui.gestureSensitivity], ['doubleClapWindow', ui.doubleClapWindow], ['scanInterval', ui.scanInterval], ['accent', ui.accent],
    ['voiceLanguage', ui.voiceLanguage], ['recognitionConfidence', ui.recognitionConfidence], ['commandSilenceMs', ui.commandSilence],
    ['ttsVoice', ui.ttsVoice], ['ttsRate', ui.ttsRate], ['ttsPitch', ui.ttsPitch], ['ttsVolume', ui.ttsVolume], ['wakeResponse', ui.wakeResponse], ['responseStyle', ui.responseStyle], ['responseLength', ui.responseLength]
  ]) element.value = settings[key] ?? '';
  for (const [key, element] of [
    ['personDetection', ui.personDetection], ['voiceActivity', ui.voiceActivity], ['wakeWord', ui.wakeWord], ['doubleClap', ui.doubleClap],
    ['gestureControl', ui.gestureControl], ['autoSpeak', ui.autoSpeak], ['autoRepair', ui.autoRepair], ['voiceAutoStart', ui.voiceAutoStart], ['preferLocalRecognition', ui.preferLocalRecognition],
    ['echoCancellation', ui.echoCancellation], ['noiseSuppression', ui.noiseSuppression], ['autoGainControl', ui.autoGainControl], ['bargeIn', ui.bargeIn], ['conversationMode', ui.conversationMode]
  ]) element.checked = Boolean(settings[key]);
  if (saved) state.savedSettings = { ...settings };
  updateOutputs();
  updateDirty();
  previewSettings();
  if (message) setMessage(message);
}

function activateSection(name, { syncUrl = true } = {}) {
  const target = $(`.settings-section[data-section="${CSS.escape(String(name || ''))}"]`) ? String(name) : 'devices';
  state.currentSection = target;
  ui.search.value = '';
  ui.workspace.classList.remove('is-searching');
  for (const section of $$('.settings-section')) { section.hidden = false; section.classList.toggle('active', section.dataset.section === target); }
  for (const button of $$('.settings-nav-list button')) button.classList.toggle('active', button.dataset.target === target);
  ui.searchEmpty.hidden = true;
  if (syncUrl && location.hash !== `#${target}`) history.replaceState(null, '', `#${target}`);
}

function searchControls() {
  const term = ui.search.value.trim().toLowerCase();
  if (!term) { activateSection(state.currentSection); return; }
  ui.workspace.classList.add('is-searching');
  let matches = 0;
  for (const section of $$('.settings-section')) {
    const haystack = (section.dataset.search || '').toLowerCase();
    const match = haystack.includes(term);
    section.hidden = !match;
    section.classList.toggle('active', match);
    if (match) matches += 1;
  }
  ui.searchEmpty.hidden = matches > 0;
}

async function enumerateBrowserDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    ui.browserDeviceCount.textContent = 'UNAVAILABLE';
    return { cameraAvailable: false, microphoneAvailable: false, cameraCount: 0, microphoneCount: 0 };
  }
  let devices = await navigator.mediaDevices.enumerateDevices();
  let cameras = devices.filter((item) => item.kind === 'videoinput');
  let microphones = devices.filter((item) => item.kind === 'audioinput');
  // Device labels and even the fake-browser device list can briefly disappear
  // after another dashboard view releases a track. A user-initiated rescan may
  // open each missing kind once to refresh permission state, then enumerate
  // again. Tracks are always stopped before returning to the settings UI.
  for (const constraints of [
    cameras.length ? null : { video: true, audio: false },
    microphones.length ? null : { video: false, audio: true }
  ].filter(Boolean)) {
    let stream;
    try { stream = await getUserMediaWithFallback(navigator.mediaDevices, constraints); }
    catch {}
    finally { stream?.stream?.getTracks?.().forEach((track) => track.stop()); }
  }
  if (!cameras.length || !microphones.length) {
    devices = await navigator.mediaDevices.enumerateDevices();
    cameras = devices.filter((item) => item.kind === 'videoinput');
    microphones = devices.filter((item) => item.kind === 'audioinput');
  }
  const draft = currentSettings();
  fillSelect(ui.browserCamera, cameras.map((item, index) => ({ id: item.deviceId, label: item.label || `Browser camera ${index + 1}` })), 'Default browser camera', draft.browserCamera);
  fillSelect(ui.browserMicrophone, microphones.map((item, index) => ({ id: item.deviceId, label: item.label || `Browser microphone ${index + 1}` })), 'Default browser microphone', draft.browserMicrophone);
  renderMicrophoneProfile(draft.browserMicrophone);
  ui.browserDeviceCount.textContent = `${cameras.length} CAM / ${microphones.length} MIC`;
  return deviceSelectionAvailability({ selectedCamera: draft.browserCamera, selectedMicrophone: draft.browserMicrophone, cameras, microphones });
}

let browserDeviceChangeTimer = 0;
async function refreshBrowserDevicesAfterChange() {
  const settings = currentSettings();
  try {
    const availability = await enumerateBrowserDevices();
    const cameraNeeded = settings.personDetection || settings.gestureControl;
    const microphoneNeeded = settings.voiceActivity || settings.wakeWord || settings.doubleClap;
    const missingRequired = state.sensorsActive && ((cameraNeeded && !availability.cameraAvailable) || (microphoneNeeded && !availability.microphoneAvailable));
    if (missingRequired) {
      stopSensors({ quiet: true });
      setMessage('A selected camera or microphone was disconnected. Sensors stopped safely; choose a new device and restart calibration.');
    } else if (state.sensorsActive) {
      setMessage('Browser device list updated. Active tracks remain unchanged until you restart calibration.');
    } else {
      setMessage('Browser camera and microphone list updated automatically.');
    }
  } catch (error) {
    setMessage(`Browser device update failed: ${error.message}`);
  }
}
function queueBrowserDeviceRefresh() {
  clearTimeout(browserDeviceChangeTimer);
  browserDeviceChangeTimer = window.setTimeout(() => {
    browserDeviceChangeTimer = 0;
    void refreshBrowserDevicesAfterChange();
  }, 250);
}

function loadSpeechVoices(selected = ui.ttsVoice.value) {
  if (!('speechSynthesis' in window)) { ui.ttsVoice.disabled = true; ui.testTalkback.disabled = true; return; }
  const voices = speechSynthesis.getVoices(); const items = voices.map((voice) => ({ id: voice.voiceURI, label: `${voice.name} // ${voice.lang}${voice.localService ? ' // LOCAL' : ''}` }));
  fillSelect(ui.ttsVoice, items, 'System default voice', selected);
}

function resetVoiceDiagnostics(detail = 'Start calibration to watch the physical gate.') {
  state.voiceEvidenceActive = false; state.voiceCandidateSince = 0; state.voiceQuietSince = 0; state.voiceEvidenceEpoch = 0;
  ui.voiceEvidence.textContent = 'STANDBY';
  ui.voiceEvidenceDetail.textContent = detail;
  ui.voiceSnr.textContent = '-- dB';
  ui.voiceGate.textContent = 'GATE -- // CREST --';
  ui.voiceSpectrum.textContent = '--';
  ui.voiceSpectrumDetail.textContent = 'Waiting for a calibrated microphone sample.';
  ui.voiceEpoch.textContent = '0';
  ui.voiceDecision.textContent = 'NO DECISION';
}

function updateVoiceDiagnostics(analysis, { source = 'BROWSER MIC', now = performance.now() } = {}) {
  const signalToNoiseDb = Number(analysis?.signalToNoiseDb);
  if (Number.isFinite(signalToNoiseDb)) {
    // Preserve the last real sample across stop/reset so AUTO-TUNE can still
    // use the calibration that the operator just measured.
    state.lastNoiseFloor = state.noiseFloor;
    state.lastSignalToNoiseDb = signalToNoiseDb;
    state.voiceDiagnosticsFresh = true;
  }
  const speechCandidate = Boolean(analysis?.speechCandidate) && analysis?.speechBandEligible !== false;
  if (speechCandidate) {
    state.voiceQuietSince = 0;
    if (!state.voiceEvidenceActive) {
      if (!state.voiceCandidateSince) state.voiceCandidateSince = now;
      // Hold the speech-shaped gate briefly so one click/pop cannot become a
      // physical voice epoch in the settings evidence panel.
      if (now - state.voiceCandidateSince >= 120) {
        state.voiceEvidenceActive = true;
        state.voiceEvidenceEpoch += 1;
        ui.voiceDecision.textContent = 'FRESH MIC ONSET';
      }
    }
  } else {
    state.voiceCandidateSince = 0;
    if (state.voiceEvidenceActive) {
      if (!state.voiceQuietSince) state.voiceQuietSince = now;
      if (now - state.voiceQuietSince >= 260) { state.voiceEvidenceActive = false; state.voiceQuietSince = 0; }
    }
  }
  const evidence = state.voiceEvidenceActive ? 'PHYSICAL VOICE' : speechCandidate ? 'CANDIDATE' : 'QUIET / GATED';
  ui.voiceEvidence.textContent = evidence;
  ui.voiceEvidenceDetail.textContent = state.voiceEvidenceActive
    ? `${source} // fresh epoch ready for command capture`
    : `${source} // provider text is ignored without a fresh onset`;
  ui.voiceSnr.textContent = Number.isFinite(signalToNoiseDb) ? `${signalToNoiseDb} dB` : '-- dB';
  ui.voiceGate.textContent = `GATE ${Math.round((Number(analysis?.speechScore) || 0) * 100)}% // CREST ${Number.isFinite(analysis?.crestFactor) ? analysis.crestFactor.toFixed(2) : '--'}`;
  const lowHum = Boolean(analysis?.lowHum);
  const speechBandRejected = analysis?.spectrumAvailable && analysis?.speechBandEligible === false && !lowHum;
  ui.voiceSpectrum.textContent = lowHum ? 'HUM GATED' : speechBandRejected ? 'HIGH BAND GATED' : analysis?.spectrumAvailable ? 'SPEECH BAND' : 'TIME DOMAIN';
  ui.voiceSpectrumDetail.textContent = analysis?.spectrumAvailable
    ? `LOW ${Math.round((Number(analysis.lowBandRatio) || 0) * 100)}% // SPEECH ${Math.round((Number(analysis.speechBandRatio) || 0) * 100)}% // HIGH ${Math.round((Number(analysis.highBandRatio) || 0) * 100)}%`
    : 'Frequency sample unavailable; time-domain gate active.';
  ui.voiceEpoch.textContent = String(state.voiceEvidenceEpoch);
}

function autoTuneVoiceGate() {
  // Controls render before the protected settings profile finishes loading.
  // Queue an early click so init() cannot overwrite the user's staged tune
  // when its final applySettings() completes.
  if (!state.initialized) {
    state.pendingVoiceAutoTune = true;
    setMessage('Voice gate tune queued until the local profile finishes loading…');
    return;
  }
  const displayedSignalToNoiseDb = Number(ui.voiceSnr.textContent.replace(/[^0-9.-]/g, ''));
  const hasDisplayedSample = Number.isFinite(displayedSignalToNoiseDb);
  const hasCalibrationSample = Boolean(state.voiceDiagnosticsFresh);
  const recommendation = recommendVoiceSettings({
    noiseFloor: hasCalibrationSample ? state.lastNoiseFloor : state.noiseFloor,
    signalToNoiseDb: hasDisplayedSample ? displayedSignalToNoiseDb : state.lastSignalToNoiseDb
  });
  ui.micSensitivity.value = String(recommendation.micSensitivity);
  ui.wakeSensitivity.value = String(recommendation.wakeSensitivity);
  ui.clapSensitivity.value = String(recommendation.clapSensitivity);
  ui.recognitionConfidence.value = String(recommendation.recognitionConfidence);
  ui.commandSilence.value = String(recommendation.commandSilenceMs);
  updateOutputs();
  updateDirty();
  previewSettings();
  const sampleLabel = hasCalibrationSample ? 'last calibration sample' : hasDisplayedSample ? 'current mic sample' : 'safe defaults';
  setMessage(`Voice gate staged from ${sampleLabel} // ${recommendation.noiseFloor} noise floor // ${recommendation.signalToNoiseDb} dB SNR. Review and save the profile.`);
}

async function refreshSpeechSupport() {
  const check = ++state.speechCheck;
  const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!RecognitionClass) {
    ui.speechSupport.textContent = 'AUDIO ONLY'; ui.speechSupport.classList.remove('active');
    ui.speechSupport.title = 'Speech recognition is unavailable in this browser.'; ui.installLocalSpeech.hidden = true; ui.voiceProvider.textContent = 'AUDIO ONLY'; return;
  }
  let label = 'BROWSER READY'; let detail = 'Browser speech provider available.';
  let installVisible = false; let installDisabled = false; let installLabel = 'INSTALL LOCAL SPEECH PACK';
  if (ui.preferLocalRecognition.checked && typeof RecognitionClass.available === 'function') {
    try {
      const availability = await Promise.race([
        RecognitionClass.available({ langs: [ui.voiceLanguage.value || 'en-US'], processLocally: true }),
        new Promise((resolve) => setTimeout(() => resolve('unknown'), 900))
      ]);
      if (availability === 'available') { label = 'LOCAL READY'; detail = 'Installed on-device language pack is ready.'; }
      else if (availability === 'downloadable') {
        label = 'PACK NEEDED'; detail = 'An on-device language pack is available but not installed.';
        installVisible = typeof RecognitionClass.install === 'function';
      }
      else if (availability === 'downloading') {
        label = 'PACK LOADING'; detail = 'The browser is preparing its on-device language pack.';
        installVisible = true; installDisabled = true; installLabel = 'LOCAL PACK DOWNLOADING…';
      }
      else detail = 'On-device recognition is unavailable for this language; safe browser fallback remains enabled.';
    } catch { detail = 'Local capability check failed; safe browser fallback remains enabled.'; }
  }
  if (check !== state.speechCheck) return;
  ui.installLocalSpeech.hidden = !installVisible; ui.installLocalSpeech.disabled = installDisabled; ui.installLocalSpeech.textContent = installLabel;
  ui.speechSupport.textContent = label; ui.speechSupport.classList.add('active'); ui.speechSupport.title = detail;
  ui.voiceProvider.textContent = label === 'LOCAL READY' ? 'ON-DEVICE' : label === 'PACK NEEDED' || label === 'PACK LOADING' ? 'LOCAL PACK' : 'BROWSER PROVIDER';
}

async function installLocalSpeechPack() {
  const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof RecognitionClass?.install !== 'function') { setMessage('This browser cannot install local speech packs. Browser-provider fallback remains available.'); return; }
  const language = ui.voiceLanguage.value || 'en-US';
  ui.installLocalSpeech.hidden = false; ui.installLocalSpeech.disabled = true; ui.installLocalSpeech.textContent = `INSTALLING ${language}…`;
  setStatus('INSTALLING', 'loading'); setMessage(`Downloading the ${language} on-device speech pack. Keep this settings tab open.`);
  try {
    const installed = await RecognitionClass.install({ langs: [language], processLocally: true });
    if (!installed) throw new Error(`The ${language} pack is unsupported or its download failed.`);
    setMessage(`${language} is installed. JARVIS will prefer private on-device recognition for this language.`); setStatus('LOCAL READY', 'ready');
  } catch (error) {
    setMessage(`Local speech pack was not installed: ${error.message}`); setStatus('PACK ERROR', 'error');
  } finally { await refreshSpeechSupport(); }
}

function stopRecognitionTest(message = '') {
  clearTimeout(state.testRecognitionTimer);
  const recognition = state.testRecognition; state.testRecognition = null;
  if (recognition) { recognition.onend = null; try { recognition.abort(); } catch {} }
  state.testRecognitionStream?.getTracks().forEach((track) => track.stop()); state.testRecognitionStream = null; state.testRecognitionPending = false;
  ui.testRecognition.textContent = 'TEST RECOGNITION'; ui.testRecognition.classList.remove('active');
  if (message) ui.voiceConfidence.textContent = message;
}

async function testRecognition() {
  if (state.testRecognition) { stopRecognitionTest('Recognition test stopped.'); return; }
  if (state.testRecognitionPending) return;
  const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!RecognitionClass) { ui.voiceTranscript.textContent = 'NOT SUPPORTED'; ui.voiceConfidence.textContent = 'Use a supported browser on the laptop or Pi.'; return; }
  state.testRecognitionPending = true; ui.testRecognition.disabled = true; ui.voiceTranscript.textContent = 'OPENING MICROPHONE…';
  try {
    const settings = currentSettings();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this browser.');
    const opened = await getUserMediaWithFallback(navigator.mediaDevices, {
      audio: {
        deviceId: deviceIdConstraint(settings.browserMicrophone),
        channelCount: { ideal: 1 }, sampleRate: { ideal: 16000 },
        echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl
      },
      video: false
    });
    state.testRecognitionStream = opened.stream;
    if (opened.fallbackUsed) {
      ui.browserMicrophone.value = '';
      updateDirty();
      setMessage('The saved microphone was unavailable, so JARVIS switched to the browser default. Save to keep this repair.');
    }
    const recognition = new RecognitionClass(); state.testRecognition = recognition;
    recognition.continuous = false; recognition.interimResults = true; recognition.maxAlternatives = 5; recognition.lang = settings.voiceLanguage || 'en-US';
    const mode = await configureRecognitionCapabilities(recognition, RecognitionClass, {
      language: recognition.lang, preferLocalRecognition: settings.preferLocalRecognition,
      wakePhrases: settings.wakePhrases, voiceVocabulary: settings.voiceVocabulary, enablePhrases: false
    });
    ui.voiceTranscript.textContent = 'LISTENING…'; ui.voiceConfidence.textContent = `${mode === 'local' ? 'ON-DEVICE' : 'BROWSER PROVIDER'} // Say “Hey Jarvis, show system status”.`; ui.voiceProvider.textContent = mode === 'local' ? 'ON-DEVICE' : 'BROWSER PROVIDER'; ui.voiceDecision.textContent = 'WAITING FOR TEST'; ui.testRecognition.textContent = 'STOP TEST'; ui.testRecognition.classList.add('active');
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1]; const alternatives = Array.from({ length: result.length }, (_, index) => result[index]);
      const selected = selectRecognitionAlternative(alternatives, { wakePhrases: settings.wakePhrases, wakeSensitivity: settings.wakeSensitivity, recognitionConfidence: settings.recognitionConfidence, preferWake: settings.wakeWord });
      ui.voiceTranscript.textContent = selected.transcript || 'NO TRANSCRIPT';
      ui.voiceDecision.textContent = selected.wake.detected ? 'TEST WAKE MATCH' : result.isFinal ? 'TEST TRANSCRIPT READY' : 'TEST INTERIM';
      ui.voiceConfidence.textContent = `${mode === 'local' ? 'ON-DEVICE' : 'BROWSER'} // ${result.isFinal ? 'FINAL' : 'INTERIM'} // ${selected.confidenceKnown ? `${Math.round(selected.confidence * 100)}% CONFIDENCE` : 'CONFIDENCE UNAVAILABLE'} // ${selected.wake.detected ? 'WAKE MATCH' : 'NO WAKE MATCH'}`;
    };
    recognition.onerror = (event) => {
      ui.voiceTranscript.textContent = 'RECOGNITION ERROR';
      ui.voiceDecision.textContent = 'TEST ERROR';
      const message = event.error === 'network'
        ? 'Speech provider is offline. Install the on-device language pack below, then retry.'
        : event.error.replaceAll('-', ' ').toUpperCase();
      stopRecognitionTest(message);
    };
    recognition.onend = () => { if (state.testRecognition === recognition) stopRecognitionTest('Recognition test complete.'); };
    startRecognitionWithTrack(recognition, state.testRecognitionStream.getAudioTracks()[0]);
    state.testRecognitionTimer = setTimeout(() => stopRecognitionTest('Timed out after 12 seconds.'), 12_000);
  } catch (error) {
    ui.voiceTranscript.textContent = 'START FAILED'; ui.voiceDecision.textContent = 'TEST ERROR'; stopRecognitionTest(friendlyMediaError(error));
  } finally { state.testRecognitionPending = false; ui.testRecognition.disabled = false; }
}

async function testTalkback() {
  const text = 'Voice core calibrated. I am ready.';
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    try {
      if (!state.talkbackContext || state.talkbackContext.state === 'closed') state.talkbackContext = new AudioContextClass({ latencyHint: 'interactive' });
      if (state.talkbackContext.state !== 'running') await state.talkbackContext.resume();
    } catch {}
  }
  if (state.config.ttsMode === 'fish') {
    ui.voiceTranscript.textContent = 'FISH VOICE REQUEST';
    ui.voiceConfidence.textContent = state.config.fishConfigured ? 'JARVIS MAIN VOICE // CONNECTING' : 'JARVIS MAIN VOICE // API KEY NEEDED';
    try {
      const response = await (window.jarvisFetch || fetch)('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, mode: 'fish' }) });
      if (response.ok) {
        const bytes = await response.arrayBuffer();
        if (state.talkbackContext?.state === 'running') {
          const decoded = await state.talkbackContext.decodeAudioData(bytes.slice(0));
          try { state.talkbackSource?.stop(); } catch {}
          const source = state.talkbackContext.createBufferSource(); const gain = state.talkbackContext.createGain();
          source.buffer = decoded; gain.gain.value = Number(ui.ttsVolume.value); source.connect(gain).connect(state.talkbackContext.destination); state.talkbackSource = source;
          await new Promise((resolve, reject) => { source.onended = resolve; try { source.start(0); } catch (error) { reject(error); } });
          if (state.talkbackSource === source) state.talkbackSource = null;
        } else {
          const url = URL.createObjectURL(new Blob([bytes], { type: response.headers.get('content-type') || 'audio/mpeg' })); const audio = new Audio(url); audio.volume = Number(ui.ttsVolume.value);
          try { await new Promise((resolve, reject) => { audio.onended = resolve; audio.onerror = reject; audio.play().catch(reject); }); }
          finally { URL.revokeObjectURL(url); }
        }
        ui.voiceTranscript.textContent = 'FISH TALKBACK COMPLETE'; ui.voiceConfidence.textContent = `MAIN VOICE // ${state.config.fishVoiceId}`; return;
      }
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || `Fish Audio returned HTTP ${response.status}.`);
    } catch (error) {
      ui.voiceTranscript.textContent = 'FISH TALKBACK FAILED';
      ui.voiceConfidence.textContent = `${error?.message || 'Voice request failed.'} // VOICE NOT SUBSTITUTED`;
      if (!state.config.allowBrowserTtsFallback) return;
    }
  }
  if (!('speechSynthesis' in window)) { ui.voiceConfidence.textContent = 'Speech synthesis is unavailable in this browser.'; return; }
  speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance('Voice core calibrated. I am ready.');
  utterance.rate = Number(ui.ttsRate.value); utterance.pitch = Number(ui.ttsPitch.value); utterance.volume = Number(ui.ttsVolume.value); utterance.lang = ui.voiceLanguage.value;
  const voice = speechSynthesis.getVoices().find((item) => item.voiceURI === ui.ttsVoice.value || item.name === ui.ttsVoice.value); if (voice) utterance.voice = voice;
  utterance.onstart = () => { ui.voiceTranscript.textContent = 'LOCAL FALLBACK ACTIVE'; ui.voiceConfidence.textContent = voice ? `${voice.name} // ${voice.lang}` : 'System default voice'; };
  utterance.onend = () => { ui.voiceTranscript.textContent = 'TALKBACK COMPLETE'; };
  speechSynthesis.speak(utterance);
}

async function loadDeviceLists(selections = currentSettings()) {
  ui.refreshDevices.disabled = true;
  ui.refreshDevices.textContent = 'SCANNING…';
  try {
    const draft = selections;
    state.media = await json('/api/media/devices');
    const cameras = state.media.cameras || [];
    const microphones = state.media.microphones || [];
    fillSelect(ui.piCamera, cameras, 'Select /dev/video*', draft.piCamera);
    fillSelect(ui.piMicrophone, microphones, 'Select plughw device', draft.piMicrophone);
    ui.piDeviceCount.textContent = `${cameras.length} CAM / ${microphones.length} MIC`;
    await enumerateBrowserDevices();
    setMessage('Device buses rescanned. Selections were preserved where available.');
  } catch (error) {
    ui.piDeviceCount.textContent = 'SCAN ERROR';
    setMessage(`Device scan failed: ${error.message}`);
  } finally {
    ui.refreshDevices.disabled = false;
    ui.refreshDevices.textContent = '↻ RESCAN';
  }
}

function renderGoogle(status) {
  const names = { gdrive: ['DRIVE', 'FILES'], gmail: ['GMAIL', 'MAIL'], gmail_imap: ['GMAIL IMAP', 'INBOX'], gcalendar: ['CALENDAR', 'EVENTS'], gtasks: ['TASKS', 'ACTIONS'], gcontacts: ['CONTACTS', 'PEOPLE'] };
  const errors = Object.values(status.errors || {}).map((value) => String(value || '').trim()).filter(Boolean);
  const reauthorizationNeeded = !status.liveVerified && errors.length > 0;
  let connected = 0;
  ui.googleGrid.replaceChildren(...Object.entries(names).map(([key, [name, detail]]) => {
    const active = Boolean(status.connectors?.[key]);
    if (active) connected += 1;
    const item = document.createElement('div');
    item.className = `google-item ${active ? 'connected' : ''}`;
    item.innerHTML = `<i></i><span><b>${name}</b><small>${detail}</small></span><strong>${active ? 'LINKED' : reauthorizationNeeded ? 'REAUTH' : 'OFFLINE'}</strong>`;
    return item;
  }));
  const sendState = status.emailSendEnabled ? ' // SEND APPROVAL ARMED' : ' // SEND OFF';
  const stateLabel = status.liveVerified ? `${connected}/6 VERIFIED` : reauthorizationNeeded ? 'REAUTH REQUIRED' : `${connected}/6 LINKED`;
  ui.googleState.textContent = `${stateLabel}${sendState}`;
  ui.googleState.classList.toggle('active', status.liveVerified === true || connected > 0);
  ui.googleState.classList.toggle('warning', reauthorizationNeeded);
  const note = errors[0] || status.scopesNote || ui.googleNote.textContent;
  ui.googleNote.textContent = /oauth/i.test(note) ? note : `Google OAuth probe: ${note}`;
}

function renderStirling(status = {}) {
  const operations = Array.isArray(status.operations) ? status.operations : [];
  const configured = Boolean(status.configured);
  const online = Boolean(status.online);
  const warning = configured && !online && Boolean(status.error);
  const processingState = String(status.processing?.state || 'unverified');
  const processingError = String(status.processing?.error || '');
  const providerValue = status.processing?.providerStatus ?? status.providerStatus;
  const providerNumber = Number(providerValue);
  const providerStatus = Number.isInteger(providerNumber) && providerNumber >= 100 && providerNumber <= 599 ? providerNumber : null;
  const processingRejected = processingState === 'rejected';
  if (ui.stirlingGrid) {
    const items = operations.length ? operations : [
      { label: 'COMPRESS PDF', output: 'pdf' }, { label: 'OCR PDF', output: 'pdf' }, { label: 'REPAIR PDF', output: 'pdf' }, { label: 'PDF TO WORD', output: 'docx' }
    ];
    ui.stirlingGrid.replaceChildren(...items.map((item) => {
      const row = document.createElement('div'); row.className = `google-item ${configured ? 'connected' : ''}`;
      row.innerHTML = `<i></i><span><b>${String(item.label || item.operation || 'PDF TOOL').toUpperCase()}</b><small>${String(item.output || 'server-side').toUpperCase()} OUTPUT</small></span><strong>${processingRejected ? 'AUTH ERROR' : processingState === 'verified' ? 'VERIFIED' : configured ? 'READY' : 'SET KEY'}</strong>`;
      return row;
    }));
  }
  if (ui.stirlingState) {
    ui.stirlingState.textContent = processingRejected ? `PROCESSING KEY REJECTED${providerStatus ? ` // HTTP ${providerStatus}` : ''}` : processingState === 'verified' && online && configured ? 'ONLINE // PROCESSING VERIFIED' : online && configured ? 'ONLINE // KEY HIDDEN' : online ? 'ONLINE // KEY REQUIRED' : warning ? 'CHECK FAILED' : configured ? 'CONFIGURED' : 'NOT CONFIGURED';
    ui.stirlingState.classList.toggle('active', configured && online && !processingRejected);
    ui.stirlingState.classList.toggle('warning', warning || processingRejected);
  }
  if (ui.stirlingNote) ui.stirlingNote.textContent = processingError ? `${processingError}${providerStatus ? ` // PROVIDER HTTP ${providerStatus}` : ''}` : status.error || 'PDFs are accepted only from configured private input roots. The Stirling API key stays in the JARVIS host environment and is never returned to this screen.';
}

async function verifyStirling() {
  if (!ui.testStirling) return;
  ui.testStirling.disabled = true; ui.testStirling.textContent = 'CHECKING…';
  try {
    const status = await json('/api/stirling/status'); renderStirling(status);
    setMessage(status.online ? 'Stirling PDF API is reachable. The API key remains server-side.' : `Stirling PDF health check: ${status.error || 'not configured'}`);
  } catch (error) { if (ui.stirlingState) ui.stirlingState.textContent = 'ERROR'; setMessage(`Stirling check failed: ${error.message}`); }
  finally { ui.testStirling.disabled = false; ui.testStirling.textContent = 'CHECK API'; }
}

async function verifyStirlingProcessing() {
  if (!ui.testStirlingProcessing) return;
  ui.testStirlingProcessing.disabled = true; ui.testStirlingProcessing.textContent = 'PROCESSING…';
  try {
    const response = await json('/api/stirling/smoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'compress' }) });
    renderStirling(response.status || {});
    setMessage('Stirling synthetic processing verified. No user document was uploaded.');
  } catch (error) {
    try { renderStirling(await json('/api/stirling/status')); } catch {}
    setMessage(`Stirling synthetic processing failed: ${error.message}`);
  } finally { ui.testStirlingProcessing.disabled = false; ui.testStirlingProcessing.textContent = 'TEST SYNTHETIC PROCESS'; }
}

function renderWorkspace(status) {
  const stirling = status.stirlingPdf || {};
  const stirlingProcessing = String(stirling.processing?.state || 'unverified');
  const stirlingRejected = stirlingProcessing === 'rejected';
  const stirlingProviderNumber = Number(stirling.processing?.providerStatus);
  const stirlingProviderStatus = Number.isInteger(stirlingProviderNumber) && stirlingProviderNumber >= 100 && stirlingProviderNumber <= 599 ? stirlingProviderNumber : null;
  const stirlingAvailable = Boolean(stirling.configured && !stirlingRejected);
  const stirlingDetail = stirlingRejected
    ? `PROCESSING KEY REJECTED${stirlingProviderStatus ? ` // HTTP ${stirlingProviderStatus}` : ''}`
    : stirlingProcessing === 'verified'
      ? 'PROCESSING VERIFIED'
      : stirling.configured
        ? 'SERVER-SIDE // VERIFY'
        : 'PRIVATE KEY REQUIRED';
  const items = [
    ['PRIVATE BROWSER', status.browser?.dedicatedProfile, status.browser?.interactiveEnabled ? 'PIN APPROVAL' : 'READ ONLY'],
    ['OFFICE STUDIO', status.office?.local, (status.office?.formats || []).join(' / ').toUpperCase()],
    ['GOOGLE NEWS', status.news?.googleRss, status.news?.apiKeyRequired ? 'KEY REQUIRED' : 'KEYLESS RSS'],
    ['STIRLING PDF', stirlingAvailable, stirlingDetail],
    ['PRINTER CAMERA', status.printerCamera?.configured || (status.printerCamera?.autoDiscovery && status.printerCamera?.discovery !== 'not-found'), status.printerCamera?.configured ? `SNAPSHOT // ${status.printerCamera.host || 'SAME HOST'}` : status.printerCamera?.discovery === 'pending' ? 'AUTO-DISCOVERY // SAME HOST' : status.printerCamera?.discovery === 'not-found' ? 'NO SNAPSHOT ENDPOINT' : 'SET PRINTER_CAMERA_URL'],
    ['APP LENS', status.screenBorrow?.available, status.screenBorrow?.control ? 'CONTROL' : 'VIEW + ANALYZE'],
    ['SCREEN EXPLAINER', status.screenExplain?.available && Boolean(status.vision?.ready), status.vision?.ready ? 'ONE APPROVED SNAPSHOT' : 'LOCAL VISION MODEL REQUIRED'],
    ['LIVE WEBSITES', status.websites?.liveView, status.websites?.liveViewSource || 'USER-SELECTED VIEW'],
    ['PI CAMERA VIEW', status.camera?.available, status.camera?.selected ? status.camera.selected : 'SELECT A PI CAMERA'],
    ['OBS OVERLAY', status.obsOverlay?.available, 'READ ONLY'],
    ['BROADCAST KIT', status.broadcastKit?.available, status.broadcastKit?.mode === 'local-stage' ? 'LOCAL STAGE' : 'READY']
  ];
  const active = items.filter(([, value]) => value).length;
  ui.workspaceGrid.replaceChildren(...items.map(([name, available, detail]) => {
    const item = document.createElement('div'); item.className = `google-item ${available ? 'connected' : ''}`;
    item.innerHTML = `<i></i><span><b>${name}</b><small>${detail}</small></span><strong>${available ? 'READY' : 'OFFLINE'}</strong>`; return item;
  }));
  ui.workspaceState.textContent = `${active}/${items.length} READY // ${(status.platform || 'HOST').toUpperCase()}`;
  ui.workspaceState.classList.toggle('active', active === items.length);
}

function renderBroadcastKit(payload = {}) {
  const chat = payload.chat || {}; const activities = payload.activities || {};
  const items = [
    ['TIMERS', activities.timers?.length || 0, 'local countdowns'],
    ['POLLS', activities.polls?.length || 0, 'local vote boards'],
    ['GIVEAWAYS', activities.giveaways?.length || 0, 'local entry draws'],
    ['COMMANDS', chat.commands?.length || 0, 'voice/chat triggers'],
    ['SAVED REPLIES', chat.savedMessages?.length || 0, 'reply library'],
    ['READ ALOUD', chat.readAloud?.filter((item) => item.status === 'pending').length || 0, 'pending queue']
  ];
  const available = payload.mode === 'local-stage';
  if (ui.broadcastKitGrid) ui.broadcastKitGrid.replaceChildren(...items.map(([name, count, detail]) => {
    const item = document.createElement('div'); item.className = `google-item ${available ? 'connected' : ''}`;
    item.innerHTML = `<i></i><span><b>${name}</b><small>${detail}</small></span><strong>${available ? count : 'OFFLINE'}</strong>`; return item;
  }));
  if (ui.broadcastKitState) { ui.broadcastKitState.textContent = available ? 'READY // LOCAL STAGE' : 'OFFLINE'; ui.broadcastKitState.classList.toggle('active', available); }
}

async function loadBroadcastKit() {
  try { renderBroadcastKit(await json('/api/broadcast/state')); }
  catch { renderBroadcastKit({}); }
}

async function runBroadcastAction(action, successMessage) {
  const buttons = [ui.broadcastStartTimer, ui.broadcastCreatePoll, ui.broadcastQueueReadAloud].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });
  if (ui.broadcastActionStatus) ui.broadcastActionStatus.textContent = 'LOCAL ACTION IN PROGRESS…';
  try {
    await json('/api/broadcast/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
    if (ui.broadcastActionStatus) ui.broadcastActionStatus.textContent = successMessage;
    await loadBroadcastKit();
  } catch (error) {
    if (ui.broadcastActionStatus) ui.broadcastActionStatus.textContent = `LOCAL ACTION FAILED // ${error.message}`;
  } finally { buttons.forEach((button) => { button.disabled = false; }); }
}

function startLocalBroadcastTimer() {
  const name = ui.broadcastTimerName?.value.trim() || 'JARVIS timer';
  const durationSeconds = Number(ui.broadcastTimerSeconds?.value || 300);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 86_400) {
    if (ui.broadcastActionStatus) ui.broadcastActionStatus.textContent = 'TIMER MUST BE 5–86400 SECONDS.';
    return;
  }
  void runBroadcastAction({ type: 'timer_create', name, durationSeconds }, `LOCAL TIMER STARTED // ${name}`);
}

function createLocalBroadcastPoll() {
  const question = ui.broadcastPollQuestion?.value.trim() || '';
  const options = (ui.broadcastPollOptions?.value || '').split('|').map((item) => item.trim()).filter(Boolean);
  if (!question || options.length < 2) {
    if (ui.broadcastActionStatus) ui.broadcastActionStatus.textContent = 'POLL NEEDS A QUESTION AND TWO OPTIONS.';
    return;
  }
  void runBroadcastAction({ type: 'poll_create', question, options }, 'LOCAL POLL OPENED');
}

function queueLocalReadAloud() {
  const text = ui.broadcastReadAloud?.value.trim() || '';
  if (!text) {
    if (ui.broadcastActionStatus) ui.broadcastActionStatus.textContent = 'READ-ALOUD TEXT IS EMPTY.';
    return;
  }
  void runBroadcastAction({ type: 'read_aloud_enqueue', text }, 'READ-ALOUD QUEUED LOCALLY');
  if (ui.broadcastReadAloud) ui.broadcastReadAloud.value = '';
}

function renderMediaDeck(payload = {}) {
  const current = payload.current || null; const queue = Array.isArray(payload.queue) ? payload.queue : [];
  const available = payload.mode === 'local-stage' && payload.externalConnected === false;
  const items = [
    ['NOW PLAYING', current?.title || 'NONE', current?.status || 'local stage'],
    ['QUEUE', queue.length, 'host-local items'],
    ['HISTORY', Array.isArray(payload.history) ? payload.history.length : 0, 'recently staged'],
    ['EXTERNAL', available ? 'OFF' : 'CHECK', 'no service writes']
  ];
  if (ui.mediaDeckGrid) ui.mediaDeckGrid.replaceChildren(...items.map(([name, value, detail]) => {
    const item = document.createElement('div'); item.className = `google-item ${available ? 'connected' : ''}`;
    item.innerHTML = `<i></i><span><b>${name}</b><small>${detail}</small></span><strong>${String(value)}</strong>`; return item;
  }));
  if (ui.mediaDeckState) { ui.mediaDeckState.textContent = available ? 'READY // LOCAL STAGE' : 'OFFLINE'; ui.mediaDeckState.classList.toggle('active', available); }
  if (ui.mediaQueue) {
    if (!current && !queue.length) { ui.mediaQueue.innerHTML = '<p class="empty-state">No local media staged.</p>'; return; }
    ui.mediaQueue.replaceChildren(...[
      ...(current ? [current] : []), ...queue
    ].map((item) => {
      const row = document.createElement('div'); row.className = `media-queue-row ${item.status || 'queued'}`;
      const title = document.createElement('b'); title.textContent = item.title;
      const meta = document.createElement('small'); meta.textContent = `${item.artist || 'JARVIS local'} // ${String(item.status || 'queued').toUpperCase()}`;
      row.append(title, meta); return row;
    }));
  }
}

async function loadMediaDeck() {
  try { renderMediaDeck(await json('/api/media/state')); }
  catch { renderMediaDeck({}); }
}

async function runMediaAction(action, successMessage) {
  const buttons = [ui.mediaPlay, ui.mediaEnqueue, ui.mediaPause, ui.mediaNext, ui.mediaStop].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });
  if (ui.mediaActionStatus) ui.mediaActionStatus.textContent = 'LOCAL MEDIA ACTION IN PROGRESS…';
  try {
    await json('/api/media/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
    if (ui.mediaActionStatus) ui.mediaActionStatus.textContent = successMessage;
    await loadMediaDeck();
  } catch (error) {
    if (ui.mediaActionStatus) ui.mediaActionStatus.textContent = `LOCAL MEDIA ACTION FAILED // ${error.message}`;
  } finally { buttons.forEach((button) => { button.disabled = false; }); }
}

function mediaDraft() {
  const title = ui.mediaTitle?.value.trim() || '';
  const artist = ui.mediaArtist?.value.trim() || 'JARVIS local';
  const durationSeconds = Number(ui.mediaDuration?.value || 0);
  if (!title) { if (ui.mediaActionStatus) ui.mediaActionStatus.textContent = 'ENTER A TITLE OR PROMPT FIRST.'; ui.mediaTitle?.focus(); return null; }
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 86_400) { if (ui.mediaActionStatus) ui.mediaActionStatus.textContent = 'DURATION MUST BE 0–86400 SECONDS.'; return null; }
  return { title, artist, durationSeconds };
}

function playLocalMedia() { const draft = mediaDraft(); if (draft) void runMediaAction({ type: 'enqueue', ...draft, autoplay: true }, `LOCAL MEDIA STAGED // ${draft.title}`); }
function enqueueLocalMedia() { const draft = mediaDraft(); if (draft) void runMediaAction({ type: 'enqueue', ...draft }, `LOCAL MEDIA QUEUED // ${draft.title}`); }
function controlLocalMedia(type, message) { void runMediaAction({ type }, message); }

function renderObsOverlay(payload = {}) {
  const available = Boolean(payload.available && payload.url);
  if (ui.obsOverlayState) {
    ui.obsOverlayState.textContent = available ? 'READY // READ ONLY' : 'OFFLINE';
    ui.obsOverlayState.classList.toggle('active', available);
  }
  if (ui.obsOverlayUrl) ui.obsOverlayUrl.value = available ? payload.url : '';
  if (ui.copyObsOverlayUrl) ui.copyObsOverlayUrl.disabled = !available;
  if (ui.openObsOverlay) { ui.openObsOverlay.hidden = !available; ui.openObsOverlay.href = available ? payload.url : '#'; }
}

async function loadObsOverlay() {
  try { renderObsOverlay(await json('/api/obs/overlay/link?theme=jarvis')); }
  catch { renderObsOverlay({ available: false }); }
}

function renderDesktopApps(payload) {
  const apps = Array.isArray(payload?.apps) ? payload.apps : [];
  const platform = String(payload?.platform || 'host').toUpperCase();
  const visible = apps.slice(0, 18);
  ui.desktopAppsGrid.replaceChildren(...visible.map((app) => {
    const item = document.createElement('div'); item.className = 'google-item connected';
    const dot = document.createElement('i');
    const copy = document.createElement('span'); const name = document.createElement('b'); name.textContent = app.name || 'Unnamed app';
    const detail = document.createElement('small'); detail.textContent = `${String(app.category || 'APPLICATION').toUpperCase()} // ${String(app.platform || platform).toUpperCase()}`;
    copy.append(name, detail); const action = document.createElement('strong'); action.textContent = 'VOICE / PIN'; item.append(dot, copy, action); return item;
  }));
  if (!visible.length) {
    const empty = document.createElement('div'); empty.className = 'google-item';
    const dot = document.createElement('i'); const copy = document.createElement('span'); const name = document.createElement('b'); name.textContent = 'NO APPS DISCOVERED'; const detail = document.createElement('small'); detail.textContent = 'Refresh this host or use the local dashboard.'; copy.append(name, detail); empty.append(dot, copy); ui.desktopAppsGrid.append(empty);
  }
  ui.desktopAppsState.textContent = `${apps.length} DISCOVERED // ${platform}`;
  ui.desktopAppsState.classList.toggle('active', apps.length > 0);
}

function routineTime(value) {
  if (!value) return 'NOT SCHEDULED';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'NOT SCHEDULED' : date.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase();
}

function syncRoutineFields() {
  const kind = ui.routineKind?.value || '';
  if (ui.routineTopicWrap) ui.routineTopicWrap.hidden = kind !== 'news';
  if (ui.routineLocationWrap) ui.routineLocationWrap.hidden = kind !== 'weather';
  if (kind === 'calendar' && ui.routineName && !ui.routineName.value.trim()) ui.routineName.value = 'Calendar agenda';
  if (kind === 'briefing' && ui.routineName && !ui.routineName.value.trim()) ui.routineName.value = 'Morning briefing';
  if (kind === 'weather' && ui.routineName && !ui.routineName.value.trim()) ui.routineName.value = 'Dubai weather';
}

function renderRoutines(payload = {}) {
  const routines = Array.isArray(payload.routines) ? payload.routines : [];
  state.routines = routines;
  const active = routines.filter((item) => item.enabled).length;
  ui.routinesState.textContent = `${active}/${routines.length} ACTIVE`;
  ui.routinesState.classList.toggle('active', routines.length > 0);
  if (!routines.length) { ui.routineList.innerHTML = '<p class="empty-state">No local routines yet. Add a read-only check above.</p>'; return; }
  ui.routineList.replaceChildren(...routines.map((routine) => {
    const row = document.createElement('article'); row.className = `routine-row ${routine.enabled ? 'enabled' : 'paused'}`;
    const dot = document.createElement('i');
    const copy = document.createElement('span'); const name = document.createElement('b'); name.textContent = routine.name;
    const detail = document.createElement('small'); detail.textContent = `${routine.label || routine.kind} // EVERY ${routine.intervalMinutes} MIN // NEXT ${routineTime(routine.nextRunAt)}`;
    const result = document.createElement('em'); result.textContent = routine.lastError ? `ERROR // ${routine.lastError}` : routine.lastResult || 'WAITING FOR FIRST RUN';
    copy.append(name, detail, result);
    const actions = document.createElement('span'); actions.className = 'routine-row-actions';
    const run = document.createElement('button'); run.type = 'button'; run.textContent = 'RUN'; run.title = 'Run this read-only routine now';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = routine.enabled ? 'PAUSE' : 'RESUME';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'REMOVE'; remove.className = 'routine-remove';
    run.addEventListener('click', () => void runRoutine(routine.id, run));
    toggle.addEventListener('click', () => void toggleRoutine(routine, toggle));
    remove.addEventListener('click', () => void removeRoutine(routine, remove));
    actions.append(run, toggle, remove); row.append(dot, copy, actions); return row;
  }));
}

async function loadRoutines() {
  try { renderRoutines(await json('/api/routines')); }
  catch (error) { ui.routinesState.textContent = 'OFFLINE'; setMessage(`Routine board unavailable: ${error.message}`); }
}

async function runRoutine(id, button) {
  button.disabled = true; button.textContent = 'RUN…';
  try { await json(`/api/routines/${encodeURIComponent(id)}/run`, { method: 'POST' }); await loadRoutines(); setMessage('Read-only routine completed or recorded its latest error in the activity stream.'); }
  catch (error) { setMessage(`Routine run failed: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'RUN'; }
}

async function toggleRoutine(routine, button) {
  button.disabled = true;
  try { await json(`/api/routines/${encodeURIComponent(routine.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !routine.enabled }) }); await loadRoutines(); setMessage(`Routine ${routine.enabled ? 'paused' : 'resumed'} locally.`); }
  catch (error) { setMessage(`Routine update failed: ${error.message}`); }
  finally { button.disabled = false; }
}

async function removeRoutine(routine, button) {
  if (!window.confirm(`Remove the local routine “${routine.name}”?`)) return;
  button.disabled = true;
  try { await json(`/api/routines/${encodeURIComponent(routine.id)}`, { method: 'DELETE' }); await loadRoutines(); setMessage('Local routine removed. No external service was changed.'); }
  catch (error) { setMessage(`Routine removal failed: ${error.message}`); }
  finally { button.disabled = false; }
}

async function createRoutine() {
  const kind = ui.routineKind.value; const name = ui.routineName.value.trim();
  if (!name) { setMessage('Give the routine a name first.'); ui.routineName.focus(); return; }
  ui.createRoutine.disabled = true; ui.createRoutine.textContent = 'ADDING…';
  try {
    await json('/api/routines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, intervalMinutes: Number(ui.routineInterval.value), topic: ui.routineTopic.value.trim(), location: ui.routineLocation.value.trim() }) });
    ui.routineName.value = ''; ui.routineTopic.value = ''; ui.routineLocation.value = ''; await loadRoutines(); setMessage('Read-only routine added. It will run locally at the next scheduled time.');
  } catch (error) { setMessage(`Routine could not be added: ${error.message}`); }
  finally { ui.createRoutine.disabled = false; ui.createRoutine.textContent = 'ADD ROUTINE'; }
}

function renderMemory(payload = {}) {
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const reminders = Array.isArray(payload.reminders) ? payload.reminders : [];
  state.notes = notes; state.reminders = reminders;
  ui.memoryState.textContent = `${notes.length} NOTES // ${reminders.length} REMINDERS`;
  ui.memoryState.classList.toggle('active', notes.length > 0 || reminders.length > 0);
  ui.memoryNoteCount.textContent = String(notes.length); ui.memoryReminderCount.textContent = String(reminders.length);
  if (!notes.length) ui.memoryNoteList.innerHTML = '<p class="empty-state">No notes yet.</p>';
  else ui.memoryNoteList.replaceChildren(...notes.slice(0, 40).map((note) => {
    const row = document.createElement('article'); row.className = 'memory-item';
    const head = document.createElement('div'); head.className = 'memory-item-head';
    const title = document.createElement('b'); title.textContent = note.title; head.append(title);
    const body = document.createElement('p'); body.textContent = note.body;
    const meta = document.createElement('small'); meta.textContent = `${note.pinned ? 'PINNED // ' : ''}${(note.tags || []).map((tag) => `#${tag}`).join(' ')} // UPDATED ${routineTime(note.updatedAt)}`;
    const actions = document.createElement('span'); actions.className = 'memory-item-actions';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'REMOVE'; remove.className = 'danger'; remove.addEventListener('click', () => void removeMemoryNote(note, remove));
    actions.append(remove); row.append(head, body, meta, actions); return row;
  }));
  if (!reminders.length) ui.memoryReminderList.innerHTML = '<p class="empty-state">No reminders yet.</p>';
  else ui.memoryReminderList.replaceChildren(...reminders.slice(0, 40).map((reminder) => {
    const row = document.createElement('article'); row.className = 'memory-item';
    const head = document.createElement('div'); head.className = 'memory-item-head';
    const title = document.createElement('b'); title.textContent = reminder.title; head.append(title);
    const due = document.createElement('em'); due.textContent = `DUE ${routineTime(reminder.dueAt)}`; head.append(due);
    const meta = document.createElement('small'); meta.textContent = reminder.notifiedAt ? `NOTIFIED ${routineTime(reminder.notifiedAt)}` : 'LOCAL HOST REMINDER';
    const actions = document.createElement('span'); actions.className = 'memory-item-actions';
    const complete = document.createElement('button'); complete.type = 'button'; complete.textContent = 'DONE'; complete.addEventListener('click', () => void completeMemoryReminder(reminder, complete));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'REMOVE'; remove.className = 'danger'; remove.addEventListener('click', () => void removeMemoryReminder(reminder, remove));
    actions.append(complete, remove); row.append(head, meta, actions); return row;
  }));
}

async function loadMemory() {
  try { renderMemory(await json('/api/memory')); }
  catch (error) { ui.memoryState.textContent = 'OFFLINE'; setMessage(`Local memory unavailable: ${error.message}`); }
}

async function createMemoryNote() {
  const title = ui.memoryNoteTitle.value.trim(); const body = ui.memoryNoteBody.value.trim();
  if (!title || !body) { setMessage('Add a note title and body first.'); (title ? ui.memoryNoteBody : ui.memoryNoteTitle).focus(); return; }
  ui.saveMemoryNote.disabled = true; ui.saveMemoryNote.textContent = 'SAVING…';
  try { await json('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, tags: ui.memoryNoteTags.value }) }); ui.memoryNoteTitle.value = ''; ui.memoryNoteBody.value = ''; ui.memoryNoteTags.value = ''; await loadMemory(); setMessage('Private local note saved.'); }
  catch (error) { setMessage(`Note could not be saved: ${error.message}`); }
  finally { ui.saveMemoryNote.disabled = false; ui.saveMemoryNote.textContent = 'SAVE NOTE'; }
}

async function removeMemoryNote(note, button) {
  if (!window.confirm(`Remove the local note “${note.title}”?`)) return;
  button.disabled = true; try { await json(`/api/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' }); await loadMemory(); setMessage('Local note removed.'); }
  catch (error) { setMessage(`Note removal failed: ${error.message}`); } finally { button.disabled = false; }
}

async function createMemoryReminder() {
  const title = ui.memoryReminderTitle.value.trim(); const due = ui.memoryReminderDue.value;
  if (!title || !due) { setMessage('Add a reminder title and due date first.'); (title ? ui.memoryReminderDue : ui.memoryReminderTitle).focus(); return; }
  const dueAt = new Date(due).toISOString(); ui.saveMemoryReminder.disabled = true; ui.saveMemoryReminder.textContent = 'ADDING…';
  try { await json('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, dueAt }) }); ui.memoryReminderTitle.value = ''; ui.memoryReminderDue.value = ''; await loadMemory(); setMessage('Local reminder added.'); }
  catch (error) { setMessage(`Reminder could not be added: ${error.message}`); }
  finally { ui.saveMemoryReminder.disabled = false; ui.saveMemoryReminder.textContent = 'ADD REMINDER'; }
}

async function completeMemoryReminder(reminder, button) {
  button.disabled = true; try { await json(`/api/reminders/${encodeURIComponent(reminder.id)}/complete`, { method: 'POST' }); await loadMemory(); setMessage('Reminder completed locally.'); }
  catch (error) { setMessage(`Reminder completion failed: ${error.message}`); } finally { button.disabled = false; }
}

async function removeMemoryReminder(reminder, button) {
  if (!window.confirm(`Remove the local reminder “${reminder.title}”?`)) return;
  button.disabled = true; try { await json(`/api/reminders/${encodeURIComponent(reminder.id)}`, { method: 'DELETE' }); await loadMemory(); setMessage('Local reminder removed.'); }
  catch (error) { setMessage(`Reminder removal failed: ${error.message}`); } finally { button.disabled = false; }
}

async function verifyGoogle() {
  ui.testGoogle.disabled = true; ui.testGoogle.textContent = 'VERIFYING…'; ui.googleState.textContent = 'PROBING';
  try {
    const status = await json('/api/google/status?probe=1');
    renderGoogle(status);
    const count = Object.values(status.connectors || {}).filter(Boolean).length;
    const failures = Object.entries(status.errors || {}).map(([service, error]) => `${service}: ${error}`).slice(0, 3);
    setMessage(count ? `Google live check complete: ${count} connectors responded.` : `Google OAuth files were found, but no Google API responded.${failures.length ? ` ${failures.join(' | ')}` : ' Check scopes and enabled APIs.'}`);
  } catch (error) {
    ui.googleState.textContent = 'REAUTH REQUIRED // SEND OFF';
    ui.googleState.classList.add('warning');
    ui.googleNote.textContent = `Google OAuth verification failed: ${error.message || 'provider unavailable'}`;
    setMessage(`Google verification failed: ${error.message}`);
  }
  finally { ui.testGoogle.disabled = false; ui.testGoogle.textContent = 'VERIFY GOOGLE'; }
}

async function startGoogleReauthorization() {
  if (!ui.reauthorizeGoogle) return;
  ui.reauthorizeGoogle.disabled = true;
  ui.reauthorizeGoogle.textContent = 'STARTING…';
  if (ui.googleReauthLink) ui.googleReauthLink.hidden = true;
  try {
    const flow = await json('/api/google/reauthorize', { method: 'POST' });
    if (flow.url && ui.googleReauthLink) {
      ui.googleReauthLink.href = flow.url;
      ui.googleReauthLink.hidden = false;
    }
    if (ui.googleReauthNote) ui.googleReauthNote.textContent = flow.url
      ? 'A private local callback is waiting. Open the consent URL, approve the requested Gmail, Calendar, Drive, Tasks, and Contacts scopes, then return here and press VERIFY GOOGLE.'
      : `OAuth helper status: ${flow.status || 'waiting'}.`;
    setMessage(flow.url
      ? 'Google consent is ready. Open the consent link, finish approval, then run VERIFY GOOGLE.'
      : `Google OAuth helper started: ${flow.status || 'waiting'}.`);
  } catch (error) {
    if (ui.googleReauthNote) ui.googleReauthNote.textContent = error.message || 'Google OAuth could not start.';
    setMessage(`Google reauthorization could not start: ${error.message}`);
  } finally {
    ui.reauthorizeGoogle.disabled = false;
    ui.reauthorizeGoogle.textContent = 'REAUTHORIZE GOOGLE';
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
  ui.screenState.textContent = seconds ? `RETRY IN ${seconds}s` : 'RETRYING';
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
  setMessage('Escape released the selected display. JARVIS will make one bounded screen-share retry in 20 seconds.');
  state.screenRetryTimer = window.setTimeout(() => {
    state.screenRetryTimer = 0;
    state.screenRetryDueAt = 0;
    if (state.screenRetryCountdownTimer) { clearInterval(state.screenRetryCountdownTimer); state.screenRetryCountdownTimer = 0; }
    if (!state.screenRetryable || state.screenStream) return;
    state.screenRetryAttempts += 1;
    ui.screenState.textContent = 'RETRYING';
    void startScreenShare({ automaticRetry: true });
  }, SCREEN_RETRY_DELAY_MS);
}

function handleScreenRelease() {
  if (!state.screenStream && !state.screenRetryable) return;
  state.screenRetryable = true;
  state.screenRetryRequested = true;
  if (state.screenStream) stopScreenShare({ quiet: true, preserveRetry: true });
  scheduleScreenRetry();
}

function stopScreenShare({ quiet = false, preserveRetry = false } = {}) {
  state.screenRequest += 1;
  state.screenStream?.getTracks().forEach((track) => track.stop()); state.screenStream = null;
  ui.screenVideo.srcObject = null; ui.screenPlaceholder.hidden = false; ui.screenSource.textContent = 'NO DISPLAY SELECTED';
  ui.startScreen.disabled = false; ui.stopScreen.disabled = true; ui.analyzeScreen.disabled = true; ui.screenState.textContent = 'OFFLINE'; ui.screenState.classList.remove('active');
  if (!preserveRetry) { state.screenRetryable = false; state.screenRetryAttempts = 0; clearScreenRetry(); }
  if (!quiet) setMessage('Screen link stopped. No display track remains open.');
}

async function startScreenShare({ automaticRetry = false } = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) { setMessage('This browser does not support screen sharing. Use a compatible browser on localhost or HTTPS.'); return; }
  if (!automaticRetry) stopScreenShare({ quiet: true });
  const requestId = ++state.screenRequest;
  ui.startScreen.disabled = true; ui.screenState.textContent = automaticRetry ? 'RETRYING' : 'SELECTING';
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 12, max: 20 } }, audio: false });
    if (!stream.getVideoTracks().length) throw new Error('No display track returned.');
    if (requestId !== state.screenRequest) { stream.getTracks().forEach((track) => track.stop()); return; }
    state.screenStream = stream;
    state.screenRetryable = true;
    state.screenRetryRequested = false;
    state.screenRetryAttempts = automaticRetry ? state.screenRetryAttempts : 0;
    ui.screenVideo.srcObject = stream; await ui.screenVideo.play().catch(() => {});
    if (requestId !== state.screenRequest || state.screenStream !== stream) { stream.getTracks().forEach((track) => track.stop()); return; }
    const track = stream.getVideoTracks()[0]; track.addEventListener('ended', handleScreenRelease, { once: true });
    ui.screenPlaceholder.hidden = true; ui.screenSource.textContent = track.label || 'USER-SELECTED DISPLAY';
    ui.startScreen.disabled = true; ui.stopScreen.disabled = false; ui.analyzeScreen.disabled = false; ui.screenState.textContent = 'LIVE'; ui.screenState.classList.add('active');
    setMessage('Live display preview is active. JARVIS receives nothing until you press ANALYZE SNAPSHOT.');
  } catch (error) {
    stopScreenShare({ quiet: true, preserveRetry: automaticRetry });
    if (automaticRetry) {
      state.screenRetryable = false; state.screenRetryRequested = false;
      ui.screenState.textContent = 'CLICK TO RETRY';
      setMessage('The browser requires a fresh user gesture before another display can be selected. Press START SCREEN SHARE once.');
    } else setMessage(error.name === 'NotAllowedError' ? 'Screen selection was cancelled or blocked. Choose a display when the browser asks.' : `Screen share failed: ${error.message}`);
  }
}

function captureScreenSnapshot() {
  if (!state.screenStream || !ui.screenVideo.videoWidth) throw new Error('Start screen sharing and wait for the live preview first.');
  const width = Math.min(1280, ui.screenVideo.videoWidth); const height = Math.max(1, Math.round(ui.screenVideo.videoHeight * width / ui.screenVideo.videoWidth));
  ui.screenCanvas.width = width; ui.screenCanvas.height = height;
  ui.screenCanvas.getContext('2d', { alpha: false }).drawImage(ui.screenVideo, 0, 0, width, height);
  return ui.screenCanvas.toDataURL('image/jpeg', .72);
}

async function analyzeScreen() {
  if (state.screenBusy) return;
  state.screenBusy = true; ui.analyzeScreen.disabled = true; ui.analyzeScreen.textContent = 'ANALYZING…'; ui.screenAnswer.innerHTML = '<span>VISION RESPONSE</span><p>Local vision model is examining one approved snapshot…</p>';
  try {
    const image = captureScreenSnapshot();
    const result = await json('/api/screen/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, prompt: ui.screenQuestion.value.trim() }) });
    const title = document.createElement('span'); title.textContent = `${result.model || 'LOCAL VISION'} // RESULT`;
    const body = document.createElement('p'); body.textContent = result.content;
    ui.screenAnswer.replaceChildren(title, body); setMessage('Screen snapshot analysis complete. The live stream remained browser-local.');
  } catch (error) {
    const title = document.createElement('span'); title.textContent = 'VISION UNAVAILABLE';
    const body = document.createElement('p'); body.textContent = error.message;
    ui.screenAnswer.replaceChildren(title, body); setMessage(`Screen analysis failed: ${error.message}`);
  } finally { state.screenBusy = false; ui.analyzeScreen.disabled = !state.screenStream; ui.analyzeScreen.textContent = 'ANALYZE SNAPSHOT'; }
}

async function loadDetector() {
  if (state.detector || !window.cocoSsd) return state.detector;
  ui.personReadout.textContent = 'LOADING MODEL';
  state.detector = await window.cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: '/models/coco-ssd/model.json' });
  return state.detector;
}

function setSensorUi(active, detail = '') {
  state.sensorsActive = active;
  ui.start.disabled = active;
  ui.stop.disabled = !active;
  ui.sensorState.textContent = active ? 'CALIBRATING' : 'STANDBY';
  ui.sensorState.classList.toggle('active', active);
  if (detail) ui.cameraSource.textContent = detail;
}

function stopSensors({ quiet = false } = {}) {
  if (state.sensorsActive && state.profileDevice && (state.voiceDiagnosticsFresh || state.noiseFloor !== .008)) {
    saveVoiceProfile(state.profileDevice, { noiseFloor: state.noiseFloor, signalToNoiseDb: state.lastSignalToNoiseDb });
  }
  clearTimeout(state.detectTimer);
  clearTimeout(state.piTimer);
  cancelAnimationFrame(state.animation);
  state.stream?.getTracks().forEach((track) => track.stop());
  void state.audioContext?.close();
  state.stream = null;
  state.audioContext = null;
  state.analyser = null;
  state.frequencySamples = null;
  state.profileDevice = '';
  renderMicrophoneProfile();
  ui.video.srcObject = null;
  ui.image.hidden = true;
  ui.canvas.getContext('2d').clearRect(0, 0, ui.canvas.width, ui.canvas.height);
  ui.placeholder.hidden = false;
  ui.personReadout.textContent = 'STANDBY';
  ui.personReadout.style.color = '';
  ui.micReadout.textContent = '0%';
  ui.micMeter.style.setProperty('--level', '0%');
  ui.wakeReadout.textContent = 'STANDBY';
  ui.wakeReadout.style.color = '';
  resetVoiceDiagnostics();
  setSensorUi(false, 'NO SOURCE');
  if (!quiet) setMessage('Sensor calibration stopped. All browser media tracks are closed.');
}

function prepareCanvas(width, height) {
  ui.canvas.width = width || 960;
  ui.canvas.height = height || 540;
  ui.canvas.style.display = 'block';
}

async function drawDetections(source) {
  if (!currentSettings().personDetection) return;
  const sourceWidth = Number(source?.videoWidth || source?.naturalWidth || 0);
  const sourceHeight = Number(source?.videoHeight || source?.naturalHeight || 0);
  // A detector request can outlive stopSensors() by one promise turn. Never
  // hand a released/zero-sized element to TensorFlow.js; that produces the
  // misleading "texture size [0x0]" error and can overwrite a newer status.
  if (sourceWidth < 1 || sourceHeight < 1) return;
  try {
    const detector = await loadDetector();
    if (!detector) throw new Error('Local person model is unavailable.');
    const predictions = await detector.detect(source);
    const threshold = Number(ui.personThreshold.value);
    const people = predictions.filter((item) => item.class === 'person' && item.score >= threshold);
    const context = ui.canvas.getContext('2d');
    context.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
    for (const person of people) {
      const [x, y, width, height] = person.bbox;
      context.strokeStyle = '#71ffca'; context.lineWidth = 3; context.strokeRect(x, y, width, height);
      context.fillStyle = 'rgba(2,8,12,.82)'; context.fillRect(x, Math.max(0, y - 22), 122, 20);
      context.fillStyle = '#71ffca'; context.font = '12px monospace'; context.fillText(`PERSON ${Math.round(person.score * 100)}%`, x + 5, Math.max(14, y - 7));
    }
    ui.personReadout.textContent = people.length ? `OK // ${people.length}` : 'NO PERSON';
    ui.personReadout.style.color = people.length ? '#71ffca' : '';
  } catch (error) {
    // Ignore teardown races; only surface detector errors for an active,
    // correctly-sized sensor session.
    if (!state.sensorsActive || !sourceWidth || !sourceHeight) return;
    ui.personReadout.textContent = 'MODEL ERROR';
    setMessage(error.message);
  }
}

function monitorAudio() {
  if (!state.analyser) return;
  const samples = new Uint8Array(state.analyser.fftSize);
  state.analyser.getByteTimeDomainData(samples);
  const settings = currentSettings();
  const analysis = analyzeVoiceFrame(samples, { noiseFloor: state.noiseFloor, sensitivity: settings.micSensitivity });
  const frequencyCount = Number(state.analyser.frequencyBinCount) || Math.floor(state.analyser.fftSize / 2);
  if (!state.frequencySamples || state.frequencySamples.length !== frequencyCount) state.frequencySamples = new Uint8Array(frequencyCount);
  let spectrum = { available: false, totalPower: 0, lowBandRatio: 0, speechBandRatio: 0, highBandRatio: 0, lowHum: false };
  if (typeof state.analyser.getByteFrequencyData === 'function') {
    state.analyser.getByteFrequencyData(state.frequencySamples);
    spectrum = analyzeVoiceSpectrum(state.frequencySamples, { sampleRate: state.audioContext?.sampleRate || 48_000, fftSize: state.analyser.fftSize });
  }
  const speechBandEligible = isSpeechBandEligible(spectrum);
  const diagnostic = { ...analysis, speechCandidate: analysis.speechCandidate && speechBandEligible, speechScore: speechBandEligible ? analysis.speechScore : Math.min(analysis.speechScore, .1), spectrumAvailable: spectrum.available, lowBandRatio: spectrum.lowBandRatio, speechBandRatio: spectrum.speechBandRatio, highBandRatio: spectrum.highBandRatio, speechBandEligible, lowHum: spectrum.lowHum };
  const level = analysis.rms;
  const shown = Math.min(100, Math.round(level * 420));
  ui.micReadout.textContent = `${shown}%`;
  ui.micMeter.style.setProperty('--level', `${shown}%`);
  const now = performance.now();
  const voiceActive = diagnostic.speechCandidate;
  const floorUpdate = stabilizeNoiseFloor(state.noiseFloor, state.noiseFloorBaseline, level, { speaking: voiceActive });
  state.noiseFloor = floorUpdate.noiseFloor; state.noiseFloorBaseline = floorUpdate.baseline;
  updateVoiceDiagnostics(diagnostic, { source: 'BROWSER MIC', now });
  ui.micReadout.title = `SNR ${diagnostic.signalToNoiseDb} dB // gate ${Math.round(diagnostic.speechScore * 100)}% // crest ${diagnostic.crestFactor.toFixed(2)}${diagnostic.lowHum ? ' // low hum gated' : diagnostic.speechBandEligible === false ? ' // high-band noise gated' : ''}`;
  if (settings.voiceActivity && voiceActive && !state.clapAbove) ui.wakeReadout.textContent = 'VOICE ACTIVITY';
  else if (settings.voiceActivity && !state.lastClap) ui.wakeReadout.textContent = settings.doubleClap ? 'CLAP LISTENER' : settings.wakeWord ? 'WAKE ARMED' : 'SENSORS ON';
  const clapThreshold = Math.max(settings.clapSensitivity, state.noiseFloor * 7.5);
  const impulse = level > clapThreshold && level > state.lastAudioLevel * 1.32;
  if (settings.doubleClap && impulse && !state.clapAbove) {
    state.clapAbove = true;
    if (state.lastClap && now - state.lastClap <= settings.doubleClapWindow) {
      ui.wakeReadout.textContent = 'DOUBLE CLAP'; ui.wakeReadout.style.color = '#71ffca'; state.lastClap = 0;
      setTimeout(() => { ui.wakeReadout.style.color = ''; }, 1400);
    } else state.lastClap = now;
  }
  if (level < clapThreshold * .52) state.clapAbove = false;
  if (state.lastClap && now - state.lastClap > settings.doubleClapWindow) state.lastClap = 0;
  state.lastAudioLevel = level;
  state.animation = requestAnimationFrame(monitorAudio);
}

async function startBrowserSensors() {
  const settings = currentSettings();
  const needsVideo = settings.personDetection || settings.gestureControl;
  const needsAudio = settings.voiceActivity || settings.wakeWord || settings.doubleClap;
  if (!needsVideo && !needsAudio) throw new Error('Enable at least one camera or microphone listener in Perception.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not expose camera or microphone access.');
  const video = needsVideo ? { deviceId: deviceIdConstraint(settings.browserCamera), width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } } : false;
  const audio = needsAudio ? {
    deviceId: deviceIdConstraint(settings.browserMicrophone),
    channelCount: { ideal: 1 }, sampleRate: { ideal: 16000 }, echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl
  } : false;
  const opened = await getUserMediaWithFallback(navigator.mediaDevices, { video, audio });
  state.stream = opened.stream;
  if (opened.fallbackUsed) {
    if (needsVideo) ui.browserCamera.value = '';
    if (needsAudio) ui.browserMicrophone.value = '';
    updateDirty();
    setMessage('A saved device was unavailable. JARVIS recovered with the browser defaults; save to keep this repair.');
  }
  let activeDeviceId = settings.browserMicrophone;
  try { activeDeviceId = normalizeDeviceId(state.stream.getAudioTracks()[0]?.getSettings?.().deviceId) || activeDeviceId; } catch {}
  state.profileDevice = activeDeviceId;
  const profile = needsAudio ? loadVoiceProfile(state.profileDevice) : null;
  // Device selection is explicit in Settings; load only this microphone's
  // bounded local floor so one mic cannot poison another mic's threshold.
  state.noiseFloor = profile?.noiseFloor ?? .008; state.noiseFloorBaseline = state.noiseFloor; state.lastNoiseFloor = state.noiseFloor; state.lastSignalToNoiseDb = profile?.signalToNoiseDb ?? 18; state.voiceDiagnosticsFresh = false; state.lastAudioLevel = 0; state.clapAbove = false; state.lastClap = 0; state.frequencySamples = null;
  renderMicrophoneProfile(state.profileDevice);
  resetVoiceDiagnostics('Browser mic opened; waiting for a fresh physical onset.');
  ui.voiceProvider.textContent = 'BROWSER MIC';
  await enumerateBrowserDevices();
  if (needsAudio) renderMicrophoneProfile(state.profileDevice);
  if (video) {
    ui.video.srcObject = state.stream;
    await ui.video.play();
    prepareCanvas(ui.video.videoWidth, ui.video.videoHeight);
    ui.placeholder.hidden = true;
    const loop = async () => {
      if (!state.stream || !ui.video.videoWidth || !ui.video.videoHeight) return;
      await drawDetections(ui.video);
      if (state.stream && ui.video.videoWidth && ui.video.videoHeight) state.detectTimer = setTimeout(loop, Number(ui.scanInterval.value));
    };
    void loop();
  }
  if (audio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser cannot analyse microphone audio.');
    state.audioContext = new AudioContextClass({ latencyHint: 'interactive' });
    await state.audioContext.resume();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 1024;
    state.audioContext.createMediaStreamSource(state.stream).connect(state.analyser);
    monitorAudio();
  }
  ui.wakeReadout.textContent = settings.doubleClap ? 'CLAP LISTENER' : settings.wakeWord ? 'WAKE ARMED' : 'SENSORS ON';
  const videoTrack = state.stream.getVideoTracks()[0]; const audioTrack = state.stream.getAudioTracks()[0];
  setSensorUi(true, [videoTrack?.label, audioTrack?.label].filter(Boolean).join(' + ') || 'BROWSER SENSOR BUS');
}

async function startPiSensors() {
  const settings = currentSettings();
  if ((settings.personDetection || settings.gestureControl) && !settings.piCamera) throw new Error('Select one Raspberry Pi camera first.');
  if ((settings.voiceActivity || settings.wakeWord || settings.doubleClap) && !settings.piMicrophone) throw new Error('Select one Raspberry Pi microphone first.');
  if (!settings.personDetection && !settings.gestureControl && !settings.voiceActivity && !settings.wakeWord && !settings.doubleClap) throw new Error('Enable at least one camera or microphone listener in Perception.');
  ui.video.srcObject = null;
  state.profileDevice = '';
  state.voiceDiagnosticsFresh = false;
  state.lastNoiseFloor = .008;
  state.lastSignalToNoiseDb = 18;
  resetVoiceDiagnostics('Pi bus opened; speech-shape diagnostics are available on the browser mic path.');
  ui.voiceProvider.textContent = 'PI MIC BUS';
  ui.image.hidden = !settings.piCamera;
  ui.placeholder.hidden = Boolean(settings.piCamera);
  prepareCanvas(960, 540);
  const poll = async () => {
    if (!state.sensorsActive) return;
    if (settings.piCamera) {
      ui.image.src = `/api/media/pi-camera/frame.jpg?device=${encodeURIComponent(settings.piCamera)}&t=${Date.now()}`;
      await new Promise((resolve) => { ui.image.onload = resolve; ui.image.onerror = resolve; });
      if (ui.image.naturalWidth) { prepareCanvas(ui.image.naturalWidth, ui.image.naturalHeight); await drawDetections(ui.image); }
    }
    if (settings.piMicrophone) {
      try {
        const sample = await json(`/api/media/pi-microphone/level?device=${encodeURIComponent(settings.piMicrophone)}`);
        const shown = Math.round(sample.level * 100);
        ui.micReadout.textContent = `${shown}%`; ui.micMeter.style.setProperty('--level', `${shown}%`);
        ui.voiceEvidence.textContent = 'PI LEVEL';
        ui.voiceEvidenceDetail.textContent = 'PI MIC BUS // awaiting physical wake gate telemetry';
        ui.voiceSnr.textContent = '-- dB'; ui.voiceGate.textContent = `LEVEL ${shown}% // GATE N/A`;
        ui.voiceEpoch.textContent = '--'; ui.voiceDecision.textContent = 'PI PROBE';
      } catch { ui.micReadout.textContent = 'BUSY'; }
    }
    try {
      const wake = await json('/api/wake/status');
      const diagnostics = wake.diagnostics;
      if (diagnostics) {
        const level = Math.round(Number(diagnostics.micLevel || 0) * 100);
        const floor = Math.round(Number(diagnostics.noiseFloor || 0) * 10000) / 100;
        const snr = Number(diagnostics.signalToNoiseDb || 0);
        ui.micReadout.textContent = `${level}%`;
        ui.micMeter.style.setProperty('--level', `${Math.min(100, level)}%`);
        ui.voiceEvidence.textContent = diagnostics.physicalGate ? 'PI GATE OPEN' : 'PI GATE HOLD';
        const wakeScore = Math.round(Number(diagnostics.wakeScore || 0) * 100);
        const wakeHits = Math.round(Number(diagnostics.wakeScoreHits || 0));
        ui.voiceEvidenceDetail.textContent = `PI WAKE BUS // FLOOR ${floor}% // MODEL ${wakeScore}% // ${wakeHits}/2 TEMPORAL HITS // ${diagnostics.source === 'pi' ? 'LOCAL' : 'UNKNOWN'}`;
        ui.voiceSnr.textContent = `${snr.toFixed(1)} dB`;
        ui.voiceGate.textContent = diagnostics.physicalGate ? (diagnostics.wakeScoreReady ? 'ENERGY PASS // MODEL READY' : 'ENERGY PASS // WAITING FOR SECOND SCORE') : 'ENERGY HOLD // ROOM FLOOR';
        const captureState = String(wake.commandCapture?.state || '').toLowerCase();
        const captureLabel = { warming: 'LOCAL STT WARMING', listening: 'LOCAL STT LISTENING', complete: 'LOCAL COMMAND SENT', timeout: 'LOCAL STT TIMEOUT', error: 'LOCAL STT ERROR' }[captureState] || '';
        ui.voiceDecision.textContent = captureLabel || (wake.sttModel ? 'OPENWAKEWORD + VOSK READY' : wake.model ? 'OPENWAKEWORD READY' : wake.error ? 'MODEL UNAVAILABLE' : 'MODEL STARTING');
        ui.wakeReadout.textContent = diagnostics.physicalGate && wake.ready ? 'HEY JARVIS READY' : wake.ready ? 'HEY JARVIS ARMED' : wake.running ? 'STARTING' : 'SAVE TO START';
      }
    } catch { /* the Pi probe may be available before the wake process starts */ }
    if (state.sensorsActive) state.piTimer = setTimeout(poll, Math.max(1200, Number(ui.scanInterval.value)));
  };
  setSensorUi(true, `PI BUS // ${settings.piCamera || settings.piMicrophone}`);
  await poll();
  const wake = await json('/api/wake/status');
  ui.wakeReadout.textContent = wake.ready ? 'HEY JARVIS READY' : wake.running ? 'STARTING' : 'SAVE TO START';
}

async function startSensors() {
  stopSensors({ quiet: true });
  setMessage('Opening only the selected camera and microphone…');
  ui.sensorState.textContent = 'STARTING';
  try {
    if (currentSettings().source === 'pi') await startPiSensors(); else await startBrowserSensors();
    setMessage('Calibration active. Device changes will safely stop this session.');
  } catch (error) {
    stopSensors({ quiet: true });
    setMessage(`Could not start sensors: ${friendlyMediaError(error)}`);
  }
}

function onFormInput(event) {
  if (event.target === ui.sourceBrowser || event.target === ui.sourcePi) ui.source.value = event.target.value;
  updateOutputs();
  updateDirty();
  previewSettings();
  if (event.target === ui.browserMicrophone) renderMicrophoneProfile();
  if (event.target === ui.voiceLanguage || event.target === ui.preferLocalRecognition) void refreshSpeechSupport();
  if (state.sensorsActive && (event.target.matches('[data-sensor-source]') || event.target.name === 'source-card' || ['person-detection', 'voice-activity', 'wake-word', 'double-clap', 'gesture-control', 'echo-cancellation', 'noise-suppression', 'auto-gain-control'].includes(event.target.id))) {
    stopSensors({ quiet: true });
    setMessage('Sensor configuration changed. Calibration stopped safely; restart it to test the new profile.');
  } else if (state.dirty) setMessage('Unsaved changes are live in the preview. Save to apply them on the Pi.');
}

for (const button of $$('.settings-nav-list button')) button.addEventListener('click', () => activateSection(button.dataset.target));
ui.search.addEventListener('input', searchControls);
ui.refreshDevices.addEventListener('click', () => void loadDeviceLists());
navigator.mediaDevices?.addEventListener?.('devicechange', queueBrowserDeviceRefresh);
ui.resetMicrophoneProfile?.addEventListener('click', () => {
  const deviceId = state.profileDevice || ui.browserMicrophone?.value || '';
  if (state.sensorsActive) stopSensors({ quiet: true });
  if (!deviceId) { setMessage('Select a specific browser microphone before resetting its local profile.'); return; }
  const removed = clearVoiceProfile(deviceId);
  renderMicrophoneProfile(deviceId);
  setMessage(removed ? 'The selected microphone profile was reset locally. Start calibration to learn it again.' : 'No saved local profile exists for the selected microphone.');
});
ui.testGoogle.addEventListener('click', () => void verifyGoogle());
ui.testStirling?.addEventListener('click', () => void verifyStirling());
ui.testStirlingProcessing?.addEventListener('click', () => void verifyStirlingProcessing());
ui.copyObsOverlayUrl?.addEventListener('click', async () => {
  const value = ui.obsOverlayUrl?.value || '';
  if (!value) return;
  try { await navigator.clipboard.writeText(value); setMessage('OBS overlay URL copied. Paste it into an OBS Browser Source.'); }
  catch { ui.obsOverlayUrl?.select(); setMessage('Select the overlay URL and copy it manually.'); }
});
ui.broadcastStartTimer?.addEventListener('click', startLocalBroadcastTimer);
ui.broadcastCreatePoll?.addEventListener('click', createLocalBroadcastPoll);
ui.broadcastQueueReadAloud?.addEventListener('click', queueLocalReadAloud);
ui.mediaPlay?.addEventListener('click', playLocalMedia);
ui.mediaEnqueue?.addEventListener('click', enqueueLocalMedia);
ui.mediaPause?.addEventListener('click', () => controlLocalMedia('pause', 'LOCAL MEDIA PAUSED'));
ui.mediaNext?.addEventListener('click', () => controlLocalMedia('next', 'LOCAL MEDIA ADVANCED'));
ui.mediaStop?.addEventListener('click', () => controlLocalMedia('stop', 'LOCAL MEDIA STOPPED'));
ui.routineKind.addEventListener('change', syncRoutineFields);
ui.createRoutine.addEventListener('click', () => void createRoutine());
ui.saveMemoryNote.addEventListener('click', () => void createMemoryNote());
ui.saveMemoryReminder.addEventListener('click', () => void createMemoryReminder());
ui.startScreen.addEventListener('click', () => void startScreenShare());
ui.stopScreen.addEventListener('click', () => stopScreenShare());
ui.analyzeScreen.addEventListener('click', () => void analyzeScreen());
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') handleScreenRelease(); });
form.addEventListener('input', onFormInput);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.dirty) return;
  setStatus('SAVING', 'loading');
  ui.save.disabled = true;
  try {
    const saved = await json('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentSettings()) });
    applySettings(saved, { saved: true, message: 'Profile committed to the Pi. Wake listener restarted when required.' });
    setStatus('SAVED', 'ready');
    setTimeout(() => { if (!state.dirty) setStatus('READY', 'ready'); }, 1600);
  } catch (error) {
    setStatus('SAVE ERROR', 'error');
    setMessage(`Save failed: ${error.message}`);
    ui.save.disabled = false;
  }
});

ui.revert.addEventListener('click', () => applySettings(state.savedSettings, { message: 'Unsaved changes reverted to the saved Pi profile.' }));
ui.recommended.addEventListener('click', () => {
  const next = { ...currentSettings(), ...recommendedProfile };
  applySettings(next, { message: 'Recommended local profile staged. Review it, then save to apply.' });
});
for (const button of $$('[data-accent]')) button.addEventListener('click', () => {
  ui.accent.value = button.dataset.accent;
  ui.accent.dispatchEvent(new Event('input', { bubbles: true }));
});

ui.start.addEventListener('click', () => void startSensors());
ui.stop.addEventListener('click', () => stopSensors());
ui.testRecognition.addEventListener('click', () => void testRecognition());
ui.testTalkback.addEventListener('click', () => void testTalkback());
ui.autoTuneVoice?.addEventListener('click', autoTuneVoiceGate);
ui.installLocalSpeech.addEventListener('click', () => void installLocalSpeechPack());
ui.testWake.addEventListener('click', async () => {
  try {
    await json('/api/wake/test', { method: 'POST' });
    ui.wakeReadout.textContent = 'TEST SENT';
    ui.voiceDecision.textContent = 'WAKE TEST SENT';
    ui.wakeReadout.style.color = '#71ffca';
    setMessage('The main command screen received a simulated wake event.');
    setTimeout(() => { ui.wakeReadout.style.color = ''; }, 1400);
  } catch (error) { setMessage(`Wake test failed: ${error.message}`); }
});
ui.reauthorizeGoogle?.addEventListener('click', () => void startGoogleReauthorization());

for (const button of $$('[data-preview-size]')) button.addEventListener('click', () => {
  const size = button.dataset.previewSize;
  for (const item of $$('[data-preview-size]')) item.classList.toggle('active', item === button);
  ui.previewViewport.className = `preview-viewport ${size}`;
  ui.previewResolution.textContent = size === 'compact' ? 'PI 1280 × 720' : '16:9 ADAPTIVE';
});
ui.reloadPreview.addEventListener('click', () => { ui.preview.src = '/?preview=1'; });
ui.openPreview.addEventListener('click', () => window.open('/', '_blank', 'noopener'));
ui.preview.addEventListener('load', previewSettings);
window.addEventListener('hashchange', () => activateSection(location.hash.slice(1), { syncUrl: false }));

window.addEventListener('beforeunload', (event) => {
  clearTimeout(browserDeviceChangeTimer);
  stopSensors({ quiet: true }); stopScreenShare({ quiet: true }); stopRecognitionTest(); window.speechSynthesis?.cancel?.();
  try { state.talkbackSource?.stop(); } catch {}
  void state.talkbackContext?.close?.();
  if (state.dirty) { event.preventDefault(); event.returnValue = ''; }
});

if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => loadSpeechVoices(ui.ttsVoice.value));

async function init() {
  try {
    await window.ensureDashboardAuthentication?.();
    const [settings, status, config, workspace, desktopApps, routines, memory, media] = await Promise.all([json('/api/settings'), json('/api/status'), json('/api/config'), json('/api/workspace/status'), json('/api/desktop/apps').catch(() => ({ apps: [], platform: 'host' })), json('/api/routines'), json('/api/memory'), json('/api/media/state').catch(() => ({}))]);
    ui.version.textContent = config.version || '3.31.0';
    ui.node.textContent = config.piOnly ? 'PI-5' : 'LOCAL';
    state.config = config;
    ui.screenVisionNote.textContent = config.visionRuntime === 'ready'
      ? `VISION READY // Ollama ${config.visionModel}${config.visionCapabilityVerified === false ? ' // capability inferred from model tag' : ''}. One approved snapshot at a time; live preview never leaves this browser.`
      : config.visionRuntime === 'missing'
        ? `VISION MODEL MISSING // ${config.visionModel}. Pull it with Ollama, then restart JARVIS; no cloud fallback is used.`
        : config.visionRuntime === 'unsupported'
          ? `VISION MODEL UNSUPPORTED // ${config.visionModel} does not advertise image input.`
          : config.visionRuntime === 'unknown'
            ? 'VISION STATUS UNKNOWN // Ollama model metadata could not be checked on this host.'
            : 'VISION NOT CONFIGURED // install a local Ollama vision model and set JARVIS_VISION_MODEL in .env. Live preview still works locally.';
    if (config.ttsMode === 'fish') {
      const retry = config.fishRetryPolicy || {};
      const retryNote = `Transient ${Number(retry.maxAttempts || 2) - 1}x retry // ${Number(retry.backoffMs || 350)} ms`;
      const wakeSeconds = Math.max(1, Math.round(Number(config.fishWakeTimeoutMs || 12_000) / 1000));
      const replySeconds = Math.max(1, Math.round(Number(config.fishReplyTimeoutMs || 30_000) / 1000));
      const timingNote = `Wake ack <=${wakeSeconds}s // normal reply <=${replySeconds}s`;
      ui.ttsProviderNote.textContent = config.fishConfigured
        ? `Locked: Fish Audio ${config.fishVoiceId} // ${config.fishModel}. ${retryNote}. ${timingNote}. Browser voice substitution is ${config.allowBrowserTtsFallback ? 'enabled' : 'disabled'}.`
        : `Fish Audio ${config.fishVoiceId} is selected, but FISH_AUDIO_API_KEY is not configured. ${retryNote}. ${timingNote}. JARVIS will stay silent instead of changing voices.`;
    }
    loadSpeechVoices(settings.ttsVoice || '');
    state.savedSettings = { ...settings };
    await loadDeviceLists(settings);
    renderGoogle(status.google || {});
    renderStirling(status.stirling || config.stirling || {});
    renderWorkspace(workspace || {});
    await loadObsOverlay();
    await loadBroadcastKit();
    renderMediaDeck(media || {});
    renderDesktopApps(desktopApps || {});
    renderRoutines(routines || {});
    renderMemory(memory || {});
    syncRoutineFields();
    applySettings(settings, { saved: true, message: 'Configuration profile loaded. Live preview link is active.' });
    activateSection(location.hash.slice(1) || 'devices', { syncUrl: false });
    await refreshSpeechSupport();
    state.initialized = true;
    ui.saveStateTitle.dataset.ready = 'true';
    setStatus('READY', 'ready');
    if (state.pendingVoiceAutoTune) {
      state.pendingVoiceAutoTune = false;
      autoTuneVoiceGate();
    }
  } catch (error) {
    ui.saveStateTitle.dataset.ready = 'false';
    setStatus('LOAD ERROR', 'error');
    setMessage(`Settings could not initialize: ${error.message}`);
  }
}

void init();
