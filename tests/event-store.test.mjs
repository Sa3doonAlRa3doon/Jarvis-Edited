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
