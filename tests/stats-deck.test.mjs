import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStatsDeck, summarizeStatsDeck, summarizeVoiceDiagnostics } from '../lib/stats-deck.mjs';

test('normalizes local OBS, media, desktop, automation, and agent state', () => {
  const deck = buildStatsDeck({
    obs: { online: true, configured: true, scene: 'Main', streaming: true, recording: false, streamHealth: 'good', streamDroppedPercent: 0.01 },
    broadcast: { activities: { timers: [{}], polls: [{}, {}], giveaways: [] }, chat: { commands: [{}], readAloud: [{ status: 'pending' }] } },
    media: { current: { title: 'Ambient focus' }, queue: [{}], history: [{}, {}] },
    desktop: { apps: [{ id: 'chrome' }], platform: 'win32' },
    voice: { configured: true, running: true, ready: true, diagnostics: { source: 'pi', physicalGate: true, signalToNoiseDb: 18.25, micLevel: 0.2 }, lastEvent: { kind: 'wake' } },
    agents: { routes: 10, pipeline: 'READY' }
  });
  assert.equal(deck.obs.state, 'ready');
  assert.equal(deck.obs.scene, 'Main');
  assert.equal(deck.music.nowPlaying, 'Ambient focus');
  assert.equal(deck.desktop.count, 1);
  assert.equal(deck.automation.timers, 1);
  assert.equal(deck.automation.pendingReadAloud, 1);
  assert.equal(deck.agents.routes, 10);
  assert.equal(deck.voice.state, 'armed');
  assert.equal(deck.voice.gate, 'open');
  assert.equal(deck.voice.snrDb, 18.25);
  assert.equal(deck.voice.lastEvent, 'wake');
});

test('never fabricates external stats and says what is unavailable', () => {
  const deck = buildStatsDeck({});
  assert.equal(deck.twitch.connected, false);
  assert.equal(deck.twitch.viewers, null);
  assert.equal(deck.socials.connected, false);
  assert.equal(deck.voice.state, 'browser');
  assert.equal(deck.voice.source, 'browser');
  const summary = summarizeStatsDeck(deck);
  assert.match(summary, /not connected/i);
  assert.match(summary, /no external write occurred/i);
});

test('summarizes local voice diagnostics without exposing raw audio or identifiers', () => {
  const summary = summarizeVoiceDiagnostics({ state: 'armed', source: 'pi', gate: 'open', snrDb: 21.4, micLevel: 0.25, lastEvent: 'wake' });
  assert.match(summary, /ARMED/);
  assert.match(summary, /SNR 21\.4 dB/);
  assert.match(summary, /Last event wake/);
  assert.doesNotMatch(summary, /device|token|audio data/i);
});

