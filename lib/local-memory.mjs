import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_NOTES = 240;
const MAX_REMINDERS = 240;
const MAX_TITLE = 120;
const MAX_NOTE_BODY = 5_000;
const MAX_TAGS = 8;

function clean(value, limit = 240) {
  return String(value ?? '').replace(/[\0\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function longText(value, limit = MAX_NOTE_BODY) {
  return String(value ?? '').replace(/\0/g, '').replace(/\r\n?/g, '\n').trim().slice(0, limit);
}

function timestamp(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function tags(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen = new Set(); const output = [];
  for (const item of source) {
    const tag = clean(item, 32).replace(/[^\p{L}\p{N}_-]+/gu, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag); output.push(tag);
    if (output.length >= MAX_TAGS) break;
  }
  return output;
}

export function validateNoteInput(input = {}, { now = Date.now(), partial = false } = {}) {
  const output = {};
  if (input.title != null || !partial) {
    const title = clean(input.title, MAX_TITLE);
    if (!title) throw new Error('Note title is required.');
    output.title = title;
  }
  if (input.body != null || !partial) output.body = longText(input.body);
  if (input.tags != null || !partial) output.tags = tags(input.tags);
  if (input.pinned != null || !partial) output.pinned = input.pinned === true;
  if (!partial) {
    const createdAt = timestamp(input.createdAt, new Date(now).toISOString());
    output.id = clean(input.id, 90) || `note-${crypto.randomUUID()}`;
    output.createdAt = createdAt;
    output.updatedAt = timestamp(input.updatedAt, createdAt);
  }
  return output;
}

export function validateReminderInput(input = {}, { now = Date.now(), partial = false } = {}) {
  const output = {};
  if (input.title != null || !partial) {
    const title = clean(input.title, MAX_TITLE);
    if (!title) throw new Error('Reminder title is required.');
    output.title = title;
  }
  if (input.dueAt != null || !partial) {
    const dueAt = timestamp(input.dueAt);
    if (!dueAt) throw new Error('Reminder needs a valid due date and time.');
    output.dueAt = dueAt;
  }
  if (input.completed != null || !partial) output.completed = input.completed === true;
  if (input.completedAt != null || !partial) output.completedAt = timestamp(input.completedAt);
  if (input.notifiedAt != null || !partial) output.notifiedAt = timestamp(input.notifiedAt);
  if (!partial) {
    output.id = clean(input.id, 90) || `reminder-${crypto.randomUUID()}`;
    output.createdAt = timestamp(input.createdAt, new Date(now).toISOString());
    output.updatedAt = timestamp(input.updatedAt, output.createdAt);
  }
  return output;
}

export function parseNotePrompt(prompt) {
  const text = clean(prompt, 2_000);
  const match = text.match(/^(?:remember|make\s+(?:a\s+)?note|save\s+(?:a\s+)?note|note(?:\s+that)?)\s*(?:[:\-]\s*)?(.+)$/i);
  if (!match) return null;
  const body = longText(match[1]);
  if (!body) return null;
  const title = clean(body.split(/[.!?]\s+/)[0], MAX_TITLE).replace(/[.!?]+$/, '') || 'JARVIS note';
  return { title, body, tags: ['jarvis'] };
}

function reminderDueAt(value, now) {
  const number = Number(value?.value ?? value);
  const unit = String(value?.unit || '').toLowerCase();
  if (!Number.isFinite(number)) return null;
  const multipliers = { minute: 60_000, minutes: 60_000, hour: 3_600_000, hours: 3_600_000, day: 86_400_000, days: 86_400_000, week: 604_800_000, weeks: 604_800_000 };
  return multipliers[unit] ? new Date(now + number * multipliers[unit]).toISOString() : null;
}

export function parseReminderPrompt(prompt, { now = Date.now() } = {}) {
  const text = clean(prompt, 2_000);
  const relative = text.match(/^remind\s+me\s+in\s+(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)\s+(?:to\s+)?(.+)$/i);
  if (relative) {
    const dueAt = reminderDueAt({ value: relative[1], unit: relative[2] }, now);
    return dueAt ? { title: clean(relative[3], MAX_TITLE), dueAt } : null;
  }
  const tomorrow = text.match(/^remind\s+me\s+tomorrow\s+(?:to\s+)?(.+)$/i);
  if (tomorrow) return { title: clean(tomorrow[1], MAX_TITLE), dueAt: new Date(now + 86_400_000).toISOString() };
  const atTime = text.match(/^remind\s+me\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)?\s+(?:to\s+)?(.+)$/i);
  if (atTime) {
    let hours = Number(atTime[1]); const minutes = Number(atTime[2]);
    if (minutes > 59 || hours > 23 || (atTime[3] && hours > 12)) return null;
    if (atTime[3]) { const pm = atTime[3].toLowerCase() === 'pm'; hours = hours % 12 + (pm ? 12 : 0); }
    const due = new Date(now); due.setHours(hours, minutes, 0, 0); if (due.getTime() <= now) due.setDate(due.getDate() + 1);
    return { title: clean(atTime[4], MAX_TITLE), dueAt: due.toISOString() };
  }
  return null;
}

function safeStoredNote(item, now) {
  try { return validateNoteInput(item, { now }); } catch { return null; }
}

function safeStoredReminder(item, now) {
  try { return validateReminderInput(item, { now }); } catch { return null; }
}

export class LocalMemoryStore {
  constructor(filePath, { onDue = async () => {}, now = () => Date.now() } = {}) {
    this.filePath = filePath; this.onDue = onDue; this.now = now; this.notes = []; this.reminders = [];
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const payload = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      const now = this.now();
      this.notes = (Array.isArray(payload?.notes) ? payload.notes : []).map((item) => safeStoredNote(item, now)).filter(Boolean).slice(0, MAX_NOTES);
      this.reminders = (Array.isArray(payload?.reminders) ? payload.reminders : []).map((item) => safeStoredReminder(item, now)).filter(Boolean).slice(0, MAX_REMINDERS);
    } catch { this.notes = []; this.reminders = []; }
    return this.snapshot();
  }

  async persist() {
    const payload = { notes: this.notes, reminders: this.reminders };
    await fs.writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  }

  snapshot() {
    return { notes: this.listNotes(), reminders: this.listReminders(), hostOnly: true };
  }

  listNotes(query = '') {
    const term = clean(query, 120).toLowerCase();
    return this.notes.slice().filter((note) => !term || `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(term)).sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    }).map((item) => ({ ...item, tags: [...item.tags] }));
  }

  listReminders({ includeCompleted = false } = {}) {
    return this.reminders.slice().filter((item) => includeCompleted || !item.completed).sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt))).map((item) => ({ ...item }));
  }

  async createNote(input) {
    if (this.notes.length >= MAX_NOTES) throw new Error(`A maximum of ${MAX_NOTES} notes is allowed.`);
    const value = validateNoteInput(input, { now: this.now() });
    this.notes.push(value); await this.persist(); return { ...value, tags: [...value.tags] };
  }

  async updateNote(id, input) {
    const index = this.notes.findIndex((item) => item.id === String(id)); if (index < 0) throw new Error('Note not found.');
    const patch = validateNoteInput(input, { now: this.now(), partial: true });
    const next = { ...this.notes[index], ...patch, updatedAt: new Date(this.now()).toISOString() };
    this.notes[index] = next; await this.persist(); return { ...next, tags: [...next.tags] };
  }

  async removeNote(id) {
    const index = this.notes.findIndex((item) => item.id === String(id)); if (index < 0) throw new Error('Note not found.');
    const [removed] = this.notes.splice(index, 1); await this.persist(); return { ...removed, tags: [...removed.tags] };
  }

  async createReminder(input) {
    if (this.reminders.length >= MAX_REMINDERS) throw new Error(`A maximum of ${MAX_REMINDERS} reminders is allowed.`);
    const value = validateReminderInput(input, { now: this.now() });
    this.reminders.push(value); await this.persist(); return { ...value };
  }

  async updateReminder(id, input) {
    const index = this.reminders.findIndex((item) => item.id === String(id)); if (index < 0) throw new Error('Reminder not found.');
    const patch = validateReminderInput(input, { now: this.now(), partial: true });
    const next = { ...this.reminders[index], ...patch, updatedAt: new Date(this.now()).toISOString() };
    if (patch.completed === false) next.completedAt = null;
    this.reminders[index] = next; await this.persist(); return { ...next };
  }

  async completeReminder(id) { return this.updateReminder(id, { completed: true, completedAt: new Date(this.now()).toISOString() }); }

  async removeReminder(id) {
    const index = this.reminders.findIndex((item) => item.id === String(id)); if (index < 0) throw new Error('Reminder not found.');
    const [removed] = this.reminders.splice(index, 1); await this.persist(); return { ...removed };
  }

  async tick() {
    const now = this.now(); const due = this.reminders.filter((item) => !item.completed && !item.notifiedAt && new Date(item.dueAt).getTime() <= now);
    if (!due.length) return [];
    const stamp = new Date(now).toISOString();
    for (const reminder of due) { reminder.notifiedAt = stamp; await this.onDue({ ...reminder }); }
    await this.persist(); return due.map((item) => ({ ...item, notifiedAt: stamp }));
  }
}

export const localMemoryLimits = Object.freeze({ maxNotes: MAX_NOTES, maxReminders: MAX_REMINDERS });
