const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const form = $('#settings-form');

const ui = {
  status: $('#settings-status'), message: $('#settings-message'), profile: $('#settings-profile'), version: $('#settings-version'), node: $('#settings-node'),
  source: $('#source'), sourceBrowser: $('#source-browser'), sourcePi: $('#source-pi'), browserCamera: $('#browser-camera'), browserMicrophone: $('#browser-microphone'), piCamera: $('#pi-camera'), piMicrophone: $('#pi-microphone'),
  browserDeviceCount: $('#browser-device-count'), piDeviceCount: $('#pi-device-count'), refreshDevices: $('#refresh-devices'),
  personDetection: $('#person-detection'), voiceActivity: $('#voice-activity'), wakeWord: $('#wake-word'), doubleClap: $('#double-clap'), gestureControl: $('#gesture-control'), autoSpeak: $('#auto-speak'), autoRepair: $('#auto-repair'),
  personThreshold: $('#person-threshold'), micSensitivity: $('#mic-sensitivity'), wakeSensitivity: $('#wake-sensitivity'), clapSensitivity: $('#clap-sensitivity'), gestureSensitivity: $('#gesture-sensitivity'), doubleClapWindow: $('#double-clap-window'), scanInterval: $('#scan-interval'), accent: $('#accent'),
  cameraPreview: $('#camera-preview'), video: $('#camera-video'), image: $('#pi-camera-image'), canvas: $('#sensor-canvas'), placeholder: $('#camera-placeholder'), cameraSource: $('#camera-source'),
  personReadout: $('#person-readout'), micReadout: $('#mic-readout'), micMeter: $('#mic-meter'), wakeReadout: $('#wake-readout'), sensorState: $('#sensor-state'), sensorGuidance: $('#sensor-guidance'),
  start: $('#start-sensors'), stop: $('#stop-sensors'), testWake: $('#test-wake'), googleGrid: $('#google-grid'), googleNote: $('#google-note'), googleState: $('#google-state'),
  preview: $('#live-preview'), previewViewport: $('#preview-viewport'), previewResolution: $('#preview-resolution'), reloadPreview: $('#reload-preview'), openPreview: $('#open-preview'),
  search: $('#settings-search'), workspace: $('#settings-workspace'), searchEmpty: $('#search-empty'), save: $('#save-settings'), revert: $('#revert-settings'), recommended: $('#recommended-settings'), dirtyDot: $('#dirty-dot'), saveStateTitle: $('#save-state-title')
};

const recommendedProfile = {
  personDetection: true, voiceActivity: true, wakeWord: true, doubleClap: true, gestureControl: true, autoSpeak: true,
  personThreshold: 0.55, micSensitivity: 0.18, wakeSensitivity: 0.55, clapSensitivity: 0.34,
  gestureSensitivity: 0.42, doubleClapWindow: 700, scanInterval: 900, accent: '#64e8ff'
};

const state = {
  savedSettings: {}, currentSection: 'devices', media: null, stream: null, audioContext: null, analyser: null,
  animation: 0, detector: null, detectTimer: 0, piTimer: 0, lastClap: 0, clapAbove: false, sensorsActive: false, dirty: false
};

const valueBindings = [
  ['personThreshold', 'person-threshold-output', (value) => `${Math.round(value * 100)}%`],
  ['micSensitivity', 'mic-sensitivity-output', (value) => `${Math.round(value * 100)}%`],
  ['wakeSensitivity', 'wake-sensitivity-output', (value) => `${Math.round(value * 100)}%`],
  ['clapSensitivity', 'clap-sensitivity-output', (value) => `${Math.round(value * 100)}%`],
  ['gestureSensitivity', 'gesture-sensitivity-output', (value) => `${Math.round(value * 100)}%`],
  ['doubleClapWindow', 'double-clap-window-output', (value) => `${value} ms`],
  ['scanInterval', 'scan-interval-output', (value) => `${value} ms`]
];

async function json(url, options) {
  const response = await fetch(url, options);
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
  select.replaceChildren(option('', placeholder));
  for (const item of items) select.append(option(item.id || item.deviceId, item.label || item.id || item.deviceId));
  if (selected && ![...select.options].some((item) => item.value === selected)) select.append(option(selected, `Saved device (currently unavailable): ${selected}`));
  select.value = selected || '';
}

function currentSettings() {
  return {
    source: ui.source.value, browserCamera: ui.browserCamera.value, browserMicrophone: ui.browserMicrophone.value,
    piCamera: ui.piCamera.value, piMicrophone: ui.piMicrophone.value,
    personDetection: ui.personDetection.checked, voiceActivity: ui.voiceActivity.checked, wakeWord: ui.wakeWord.checked,
    doubleClap: ui.doubleClap.checked, gestureControl: ui.gestureControl.checked, autoSpeak: ui.autoSpeak.checked, autoRepair: ui.autoRepair.checked,
    personThreshold: Number(ui.personThreshold.value), micSensitivity: Number(ui.micSensitivity.value),
    wakeSensitivity: Number(ui.wakeSensitivity.value), clapSensitivity: Number(ui.clapSensitivity.value), gestureSensitivity: Number(ui.gestureSensitivity.value),
    doubleClapWindow: Number(ui.doubleClapWindow.value), scanInterval: Number(ui.scanInterval.value), accent: ui.accent.value
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
  for (const [key, element] of [
    ['source', ui.source], ['browserCamera', ui.browserCamera], ['browserMicrophone', ui.browserMicrophone], ['piCamera', ui.piCamera], ['piMicrophone', ui.piMicrophone],
    ['personThreshold', ui.personThreshold], ['micSensitivity', ui.micSensitivity], ['wakeSensitivity', ui.wakeSensitivity], ['clapSensitivity', ui.clapSensitivity],
    ['gestureSensitivity', ui.gestureSensitivity], ['doubleClapWindow', ui.doubleClapWindow], ['scanInterval', ui.scanInterval], ['accent', ui.accent]
  ]) element.value = settings[key] ?? '';
  for (const [key, element] of [
    ['personDetection', ui.personDetection], ['voiceActivity', ui.voiceActivity], ['wakeWord', ui.wakeWord], ['doubleClap', ui.doubleClap],
    ['gestureControl', ui.gestureControl], ['autoSpeak', ui.autoSpeak], ['autoRepair', ui.autoRepair]
  ]) element.checked = Boolean(settings[key]);
  if (saved) state.savedSettings = { ...settings };
  updateOutputs();
  updateDirty();
  previewSettings();
  if (message) setMessage(message);
}

function activateSection(name) {
  state.currentSection = name;
  ui.search.value = '';
  ui.workspace.classList.remove('is-searching');
  for (const section of $$('.settings-section')) { section.hidden = false; section.classList.toggle('active', section.dataset.section === name); }
  for (const button of $$('.settings-nav-list button')) button.classList.toggle('active', button.dataset.target === name);
  ui.searchEmpty.hidden = true;
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
  const shown = Math.min(100, Math.round(level * 250));
  ui.micReadout.textContent = `${shown}%`;
  ui.micMeter.style.setProperty('--level', `${shown}%`);
  const settings = currentSettings();
  const now = performance.now();
  if (settings.doubleClap && level > settings.clapSensitivity && !state.clapAbove) {
    state.clapAbove = true;
    if (state.lastClap && now - state.lastClap <= settings.doubleClapWindow) {
      ui.wakeReadout.textContent = 'DOUBLE CLAP'; ui.wakeReadout.style.color = '#71ffca'; state.lastClap = 0;
      setTimeout(() => { ui.wakeReadout.style.color = ''; }, 1400);
    } else state.lastClap = now;
  }
  if (level < settings.clapSensitivity * .55) state.clapAbove = false;
  if (state.lastClap && now - state.lastClap > settings.doubleClapWindow) state.lastClap = 0;
  state.animation = requestAnimationFrame(monitorAudio);
}

async function startBrowserSensors() {
  const settings = currentSettings();
  const needsVideo = settings.personDetection || settings.gestureControl;
  const needsAudio = settings.voiceActivity || settings.wakeWord || settings.doubleClap;
  if (!needsVideo && !needsAudio) throw new Error('Enable at least one camera or microphone listener in Perception.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not expose camera or microphone access.');
  const video = needsVideo ? { deviceId: settings.browserCamera ? { exact: settings.browserCamera } : undefined } : false;
  const audio = needsAudio ? { deviceId: settings.browserMicrophone ? { exact: settings.browserMicrophone } : undefined, echoCancellation: true, noiseSuppression: true } : false;
  state.stream = await navigator.mediaDevices.getUserMedia({ video, audio });
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
    state.audioContext = new AudioContext();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 1024;
    state.audioContext.createMediaStreamSource(state.stream).connect(state.analyser);
    monitorAudio();
  }
  ui.wakeReadout.textContent = settings.doubleClap ? 'CLAP LISTENER' : settings.wakeWord ? 'PI WAKE PROFILE' : 'SENSORS ON';
  setSensorUi(true, 'BROWSER SENSOR BUS');
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
    setMessage(`Could not start sensors: ${error.message}`);
  }
}

function onFormInput(event) {
  if (event.target === ui.sourceBrowser || event.target === ui.sourcePi) ui.source.value = event.target.value;
  updateOutputs();
  updateDirty();
  previewSettings();
  if (state.sensorsActive && (event.target.matches('[data-sensor-source]') || event.target.name === 'source-card' || ['person-detection', 'voice-activity', 'wake-word', 'double-clap', 'gesture-control'].includes(event.target.id))) {
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

window.addEventListener('beforeunload', (event) => {
  stopSensors({ quiet: true });
  if (state.dirty) { event.preventDefault(); event.returnValue = ''; }
});

async function init() {
  try {
    await window.ensureDashboardAuthentication?.();
    const [settings, status, config] = await Promise.all([json('/api/settings'), json('/api/status'), json('/api/config')]);
    ui.version.textContent = config.version || '2.5.0';
    ui.node.textContent = config.piOnly ? 'PI-5' : 'LOCAL';
    state.savedSettings = { ...settings };
    await loadDeviceLists(settings);
    renderGoogle(status.google || {});
    applySettings(settings, { saved: true, message: 'Configuration profile loaded. Live preview link is active.' });
    setStatus('READY', 'ready');
  } catch (error) {
    setStatus('LOAD ERROR', 'error');
    setMessage(`Settings could not initialize: ${error.message}`);
  }
}

void init();

