import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RoutineEngine, routineCatalog, validateRoutineInput } from '../lib/routine-engine.mjs';

async function tempFile() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-routines-'));
  return { root, file: path.join(root, 'routines.json') };
}

test('routine catalog is read-only and validates safe intervals', () => {
  assert.equal(routineCatalog.length, 7);
  assert.equal(routineCatalog.every((item) => item.readOnly), true);
  assert.equal(routineCatalog.some((item) => item.kind === 'briefing'), true);
  const routine = validateRoutineInput({ kind: 'health', name: 'Health', intervalMinutes: 1 }, { now: 1_000 });
  assert.equal(routine.intervalMinutes, 5);
  assert.match(routine.nextRunAt, /1970-01-01T00:05/);
});

test('morning briefing is an allowed read-only routine kind', () => {
  const routine = validateRoutineInput({ kind: 'briefing', name: 'Daily digest', intervalMinutes: 1440 }, { now: 1_000 });
  assert.equal(routine.kind, 'briefing');
  assert.equal(routine.intervalMinutes, 1440);
});

test('routine engine persists, runs, pauses, and removes local checks', async () => {
  const { root, file } = await tempFile();
  let now = Date.parse('2026-01-01T00:00:00Z');
  const events = [];
  const engine = new RoutineEngine(file, {
    start: false,
    now: () => now,
    executor: async (routine) => ({ summary: `${routine.kind} completed locally` }),
    onEvent: async (event) => events.push(event)
  });
  await engine.init({ start: false });
  const created = await engine.create({ kind: 'health', name: 'Nightly health', intervalMinutes: 5 });
  assert.equal(engine.list().length, 1);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).length, 1);
  await engine.runNow(created.id);
  assert.equal(engine.list()[0].lastResult, 'health completed locally');
  assert.equal(events[0].ok, true);
  const paused = await engine.update(created.id, { enabled: false });
  assert.equal(paused.enabled, false);
  await engine.remove(created.id);
  assert.equal(engine.list().length, 0);
  await fs.rm(root, { recursive: true, force: true });
});

test('mutation-like routine topics are rejected before persistence', async () => {
  const { file, root } = await tempFile();
  const engine = new RoutineEngine(file);
  await engine.init({ start: false });
  await assert.rejects(() => engine.create({ kind: 'news', name: 'Unsafe', topic: 'send this email' }), /read-only/);
  await assert.rejects(() => engine.create({ kind: 'health', name: 'Unsafe', prompt: 'restart all services' }), /read-only/);
  await fs.rm(root, { recursive: true, force: true });
});
