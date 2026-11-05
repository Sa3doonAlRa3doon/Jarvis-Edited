import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventStore } from '../lib/event-store.mjs';

test('returns bounded local event analytics without exposing event details', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-events-'));
  const store = new EventStore(root);
  await store.init();
  await store.append('wake', 'Wake detected', { source: 'browser', secret: 'never returned' });
  await store.append('broadcast', 'Local timer started', { timerId: 'timer-1' });
  const analytics = store.analytics({ windowHours: 24 });
  assert.equal(analytics.events, 2);
  assert.equal(analytics.byType.wake, 1);
  assert.equal(analytics.byType.broadcast, 1);
  assert.equal(analytics.stored, 2);
  assert.equal('secret' in analytics, false);
  await fs.rm(root, { recursive: true, force: true });
});

test('serializes concurrent appends across compaction without losing an event', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-events-race-'));
  try {
    const store = new EventStore(root, { maxFileBytes: 512, keepAfterCompaction: 5 });
    await store.init();
    await Promise.all(Array.from({ length: 40 }, (_, index) => store.append('race', `Event ${index}`, { index })));
    const lines = (await fs.readFile(store.logPath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(Number(store.summary.compacted) + lines.length, 40);
    assert.equal(new Set([...lines.map((item) => item.message), ...store.list(40).map((item) => item.message)]).size, 40);
    assert.equal(store.list(40).length, 40);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
