import test from 'node:test';
import assert from 'node:assert/strict';
import { buildObsOverlaySnapshot, normalizeOverlayTheme } from '../lib/obs-overlay.mjs';

test('normalizes the bounded OBS overlay themes', () => {
  assert.equal(normalizeOverlayTheme('neon'), 'neon');
  assert.equal(normalizeOverlayTheme('unknown'), 'jarvis');
  assert.equal(normalizeOverlayTheme(''), 'jarvis');
});

test('builds a safe read-only OBS overlay snapshot', () => {
  const snapshot = buildObsOverlaySnapshot({
    online: true, configured: true,
    scenes: { current: 'Live', preview: 'BRB' },
    streaming: { active: true, timecode: '00:03:12', health: { status: 'warning', droppedPercent: .01, congestion: .02 } },
    recording: { active: true, paused: false, timecode: '00:02:10' },
    replayBuffer: { active: true }, virtualCamera: { active: false }, studioMode: { enabled: true }
  }, { events: [
    { type: 'control', message: 'OBS scene changed', at: '2026-10-29T10:00:00.000Z', detail: { password: 'never expose' } },
    { type: 'health', message: 'Core service state changed', at: '2026-10-29T09:59:00.000Z' }
  ] }, { theme: 'neon', now: new Date('2026-10-29T10:01:00.000Z') });
  assert.equal(snapshot.theme, 'neon'); assert.equal(snapshot.online, true); assert.equal(snapshot.scene, 'Live');
  assert.equal(snapshot.stream.health, 'warning'); assert.equal(snapshot.stream.droppedPercent, 1); assert.equal(snapshot.stream.congestion, 2);
  assert.equal(snapshot.recording.active, true); assert.equal(snapshot.replayBuffer, true); assert.equal(snapshot.studioMode, true);
  assert.equal(snapshot.activity.length, 2); assert.equal(snapshot.activity[0].type, 'CONTROL');
  assert.doesNotMatch(JSON.stringify(snapshot), /never expose/);
});

