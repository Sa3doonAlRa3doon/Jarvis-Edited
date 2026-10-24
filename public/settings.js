import {
  DEFAULT_VOICE_VOCABULARY, normalizeVocabulary, normalizeWakePhrases, selectRecognitionAlternative
} from './voice-utils.js';
import { configureRecognitionCapabilities, startRecognitionWithTrack } from './voice-controller.js';
import { deviceIdConstraint, friendlyMediaError, getUserMediaWithFallback, normalizeDeviceId } from './media-utils.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const form = $('#settings-form');

const ui = {
  status: $('#settings-status'), message: $('#settings-message'), profile: $('#settings-profile'), version: $('#settings-version'), node: $('#settings-node'),
  source: $('#source'), sourceBrowser: $('#source-browser'), sourcePi: $('#source-pi'), browserCamera: $('#browser-camera'), browserMicrophone: $('#browser-microphone'), piCamera: $('#pi-camera'), piMicrophone: $('#pi-microphone'),
  browserDeviceCount: $('#browser-device-count'), piDeviceCount: $('#pi-device-count'), refreshDevices: $('#refresh-devices'),
  personDetection: $('#person-detection'), voiceActivity: $('#voice-activity'), wakeWord: $('#wake-word'), doubleClap: $('#double-clap'), gestureControl: $('#gesture-control'), autoSpeak: $('#auto-speak'), autoRepair: $('#auto-repair'),
  personThreshold: $('#person-threshold'), micSensitivity: $('#mic-sensitivity'), wakeSensitivity: $('#wake-sensitivity'), clapSensitivity: $('#clap-sensitivity'), gestureSensitivity: $('#gesture-sensitivity'), doubleClapWindow: $('#double-clap-window'), scanInterval: $('#scan-interval'), accent: $('#accent'),
  voiceLanguage: $('#voice-language'), wakePhrases: $('#wake-phrases'), voiceVocabulary: $('#voice-vocabulary'), recognitionConfidence: $('#recognition-confidence'), commandSilence: $('#command-silence'),
  voiceAutoStart: $('#voice-auto-start'), preferLocalRecognition: $('#prefer-local-recognition'), echoCancellation: $('#echo-cancellation'), noiseSuppression: $('#noise-suppression'), autoGainControl: $('#auto-gain-control'), bargeIn: $('#barge-in'),
  ttsVoice: $('#tts-voice'), ttsRate: $('#tts-rate'), ttsPitch: $('#tts-pitch'), ttsVolume: $('#tts-volume'), wakeResponse: $('#wake-response'),
  ttsProviderNote: $('#tts-provider-note'),
  speechSupport: $('#speech-support'), voiceTranscript: $('#voice-transcript'), voiceConfidence: $('#voice-confidence'), testRecognition: $('#test-recognition'), testTalkback: $('#test-talkback'), installLocalSpeech: $('#install-local-speech'),
  cameraPreview: $('#camera-preview'), video: $('#camera-video'), image: $('#pi-camera-image'), canvas: $('#sensor-canvas'), placeholder: $('#camera-placeholder'), cameraSource: $('#camera-source'),
  personReadout: $('#person-readout'), micReadout: $('#mic-readout'), micMeter: $('#mic-meter'), wakeReadout: $('#wake-readout'), sensorState: $('#sensor-state'), sensorGuidance: $('#sensor-guidance'),
  start: $('#start-sensors'), stop: $('#stop-sensors'), testWake: $('#test-wake'), googleGrid: $('#google-grid'), googleNote: $('#google-note'), googleState: $('#google-state'),
  preview: $('#live-preview'), previewViewport: $('#preview-viewport'), previewResolution: $('#preview-resolution'), reloadPreview: $('#reload-preview'), openPreview: $('#open-preview'),
  search: $('#settings-search'), workspace: $('#settings-workspace'), searchEmpty: $('#search-empty'), save: $('#save-settings'), revert: $('#revert-settings'), recommended: $('#recommended-settings'), dirtyDot: $('#dirty-dot'), saveStateTitle: $('#save-state-title')
};

const recommendedProfile = {
  personDetection: true, voiceActivity: true, wakeWord: true, doubleClap: true, gestureControl: true, autoSpeak: true,
  personThreshold: 0.55, micSensitivity: 0.18, wakeSensitivity: 0.55, clapSensitivity: 0.34,
  gestureSensitivity: 0.42, doubleClapWindow: 700, scanInterval: 900, accent: '#64e8ff',
  voiceLanguage: 'en-US', wakePhrases: ['hey jarvis', 'jarvis', 'جارفيس', 'يا جارفيس'], voiceVocabulary: DEFAULT_VOICE_VOCABULARY, recognitionConfidence: .35, commandSilenceMs: 700,
  voiceAutoStart: true, preferLocalRecognition: true, echoCancellation: true, noiseSuppression: true, autoGainControl: true, bargeIn: false,
  ttsVoice: '', ttsRate: 1.02, ttsPitch: .92, ttsVolume: 1, wakeResponse: 'Yes sir, how can I help you today?'
};

const state = {
  savedSettings: {}, currentSection: 'devices', media: null, stream: null, audioContext: null, analyser: null, talkbackContext: null, talkbackSource: null,
  animation: 0, detector: null, detectTimer: 0, piTimer: 0, lastClap: 0, clapAbove: false, sensorsActive: false, dirty: false,
  testRecognition: null, testRecognitionStream: null, testRecognitionPending: false, testRecognitionTimer: 0, speechCheck: 0, noiseFloor: .008, lastAudioLevel: 0,
  config: { ttsMode: 'local', fishVoiceId: '', fishConfigured: false, allowBrowserTtsFallback: false }
};

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

function currentSettings() {
  return {
    source: ui.source.value, browserCamera: normalizeDeviceId(ui.browserCamera.value), browserMicrophone: normalizeDeviceId(ui.browserMicrophone.value),
    piCamera: ui.piCamera.value, piMicrophone: ui.piMicrophone.value,
    personDetection: ui.personDetection.checked, voiceActivity: ui.voiceActivity.checked, wakeWord: ui.wakeWord.checked,
    doubleClap: ui.doubleClap.checked, gestureControl: ui.gestureControl.checked, autoSpeak: ui.autoSpeak.checked, autoRepair: ui.autoRepair.checked,
    personThreshold: Number(ui.personThreshold.value), micSensitivity: Number(ui.micSensitivity.value),
    wakeSensitivity: Number(ui.wakeSensitivity.value), clapSensitivity: Number(ui.clapSensitivity.value), gestureSensitivity: Number(ui.gestureSensitivity.value),
    doubleClapWindow: Number(ui.doubleClapWindow.value), scanInterval: Number(ui.scanInterval.value), accent: ui.accent.value,
    voiceLanguage: ui.voiceLanguage.value, wakePhrases: normalizeWakePhrases(ui.wakePhrases.value), voiceVocabulary: normalizeVocabulary(ui.voiceVocabulary.value), recognitionConfidence: Number(ui.recognitionConfidence.value),
    commandSilenceMs: Number(ui.commandSilence.value), voiceAutoStart: ui.voiceAutoStart.checked, preferLocalRecognition: ui.preferLocalRecognition.checked, echoCancellation: ui.echoCancellation.checked,
    noiseSuppression: ui.noiseSuppression.checked, autoGainControl: ui.autoGainControl.checked, bargeIn: ui.bargeIn.checked,
    ttsVoice: ui.ttsVoice.value, ttsRate: Number(ui.ttsRate.value), ttsPitch: Number(ui.ttsPitch.value), ttsVolume: Number(ui.ttsVolume.value), wakeResponse: ui.wakeResponse.value.trim()
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
    ['source', ui.source], ['browserCamera', ui.browserCamera], ['browserMicrophone', ui.browserMicrophone], ['piCamera', ui.piCamera], ['piMicrophone', ui.piMicrophone],
    ['personThreshold', ui.personThreshold], ['micSensitivity', ui.micSensitivity], ['wakeSensitivity', ui.wakeSensitivity], ['clapSensitivity', ui.clapSensitivity],
    ['gestureSensitivity', ui.gestureSensitivity], ['doubleClapWindow', ui.doubleClapWindow], ['scanInterval', ui.scanInterval], ['accent', ui.accent],
    ['voiceLanguage', ui.voiceLanguage], ['recognitionConfidence', ui.recognitionConfidence], ['commandSilenceMs', ui.commandSilence],
    ['ttsVoice', ui.ttsVoice], ['ttsRate', ui.ttsRate], ['ttsPitch', ui.ttsPitch], ['ttsVolume', ui.ttsVolume], ['wakeResponse', ui.wakeResponse]
  ]) element.value = settings[key] ?? '';
  for (const [key, element] of [
    ['personDetection', ui.personDetection], ['voiceActivity', ui.voiceActivity], ['wakeWord', ui.wakeWord], ['doubleClap', ui.doubleClap],
    ['gestureControl', ui.gestureControl], ['autoSpeak', ui.autoSpeak], ['autoRepair', ui.autoRepair], ['voiceAutoStart', ui.voiceAutoStart], ['preferLocalRecognition', ui.preferLocalRecognition],
    ['echoCancellation', ui.echoCancellation], ['noiseSuppression', ui.noiseSuppression], ['autoGainControl', ui.autoGainControl], ['bargeIn', ui.bargeIn]
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
    return;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((item) => item.kind === 'videoinput');
  const microphones = devices.filter((item) => item.kind === 'audioinput');
  const draft = currentSettings();
  fillSelect(ui.browserCamera, cameras.map((item, index) => ({ id: item.deviceId, label: item.label || `Browser camera ${index + 1}` })), 'Default browser camera', draft.browserCamera);
  fillSelect(ui.browserMicrophone, microphones.map((item, index) => ({ id: item.deviceId, label: item.label || `Browser microphone ${index + 1}` })), 'Default browser microphone', draft.browserMicrophone);
  ui.browserDeviceCount.textContent = `${cameras.length} CAM / ${microphones.length} MIC`;
}

function loadSpeechVoices(selected = ui.ttsVoice.value) {
  if (!('speechSynthesis' in window)) { ui.ttsVoice.disabled = true; ui.testTalkback.disabled = true; return; }
  const voices = speechSynthesis.getVoices(); const items = voices.map((voice) => ({ id: voice.voiceURI, label: `${voice.name} // ${voice.lang}${voice.localService ? ' // LOCAL' : ''}` }));
  fillSelect(ui.ttsVoice, items, 'System default voice', selected);
}

async function refreshSpeechSupport() {
  const check = ++state.speechCheck;
  const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!RecognitionClass) {
    ui.speechSupport.textContent = 'AUDIO ONLY'; ui.speechSupport.classList.remove('active');
    ui.speechSupport.title = 'Speech recognition is unavailable in this browser.'; ui.installLocalSpeech.hidden = true; return;
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
  if (!RecognitionClass) { ui.voiceTranscript.textContent = 'NOT SUPPORTED'; ui.voiceConfidence.textContent = 'Use Chromium on the laptop or Pi.'; return; }
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
    ui.voiceTranscript.textContent = 'LISTENING…'; ui.voiceConfidence.textContent = `${mode === 'local' ? 'ON-DEVICE' : 'BROWSER PROVIDER'} // Say “Hey Jarvis, show system status”.`; ui.testRecognition.textContent = 'STOP TEST'; ui.testRecognition.classList.add('active');
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1]; const alternatives = Array.from({ length: result.length }, (_, index) => result[index]);
      const selected = selectRecognitionAlternative(alternatives, { wakePhrases: settings.wakePhrases, wakeSensitivity: settings.wakeSensitivity, recognitionConfidence: settings.recognitionConfidence, preferWake: settings.wakeWord });
      ui.voiceTranscript.textContent = selected.transcript || 'NO TRANSCRIPT';
      ui.voiceConfidence.textContent = `${mode === 'local' ? 'ON-DEVICE' : 'BROWSER'} // ${result.isFinal ? 'FINAL' : 'INTERIM'} // ${selected.confidenceKnown ? `${Math.round(selected.confidence * 100)}% CONFIDENCE` : 'CONFIDENCE UNAVAILABLE'} // ${selected.wake.detected ? 'WAKE MATCH' : 'NO WAKE MATCH'}`;
    };
    recognition.onerror = (event) => {
      ui.voiceTranscript.textContent = 'RECOGNITION ERROR';
      const message = event.error === 'network'
        ? 'Speech provider is offline. Install the on-device language pack below, then retry.'
        : event.error.replaceAll('-', ' ').toUpperCase();
      stopRecognitionTest(message);
    };
    recognition.onend = () => { if (state.testRecognition === recognition) stopRecognitionTest('Recognition test complete.'); };
    startRecognitionWithTrack(recognition, state.testRecognitionStream.getAudioTracks()[0]);
    state.testRecognitionTimer = setTimeout(() => stopRecognitionTest('Timed out after 12 seconds.'), 12_000);
  } catch (error) {
    ui.voiceTranscript.textContent = 'START FAILED'; stopRecognitionTest(friendlyMediaError(error));
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
  let connected = 0;
  ui.googleGrid.replaceChildren(...Object.entries(names).map(([key, [name, detail]]) => {
    const active = Boolean(status.connectors?.[key]);
    if (active) connected += 1;
    const item = document.createElement('div');
    item.className = `google-item ${active ? 'connected' : ''}`;
    item.innerHTML = `<i></i><span><b>${name}</b><small>${detail}</small></span><strong>${active ? 'LINKED' : 'OFFLINE'}</strong>`;
    return item;
  }));
  ui.googleState.textContent = `${connected}/6 LINKED`;
  ui.googleNote.textContent = status.scopesNote || ui.googleNote.textContent;
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
  clearTimeout(state.detectTimer);
  clearTimeout(state.piTimer);
  cancelAnimationFrame(state.animation);
  state.stream?.getTracks().forEach((track) => track.stop());
  void state.audioContext?.close();
  state.stream = null;
  state.audioContext = null;
  state.analyser = null;
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
    ui.personReadout.textContent = 'MODEL ERROR';
    setMessage(error.message);
  }
}

function monitorAudio() {
  if (!state.analyser) return;
  const samples = new Uint8Array(state.analyser.fftSize);
  state.analyser.getByteTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) { const value = (sample - 128) / 128; sum += value * value; }
  const level = Math.sqrt(sum / samples.length);
  const shown = Math.min(100, Math.round(level * 420));
  ui.micReadout.textContent = `${shown}%`;
  ui.micMeter.style.setProperty('--level', `${shown}%`);
  const settings = currentSettings();
  const now = performance.now();
  const voiceThreshold = Math.max(.012, state.noiseFloor * 2.8, settings.micSensitivity * .2);
  const voiceActive = level > voiceThreshold;
  if (!voiceActive) state.noiseFloor = state.noiseFloor * .985 + level * .015;
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
  await enumerateBrowserDevices();
  if (video) {
    ui.video.srcObject = state.stream;
    await ui.video.play();
    prepareCanvas(ui.video.videoWidth, ui.video.videoHeight);
    ui.placeholder.hidden = true;
    const loop = async () => {
      if (!state.stream) return;
      await drawDetections(ui.video);
      state.detectTimer = setTimeout(loop, Number(ui.scanInterval.value));
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
      } catch { ui.micReadout.textContent = 'BUSY'; }
    }
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
  if (event.target === ui.voiceLanguage || event.target === ui.preferLocalRecognition) void refreshSpeechSupport();
  if (state.sensorsActive && (event.target.matches('[data-sensor-source]') || event.target.name === 'source-card' || ['person-detection', 'voice-activity', 'wake-word', 'double-clap', 'gesture-control', 'echo-cancellation', 'noise-suppression', 'auto-gain-control'].includes(event.target.id))) {
    stopSensors({ quiet: true });
    setMessage('Sensor configuration changed. Calibration stopped safely; restart it to test the new profile.');
  } else if (state.dirty) setMessage('Unsaved changes are live in the preview. Save to apply them on the Pi.');
}

for (const button of $$('.settings-nav-list button')) button.addEventListener('click', () => activateSection(button.dataset.target));
ui.search.addEventListener('input', searchControls);
ui.refreshDevices.addEventListener('click', () => void loadDeviceLists());
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
ui.installLocalSpeech.addEventListener('click', () => void installLocalSpeechPack());
ui.testWake.addEventListener('click', async () => {
  try {
    await json('/api/wake/test', { method: 'POST' });
    ui.wakeReadout.textContent = 'TEST SENT';
    ui.wakeReadout.style.color = '#71ffca';
    setMessage('The main command screen received a simulated wake event.');
    setTimeout(() => { ui.wakeReadout.style.color = ''; }, 1400);
  } catch (error) { setMessage(`Wake test failed: ${error.message}`); }
});

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
  stopSensors({ quiet: true }); stopRecognitionTest(); window.speechSynthesis?.cancel?.();
  try { state.talkbackSource?.stop(); } catch {}
  void state.talkbackContext?.close?.();
  if (state.dirty) { event.preventDefault(); event.returnValue = ''; }
});

if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => loadSpeechVoices(ui.ttsVoice.value));

async function init() {
  try {
    await window.ensureDashboardAuthentication?.();
    const [settings, status, config] = await Promise.all([json('/api/settings'), json('/api/status'), json('/api/config')]);
    ui.version.textContent = config.version || '3.7.1';
    ui.node.textContent = config.piOnly ? 'PI-5' : 'LOCAL';
    state.config = config;
    if (config.ttsMode === 'fish') {
      ui.ttsProviderNote.textContent = config.fishConfigured
        ? `Locked: Fish Audio ${config.fishVoiceId} // ${config.fishModel}. Browser voice substitution is ${config.allowBrowserTtsFallback ? 'enabled' : 'disabled'}.`
        : `Fish Audio ${config.fishVoiceId} is selected, but FISH_AUDIO_API_KEY is not configured. JARVIS will stay silent instead of changing voices.`;
    }
    loadSpeechVoices(settings.ttsVoice || '');
    state.savedSettings = { ...settings };
    await loadDeviceLists(settings);
    renderGoogle(status.google || {});
    applySettings(settings, { saved: true, message: 'Configuration profile loaded. Live preview link is active.' });
    activateSection(location.hash.slice(1) || 'devices', { syncUrl: false });
    await refreshSpeechSupport();
    setStatus('READY', 'ready');
  } catch (error) {
    setStatus('LOAD ERROR', 'error');
    setMessage(`Settings could not initialize: ${error.message}`);
  }
}

void init();
