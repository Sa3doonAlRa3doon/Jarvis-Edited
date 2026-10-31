import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_ROUTINES = 32;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
const MAX_NAME_LENGTH = 80;
const MUTATION_WORDS = /\b(?:send|delete|remove|cancel|stop|restart|shutdown|launch|open|click|type|post|publish|upload|purchase|buy|change|set|toggle|mute|unmute|pause|resume|approve|submit|message|email)\b/i;

export const routineCatalog = Object.freeze([
  { kind: 'health', label: 'Pi health snapshot', description: 'CPU, RAM, storage, temperature, and core services', readOnly: true },
  { kind: 'docker', label: 'Docker monitor', description: 'Container count, unhealthy services, and resource pressure', readOnly: true },
  { kind: 'printer', label: '3D printer watch', description: 'Print progress, ETA, temperatures, and current state', readOnly: true },
  { kind: 'weather', label: 'Default-location weather', description: 'Current conditions for the configured default location', readOnly: true },
  { kind: 'news', label: 'Google News brief', description: 'Read-only headlines from the configured topic', readOnly: true },
  { kind: 'calendar', label: 'Calendar agenda', description: 'Read-only upcoming Google Calendar events', readOnly: true },
  { kind: 'briefing', label: 'Morning briefing', description: 'One read-only digest of local health, weather, printer, Docker, news, and Calendar', readOnly: true }
]);

const allowedKinds = new Set(routineCatalog.map((item) => item.kind));

function clean(value, limit = 240) {
  return String(value ?? '').replace(/[\0\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function iso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function catalogItem(kind) {
  return routineCatalog.find((item) => item.kind === kind) || null;
}

export function validateRoutineInput(input = {}, { now = Date.now(), partial = false } = {}) {
  const kind = String(input.kind || '').trim().toLowerCase();
  if (!partial && !allowedKinds.has(kind)) throw new Error('Choose a supported read-only routine type.');
  if (partial && input.kind != null && !allowedKinds.has(kind)) throw new Error('Routine type is not supported.');
  const output = {};
  if (input.kind != null) output.kind = kind;
  if (input.name != null || !partial) {
    const name = clean(input.name, MAX_NAME_LENGTH);
    if (!name) throw new Error('Routine name is required.');
    output.name = name;
  }
  if (input.topic != null) {
    const topic = clean(input.topic, 120);
    if (MUTATION_WORDS.test(topic)) throw new Error('Routine topics must stay read-only; mutation-like instructions are not allowed.');
    output.topic = topic;
  }
  if (input.location != null) output.location = clean(input.location, 100);
  if (input.intervalMinutes != null || !partial) {
    output.intervalMinutes = integer(input.intervalMinutes, 60, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
  }
  if (input.enabled != null || !partial) output.enabled = input.enabled !== false;
  if (input.nextRunAt != null) output.nextRunAt = iso(input.nextRunAt);
  if (input.prompt != null) {
    const prompt = clean(input.prompt, 280);
    if (MUTATION_WORDS.test(prompt)) throw new Error('Routine prompts must stay read-only; mutation-like instructions are not allowed.');
    output.prompt = prompt;
  }
  if (!partial) {
    const interval = output.intervalMinutes || 60;
    output.id = clean(input.id, 80) || `routine-${crypto.randomUUID()}`;
    output.createdAt = iso(input.createdAt) || new Date(now).toISOString();
    output.updatedAt = iso(input.updatedAt) || output.createdAt;
    output.lastRunAt = iso(input.lastRunAt);
    output.lastError = clean(input.lastError, 260);
    output.lastResult = clean(input.lastResult, 600);
    output.nextRunAt = iso(input.nextRunAt) || new Date(now + interval * 60_000).toISOString();
  }
  return output;
}

function normaliseStored(item, now) {
  try {
    const value = validateRoutineInput(item, { now });
    const definition = catalogItem(value.kind);
    return { ...value, label: definition?.label || value.kind, readOnly: true };
  } catch {
    return null;
  }
}

export class RoutineEngine {
  constructor(filePath, { executor = async () => ({ summary: 'No routine executor configured.' }), onEvent = async () => {}, tickMs = 15_000, now = () => Date.now() } = {}) {
    this.filePath = filePath;
    this.executor = executor;
    this.onEvent = onEvent;
    this.tickMs = Math.max(5_000, Number(tickMs) || 15_000);
    this.now = now;
    this.routines = [];
    this.timer = null;
    this.running = new Set();
  }

  async init({ start = true } = {}) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const payload = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      const items = Array.isArray(payload) ? payload : payload?.routines;
      this.routines = (Array.isArray(items) ? items : []).map((item) => normaliseStored(item, this.now())).filter(Boolean).slice(0, MAX_ROUTINES);
    } catch {
      this.routines = [];
    }
    if (start && !this.timer) this.timer = setInterval(() => void this.tick(), this.tickMs);
    return this.list();
  }

  async persist() {
    const safe = this.routines.map(({ label, readOnly, ...item }) => item);
    await fs.writeFile(this.filePath, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600 });
  }

  list() {
    return this.routines.slice().sort((left, right) => {
      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
      return String(left.nextRunAt || '').localeCompare(String(right.nextRunAt || ''));
    }).map((item) => ({ ...item }));
  }

  catalog() { return routineCatalog.map((item) => ({ ...item })); }

  async create(input) {
    if (this.routines.length >= MAX_ROUTINES) throw new Error(`A maximum of ${MAX_ROUTINES} routines is allowed.`);
    const now = this.now();
    const value = validateRoutineInput(input, { now });
    if (this.routines.some((item) => item.name.toLowerCase() === value.name.toLowerCase())) throw new Error('A routine with that name already exists.');
    const created = { ...value, label: catalogItem(value.kind)?.label || value.kind, readOnly: true };
    this.routines.push(created);
    await this.persist();
    return { ...created };
  }

  async update(id, input) {
    const index = this.routines.findIndex((item) => item.id === String(id));
    if (index < 0) throw new Error('Routine not found.');
    const current = this.routines[index];
    const patch = validateRoutineInput(input, { now: this.now(), partial: true });
    const next = { ...current, ...patch, updatedAt: new Date(this.now()).toISOString() };
    if (patch.intervalMinutes && patch.intervalMinutes !== current.intervalMinutes && !patch.nextRunAt) next.nextRunAt = new Date(this.now() + patch.intervalMinutes * 60_000).toISOString();
    if (patch.name && this.routines.some((item, itemIndex) => itemIndex !== index && item.name.toLowerCase() === patch.name.toLowerCase())) throw new Error('A routine with that name already exists.');
    this.routines[index] = next;
    await this.persist();
    return { ...next };
  }

  async remove(id) {
    const index = this.routines.findIndex((item) => item.id === String(id));
    if (index < 0) throw new Error('Routine not found.');
    const [removed] = this.routines.splice(index, 1);
    await this.persist();
    return { ...removed };
  }

  async runNow(id) {
    const routine = this.routines.find((item) => item.id === String(id));
    if (!routine) throw new Error('Routine not found.');
    await this.run(routine);
    return { ...routine };
  }

  async tick() {
    const now = this.now();
    const due = this.routines.filter((item) => item.enabled && !this.running.has(item.id) && item.nextRunAt && new Date(item.nextRunAt).getTime() <= now);
    for (const routine of due) await this.run(routine);
  }

  async run(routine) {
    if (!routine || this.running.has(routine.id)) return;
    this.running.add(routine.id);
    const startedAt = this.now();
    routine.lastRunAt = new Date(startedAt).toISOString();
    routine.nextRunAt = new Date(startedAt + routine.intervalMinutes * 60_000).toISOString();
    routine.lastError = '';
    await this.persist();
    try {
      const result = await this.executor({ ...routine });
      routine.lastResult = clean(result?.summary || result?.content || 'Routine completed.', 600);
      routine.lastError = '';
      await this.onEvent({ routine: { ...routine }, ok: true, result: result || {} });
    } catch (error) {
      routine.lastError = clean(error?.message || error || 'Routine failed.', 260);
      routine.lastResult = '';
      await this.onEvent({ routine: { ...routine }, ok: false, error: routine.lastError });
    } finally {
      await this.persist();
      this.running.delete(routine.id);
    }
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const routineLimits = Object.freeze({ max: MAX_ROUTINES, minIntervalMinutes: MIN_INTERVAL_MINUTES, maxIntervalMinutes: MAX_INTERVAL_MINUTES });
