const $ = (selector) => document.querySelector(selector);
const form = $('#settings-form');
const ui = {
  status: $('#settings-status'), message: $('#settings-message'), source: $('#source'),
  browserCamera: $('#browser-camera'), browserMicrophone: $('#browser-microphone'), piCamera: $('#pi-camera'), piMicrophone: $('#pi-microphone'),
  personDetection: $('#person-detection'), voiceActivity: $('#voice-activity'), wakeWord: $('#wake-word'), doubleClap: $('#double-clap'), gestureControl: $('#gesture-control'), autoSpeak: $('#auto-speak'), autoRepair: $('#auto-repair'),
  personThreshold: $('#person-threshold'), micSensitivity: $('#mic-sensitivity'), wakeSensitivity: $('#wake-sensitivity'), clapSensitivity: $('#clap-sensitivity'), gestureSensitivity: $('#gesture-sensitivity'), doubleClapWindow: $('#double-clap-window'), scanInterval: $('#scan-interval'), accent: $('#accent'),
  cameraPreview: $('#camera-preview'), video: $('#camera-video'), image: $('#pi-camera-image'), canvas: $('#sensor-canvas'), placeholder: $('#camera-placeholder'),
  personReadout: $('#person-readout'), micReadout: $('#mic-readout'), wakeReadout: $('#wake-readout'),
  start: $('#start-sensors'), stop: $('#stop-sensors'), testWake: $('#test-wake'), googleGrid: $('#google-grid'), googleNote: $('#google-note'), preview: $('#live-preview')
};

const state = { settings: {}, media: null, stream: null, audioContext: null, analyser: null, animation: 0, detector: null, detectTimer: 0, piTimer: 0, lastClap: 0, clapAbove: false };
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
  const response = await fetch(url, options); const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`); return payload;
}
function option(value, label) { const item = document.createElement('option'); item.value = value; item.textContent = label; return item; }
function fillSelect(select, items, placeholder, selected) {
  select.replaceChildren(option('', placeholder));
  for (const item of items) select.append(option(item.id || item.deviceId, item.label || item.id || item.deviceId));
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
function applySettings(settings) {
  state.settings = settings;
  for (const [key, element] of [['source', ui.source], ['browserCamera', ui.browserCamera], ['browserMicrophone', ui.browserMicrophone], ['piCamera', ui.piCamera], ['piMicrophone', ui.piMicrophone], ['personThreshold', ui.personThreshold], ['micSensitivity', ui.micSensitivity], ['wakeSensitivity', ui.wakeSensitivity], ['clapSensitivity', ui.clapSensitivity], ['gestureSensitivity', ui.gestureSensitivity], ['doubleClapWindow', ui.doubleClapWindow], ['scanInterval', ui.scanInterval], ['accent', ui.accent]]) element.value = settings[key] ?? '';
  for (const [key, element] of [['personDetection', ui.personDetection], ['voiceActivity', ui.voiceActivity], ['wakeWord', ui.wakeWord], ['doubleClap', ui.doubleClap], ['gestureControl', ui.gestureControl], ['autoSpeak', ui.autoSpeak], ['autoRepair', ui.autoRepair]]) element.checked = Boolean(settings[key]);
  updateOutputs(); previewSettings();
}
function updateOutputs() {
  for (const [key, outputId, format] of valueBindings) $(`#${outputId}`).value = format(Number(ui[key].value));
  document.documentElement.style.setProperty('--accent', ui.accent.value);
}
function previewSettings() {
  const settings = currentSettings(); state.settings = settings; ui.preview.contentWindow?.postMessage({ type: 'jarvis-settings-preview', settings }, location.origin);
}
async function enumerateBrowserDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  fillSelect(ui.browserCamera, devices.filter((item) => item.kind === 'videoinput').map((item, index) => ({ id: item.deviceId, label: item.label || `Browser camera ${index + 1}` })), 'Default browser camera', state.settings.browserCamera);
  fillSelect(ui.browserMicrophone, devices.filter((item) => item.kind === 'audioinput').map((item, index) => ({ id: item.deviceId, label: item.label || `Browser microphone ${index + 1}` })), 'Default browser microphone', state.settings.browserMicrophone);
}
async function loadDeviceLists() {
  state.media = await json('/api/media/devices');
  fillSelect(ui.piCamera, state.media.cameras || [], 'Select /dev/video*', state.settings.piCamera);
  fillSelect(ui.piMicrophone, state.media.microphones || [], 'Select plughw device', state.settings.piMicrophone);
  await enumerateBrowserDevices();
}
function renderGoogle(status) {
  const names = { gdrive: 'Drive', gmail: 'Gmail', gmail_imap: 'Gmail IMAP', gcalendar: 'Calendar', gtasks: 'Tasks', gcontacts: 'Contacts' };
  ui.googleGrid.innerHTML = Object.entries(names).map(([key, name]) => `<div class="google-item ${status.connectors?.[key] ? 'connected' : ''}">${name}<br>${status.connectors?.[key] ? 'CONNECTED' : 'NOT CONNECTED'}</div>`).join('');
  ui.googleNote.textContent = status.scopesNote || ui.googleNote.textContent;
}

async function loadDetector() {
  if (state.detector || !window.cocoSsd) return state.detector;
  ui.personReadout.textContent = 'LOADING MODEL';
  state.detector = await window.cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: '/models/coco-ssd/model.json' });
  return state.detector;
}
function stopSensors() {
  clearTimeout(state.detectTimer); clearInterval(state.piTimer); cancelAnimationFrame(state.animation);
  state.stream?.getTracks().forEach((track) => track.stop()); state.audioContext?.close();
  state.stream = null; state.audioContext = null; state.analyser = null; ui.video.srcObject = null; ui.image.hidden = true; ui.canvas.getContext('2d').clearRect(0, 0, ui.canvas.width, ui.canvas.height);
  ui.placeholder.hidden = false; ui.personReadout.textContent = 'STANDBY'; ui.micReadout.textContent = '0%'; ui.wakeReadout.textContent = 'STANDBY';
}
function prepareCanvas(width, height) { ui.canvas.width = width || 960; ui.canvas.height = height || 540; ui.canvas.style.display = 'block'; }
async function drawDetections(source) {
  if (!state.settings.personDetection) return;
  try {
    const detector = await loadDetector(); const predictions = await detector.detect(source); const people = predictions.filter((item) => item.class === 'person' && item.score >= state.settings.personThreshold);
    const context = ui.canvas.getContext('2d'); context.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
    for (const person of people) { const [x, y, width, height] = person.bbox; context.strokeStyle = '#71ffca'; context.lineWidth = 3; context.strokeRect(x, y, width, height); context.fillStyle = 'rgba(2,8,12,.82)'; context.fillRect(x, Math.max(0, y - 22), 122, 20); context.fillStyle = '#71ffca'; context.font = '12px monospace'; context.fillText(`PERSON ${Math.round(person.score * 100)}%`, x + 5, Math.max(14, y - 7)); }
    ui.personReadout.textContent = people.length ? `OK // ${people.length}` : 'NO PERSON'; ui.personReadout.style.color = people.length ? '#71ffca' : '';
  } catch (error) { ui.personReadout.textContent = 'MODEL ERROR'; ui.message.textContent = error.message; }
}
function monitorAudio() {
  if (!state.analyser) return;
  const samples = new Uint8Array(state.analyser.fftSize); state.analyser.getByteTimeDomainData(samples); let sum = 0;
  for (const sample of samples) { const value = (sample - 128) / 128; sum += value * value; }
  const level = Math.sqrt(sum / samples.length); ui.micReadout.textContent = `${Math.min(100, Math.round(level * 250))}%`;
  const now = performance.now(); const clapThreshold = state.settings.clapSensitivity;
  if (state.settings.doubleClap && level > clapThreshold && !state.clapAbove) {
    state.clapAbove = true;
    if (state.lastClap && now - state.lastClap <= state.settings.doubleClapWindow) { ui.wakeReadout.textContent = 'DOUBLE CLAP'; ui.wakeReadout.style.color = '#71ffca'; state.lastClap = 0; setTimeout(() => { ui.wakeReadout.style.color = ''; }, 1400); }
    else state.lastClap = now;
  }
  if (level < clapThreshold * .55) state.clapAbove = false;
  if (state.lastClap && now - state.lastClap > state.settings.doubleClapWindow) state.lastClap = 0;
  state.animation = requestAnimationFrame(monitorAudio);
}
async function startBrowserSensors() {
  const settings = currentSettings(); const video = settings.personDetection ? { deviceId: settings.browserCamera ? { exact: settings.browserCamera } : undefined } : false;
  const audio = settings.voiceActivity || settings.doubleClap ? { deviceId: settings.browserMicrophone ? { exact: settings.browserMicrophone } : undefined, echoCancellation: true, noiseSuppression: true } : false;
  state.stream = await navigator.mediaDevices.getUserMedia({ video, audio }); await enumerateBrowserDevices();
  if (video) { ui.video.srcObject = state.stream; await ui.video.play(); prepareCanvas(ui.video.videoWidth, ui.video.videoHeight); ui.placeholder.hidden = true; const loop = async () => { if (!state.stream) return; await drawDetections(ui.video); state.detectTimer = setTimeout(loop, state.settings.scanInterval); }; void loop(); }
  if (audio) { state.audioContext = new AudioContext(); state.analyser = state.audioContext.createAnalyser(); state.analyser.fftSize = 1024; state.audioContext.createMediaStreamSource(state.stream).connect(state.analyser); monitorAudio(); }
  ui.wakeReadout.textContent = settings.doubleClap ? 'CLAP LISTENER' : 'SENSORS ON';
}
async function startPiSensors() {
  if (state.settings.personDetection && !state.settings.piCamera) throw new Error('Select one Raspberry Pi camera first.');
  if ((state.settings.voiceActivity || state.settings.wakeWord || state.settings.doubleClap) && !state.settings.piMicrophone) throw new Error('Select one Raspberry Pi microphone first.');
  ui.video.srcObject = null; ui.image.hidden = !state.settings.piCamera; ui.placeholder.hidden = Boolean(state.settings.piCamera); prepareCanvas(960, 540);
  const poll = async () => {
    if (state.settings.piCamera) { ui.image.src = `/api/media/pi-camera/frame.jpg?device=${encodeURIComponent(state.settings.piCamera)}&t=${Date.now()}`; await new Promise((resolve) => { ui.image.onload = resolve; ui.image.onerror = resolve; }); if (ui.image.naturalWidth) { prepareCanvas(ui.image.naturalWidth, ui.image.naturalHeight); await drawDetections(ui.image); } }
    if (state.settings.piMicrophone) { try { const sample = await json(`/api/media/pi-microphone/level?device=${encodeURIComponent(state.settings.piMicrophone)}`); ui.micReadout.textContent = `${Math.round(sample.level * 100)}%`; } catch { ui.micReadout.textContent = 'BUSY'; } }
  };
  await poll(); state.piTimer = setInterval(() => void poll(), Math.max(1200, state.settings.scanInterval)); const wake = await json('/api/wake/status'); ui.wakeReadout.textContent = wake.ready ? 'HEY JARVIS READY' : wake.running ? 'STARTING' : 'SAVE TO START';
}
async function startSensors() {
  stopSensors(); state.settings = currentSettings(); ui.message.textContent = 'Starting selected devices…';
  try { if (state.settings.source === 'pi') await startPiSensors(); else await startBrowserSensors(); ui.message.textContent = 'Sensors active. Only the selected devices are open.'; }
  catch (error) { stopSensors(); ui.message.textContent = error.message; }
}

form.addEventListener('input', () => { updateOutputs(); previewSettings(); });
form.addEventListener('submit', async (event) => {
  event.preventDefault(); ui.status.textContent = 'SAVING';
  try { const saved = await json('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentSettings()) }); applySettings(saved); ui.status.textContent = 'SAVED'; ui.message.textContent = 'Saved on the Pi. Wake listener restarted if required.'; }
  catch (error) { ui.status.textContent = 'ERROR'; ui.message.textContent = error.message; }
});
ui.start.addEventListener('click', () => void startSensors()); ui.stop.addEventListener('click', stopSensors);
ui.testWake.addEventListener('click', async () => { try { await json('/api/wake/test', { method: 'POST' }); ui.wakeReadout.textContent = 'TEST SENT'; ui.message.textContent = 'The main screen received a simulated wake event.'; } catch (error) { ui.message.textContent = error.message; } });
window.addEventListener('beforeunload', stopSensors);

async function init() {
  try {
    await window.ensureDashboardAuthentication?.();
    const [settings, status] = await Promise.all([json('/api/settings'), json('/api/status')]); state.settings = settings;
    await loadDeviceLists(); applySettings(settings); renderGoogle(status.google || {}); ui.status.textContent = 'READY';
  } catch (error) { ui.status.textContent = 'ERROR'; ui.message.textContent = error.message; }
}
void init();
