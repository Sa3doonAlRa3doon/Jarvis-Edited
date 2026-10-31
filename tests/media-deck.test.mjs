import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MediaDeck, parseMediaPrompt } from '../lib/media-deck.mjs';

async function tempFile() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-media-'));
  return { root, file: path.join(root, 'media.json') };
}

test('parses local media commands without treating normal prompts as playback', () => {
  assert.deepEqual(parseMediaPrompt('play lofi music'), { type: 'play', title: 'lofi music' });
  assert.deepEqual(parseMediaPrompt('queue a podcast about robotics'), { type: 'enqueue', title: 'podcast about robotics' });
  assert.deepEqual(parseMediaPrompt('pause music'), { type: 'pause' });
  assert.deepEqual(parseMediaPrompt('next track'), { type: 'next' });
  assert.deepEqual(parseMediaPrompt('show my music queue'), { type: 'state' });
  assert.equal(parseMediaPrompt('play the next game'), null);
});

test('persists a bounded local queue and advances history without external playback', async () => {
  const { file } = await tempFile();
  const events = [];
  const deck = new MediaDeck(file, { onEvent: async (event) => events.push(event) });
  await deck.init();
  const queued = await deck.enqueue({ title: 'Focus signal', artist: 'JARVIS', durationSeconds: 12 });
  assert.equal(queued.item.source, 'local-stage');
  await deck.play(queued.item.id);
  assert.equal(deck.snapshot().current.status, 'playing');
  await deck.pause();
  assert.equal(deck.snapshot().current.status, 'paused');
  await deck.resume();
  await deck.stop();
  const snapshot = deck.snapshot();
  assert.equal(snapshot.externalConnected, false);
  assert.equal(snapshot.mode, 'local-stage');
  assert.equal(snapshot.current, null);
  assert.equal(snapshot.history.length, 1);
  assert.ok(events.length >= 3);

  const reloaded = new MediaDeck(file);
  await reloaded.init();
  assert.equal(reloaded.snapshot().history[0].title, 'Focus signal');
});

test('next starts the queued item and clear preserves the current item', async () => {
  const { file } = await tempFile();
  const deck = new MediaDeck(file);
  await deck.init();
  const first = await deck.enqueue({ title: 'First track' });
  await deck.enqueue({ title: 'Second track' });
  await deck.play(first.item.id);
  const next = await deck.next();
  assert.equal(next.current.title, 'Second track');
  await deck.clear();
  assert.equal(deck.snapshot().current.title, 'Second track');
  assert.equal(deck.snapshot().queue.length, 0);
});

test('a spoken play title stages and starts the requested item', async () => {
  const { file } = await tempFile();
  const deck = new MediaDeck(file);
  await deck.init();
  const request = parseMediaPrompt('play lofi music');
  const result = await deck.applyAction(request);
  assert.equal(result.current.title, 'lofi music');
  assert.equal(result.current.status, 'playing');
  await deck.stop();
});

