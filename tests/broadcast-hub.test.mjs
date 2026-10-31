import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BroadcastHub, parseBroadcastPrompt } from '../lib/broadcast-hub.mjs';

async function store() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-broadcast-'));
  const events = [];
  const hub = new BroadcastHub(path.join(root, 'broadcast.json'), { onEvent: async (event) => events.push(event) });
  await hub.init();
  return { hub, events, root };
}

test('parses safe local broadcast voice prompts', () => {
  assert.deepEqual(parseBroadcastPrompt('start a timer 5 minutes called break'), { type: 'timer_create', name: 'break', durationSeconds: 300 });
  assert.deepEqual(parseBroadcastPrompt('create a poll: tea | coffee | water'), { type: 'poll_create', question: 'tea', options: ['coffee', 'water'] });
  assert.deepEqual(parseBroadcastPrompt('read this aloud: welcome everyone'), { type: 'read_aloud_enqueue', text: 'welcome everyone' });
  assert.equal(parseBroadcastPrompt('send a message to chat'), null);
});

test('persists timers, polls, giveaways, replies, commands, and read-aloud locally', async () => {
  const { hub, events, root } = await store();
  const timer = await hub.applyAction({ type: 'timer_create', name: 'Focus', durationSeconds: 30 });
  const poll = await hub.applyAction({ type: 'poll_create', question: 'Mode?', options: ['Build', 'Play'], durationSeconds: 60 });
  await hub.applyAction({ type: 'poll_vote', id: poll.poll.id, voterId: 'viewer-1', option: 1 });
  const giveaway = await hub.applyAction({ type: 'giveaway_create', name: 'Sticker', keyword: 'jarvis', durationSeconds: 60 });
  await hub.applyAction({ type: 'giveaway_enter', id: giveaway.giveaway.id, entry: 'viewer-1' });
  const drawn = await hub.applyAction({ type: 'giveaway_draw', id: giveaway.giveaway.id });
  await hub.applyAction({ type: 'saved_create', label: 'welcome', text: 'Welcome to the stream.' });
  await hub.applyAction({ type: 'command_create', trigger: 'hello', response: 'Hello there.', cooldownSeconds: 5 });
  await hub.applyAction({ type: 'read_aloud_enqueue', text: 'New viewer joined.' });
  const snapshot = hub.snapshot();
  assert.equal(snapshot.externalConnected, false);
  assert.equal(snapshot.activities.timers[0].id, timer.timer.id);
  assert.equal(snapshot.activities.polls[0].counts[1], 1);
  assert.deepEqual(drawn.giveaway.winnerIds, ['viewer-1']);
  assert.equal(snapshot.chat.commands[0].trigger, '!hello');
  assert.equal(snapshot.chat.readAloud[0].status, 'pending');
  assert.ok(events.length >= 3);
  const reloaded = new BroadcastHub(path.join(root, 'broadcast.json'));
  await reloaded.init();
  assert.equal(reloaded.snapshot().chat.savedMessages[0].text, 'Welcome to the stream.');
});

test('does not allow duplicate poll voters or unsafe command triggers', async () => {
  const { hub } = await store();
  const poll = await hub.applyAction({ type: 'poll_create', question: 'Pick', options: ['A', 'B'] });
  await hub.applyAction({ type: 'poll_vote', id: poll.poll.id, voterId: 'same', option: 0 });
  await hub.applyAction({ type: 'poll_vote', id: poll.poll.id, voterId: 'same', option: 1 });
  assert.equal(hub.snapshot().activities.polls[0].totalVotes, 1);
  await assert.rejects(() => hub.applyAction({ type: 'command_create', trigger: 'rm -rf', response: 'unsafe' }));
});
