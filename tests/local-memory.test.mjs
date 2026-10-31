import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LocalMemoryStore, parseNotePrompt, parseReminderPrompt, validateReminderInput } from '../lib/local-memory.mjs';

test('parses safe local note and relative reminder commands', () => {
  const note = parseNotePrompt('remember: buy a quieter USB microphone for the Pi.');
  assert.equal(note.title, 'buy a quieter USB microphone for the Pi');
  assert.match(note.body, /USB microphone/);
  const reminder = parseReminderPrompt('remind me in 20 minutes to test Hey Jarvis', { now: 1_700_000_000_000 });
  assert.equal(reminder.title, 'test Hey Jarvis');
  assert.equal(new Date(reminder.dueAt).getTime(), 1_700_000_000_000 + 20 * 60_000);
});

test('rejects invalid reminder dates before persistence', () => {
  assert.throws(() => validateReminderInput({ title: 'test', dueAt: 'not-a-date' }), /valid due date/);
  assert.equal(parseReminderPrompt('remind me to do something later'), null);
});

test('persists, searches, completes, and emits due local memory items', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-memory-'));
  const file = path.join(root, 'memory.json'); let now = 1_700_000_000_000; const due = [];
  const store = new LocalMemoryStore(file, { now: () => now, onDue: async (item) => due.push(item.title) });
  await store.init();
  const note = await store.createNote({ title: 'Pi setup', body: 'Use the selected microphone.', tags: 'Pi, voice, pi' });
  assert.deepEqual(note.tags, ['pi', 'voice']);
  assert.equal(store.listNotes('microphone').length, 1);
  const reminder = await store.createReminder({ title: 'Check audio', dueAt: new Date(now + 1_000).toISOString() });
  now += 2_000; await store.tick();
  assert.deepEqual(due, ['Check audio']);
  assert.equal(store.listReminders().length, 1);
  await store.completeReminder(reminder.id);
  assert.equal(store.listReminders().length, 0);
  const reloaded = new LocalMemoryStore(file, { now: () => now }); await reloaded.init();
  assert.equal(reloaded.listNotes().length, 1);
  assert.equal(reloaded.listReminders().length, 0);
  await reloaded.removeNote(note.id); assert.equal(reloaded.listNotes().length, 0);
  await fs.rm(root, { recursive: true, force: true });
});
