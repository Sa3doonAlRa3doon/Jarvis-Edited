const OVERLAY_EVENT_LIMIT = 5;

function clean(value, limit = 180) {
  return String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function bool(value) { return Boolean(value); }

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeOverlayTheme(value = '') {
  const theme = clean(value, 30).toLowerCase();
  return ['jarvis', 'minimal', 'neon'].includes(theme) ? theme : 'jarvis';
}

export function buildObsOverlaySnapshot(snapshot = {}, eventSnapshot = {}, { theme = 'jarvis', now = new Date() } = {}) {
  const streaming = snapshot.streaming || {};
  const recording = snapshot.recording || {};
  const health = clean(streaming.health?.status || (streaming.active ? 'good' : 'idle'), 20).toLowerCase();
  const events = Array.isArray(eventSnapshot?.events) ? eventSnapshot.events : [];
  const activity = events.slice(0, OVERLAY_EVENT_LIMIT).map((event) => ({
    type: clean(event?.type || 'system', 30).toUpperCase(),
    message: clean(event?.message || '', 180),
    at: typeof event?.at === 'string' ? event.at : null
  })).filter((event) => event.message);
  return {
    generatedAt: now instanceof Date ? now.toISOString() : new Date().toISOString(),
    theme: normalizeOverlayTheme(theme),
    online: bool(snapshot.online),
    configured: bool(snapshot.configured),
    scene: clean(snapshot.scenes?.current || 'NO SCENE', 120),
    previewScene: clean(snapshot.scenes?.preview || '', 120),
    stream: {
      active: bool(streaming.active),
      reconnecting: bool(streaming.reconnecting),
      timecode: clean(streaming.timecode || '', 60),
      health,
      droppedPercent: Math.max(0, Math.min(100, number(streaming.health?.droppedPercent) * 100)),
      congestion: Math.max(0, Math.min(100, number(streaming.health?.congestion) * 100))
    },
    recording: { active: bool(recording.active), paused: bool(recording.paused), timecode: clean(recording.timecode || '', 60) },
    replayBuffer: bool(snapshot.replayBuffer?.active),
    virtualCamera: bool(snapshot.virtualCamera?.active),
    studioMode: bool(snapshot.studioMode?.enabled),
    activity
  };
}

