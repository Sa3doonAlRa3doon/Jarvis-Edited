const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const theme = params.get('theme') || 'jarvis';
const ui = {
  root: document.body, liveState: document.querySelector('.live-state'), liveDot: document.querySelector('#overlay-live-dot'), live: document.querySelector('#overlay-live'),
  scene: document.querySelector('#overlay-scene'), preview: document.querySelector('#overlay-preview'), stream: document.querySelector('#overlay-stream'), health: document.querySelector('#overlay-health'),
  record: document.querySelector('#overlay-record'), recordTime: document.querySelector('#overlay-record-time'), replay: document.querySelector('#overlay-replay'), camera: document.querySelector('#overlay-camera'),
  updated: document.querySelector('#overlay-updated'), activity: document.querySelector('#overlay-activity'), error: document.querySelector('#overlay-error')
};
ui.root.dataset.theme = theme;
function text(element, value) { if (element) element.textContent = String(value ?? '—'); }
function time(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour12: false }) : '—'; }
function render(payload) {
  const online = Boolean(payload?.online); const stream = payload?.stream || {}; const recording = payload?.recording || {};
  ui.liveState?.classList.toggle('live', online && Boolean(stream.active));
  text(ui.live, online ? (stream.active ? 'LIVE' : 'READY') : payload?.configured ? 'OFFLINE' : 'NOT CONFIGURED');
  text(ui.scene, payload?.scene || 'NO SCENE');
  if (payload?.previewScene) { ui.preview.hidden = false; text(ui.preview, `PREVIEW // ${payload.previewScene}`); } else ui.preview.hidden = true;
  text(ui.stream, stream.active ? (stream.timecode || 'LIVE') : 'IDLE'); text(ui.health, String(stream.health || 'idle').toUpperCase());
  ui.health.className = String(stream.health || 'idle').toLowerCase();
  text(ui.record, recording.active ? (recording.paused ? 'PAUSED' : 'REC') : 'OFF'); text(ui.recordTime, recording.timecode || '—');
  text(ui.replay, payload?.replayBuffer ? 'READY' : 'OFF'); text(ui.camera, payload?.virtualCamera ? 'V-CAM ON' : 'V-CAM OFF');
  text(ui.updated, `UPDATED ${time(payload?.generatedAt)}`);
  const event = Array.isArray(payload?.activity) ? payload.activity[0] : null;
  text(ui.activity, event ? `${event.type} // ${event.message}` : 'NO RECENT ACTIVITY');
  ui.error.hidden = true;
}
async function refresh() {
  if (!token) { ui.error.hidden = false; return; }
  try {
    const response = await fetch(`/api/obs/overlay/status?token=${encodeURIComponent(token)}&theme=${encodeURIComponent(theme)}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    render(payload);
  } catch { ui.error.hidden = false; }
}
void refresh(); setInterval(refresh, 1800);
