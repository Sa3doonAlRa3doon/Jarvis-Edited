import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MEMORY_EVENTS = 240;
const KEEP_AFTER_COMPACTION = 500;

function cleanText(value, limit = 420) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export class EventStore {
  constructor(root) {
    this.root = root;
    this.logPath = path.join(root, 'monitor-events.jsonl');
    this.summaryPath = path.join(root, 'monitor-summary.json');
    this.events = [];
    this.summary = { compacted: 0, byType: {}, lastCompactedAt: null };
    this.listeners = new Set();
    this.compacting = false;
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true });
    try {
      const raw = await fs.readFile(this.logPath, 'utf8');
      this.events = raw.split(/\r?\n/).filter(Boolean).slice(-MAX_MEMORY_EVENTS).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
    } catch {}
    try {
      this.summary = JSON.parse(await fs.readFile(this.summaryPath, 'utf8'));
    } catch {}
  }

  list(limit = 120) {
    return this.events.slice(-Math.max(1, Math.min(240, Number(limit) || 120))).reverse();
  }

  snapshot() {
    return { events: this.list(), summary: this.summary };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async append(type, message, detail = {}) {
    const event = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      type: cleanText(type, 48) || 'system',
      message: cleanText(message),
      detail: Object.fromEntries(Object.entries(detail || {}).slice(0, 14).map(([key, value]) => [
        cleanText(key, 48),
        typeof value === 'number' || typeof value === 'boolean' ? value : cleanText(value, 260)
      ]))
    };
    this.events.push(event);
    this.events = this.events.slice(-MAX_MEMORY_EVENTS);
    await fs.appendFile(this.logPath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    for (const listener of this.listeners) listener(event);
    void this.compactIfNeeded();
    return event;
  }

  async compactIfNeeded() {
    if (this.compacting) return;
    let stats;
    try { stats = await fs.stat(this.logPath); } catch { return; }
    if (stats.size < MAX_FILE_BYTES) return;
    this.compacting = true;
    try {
      const raw = await fs.readFile(this.logPath, 'utf8');
      const all = raw.split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
      const archived = all.slice(0, -KEEP_AFTER_COMPACTION);
      const kept = all.slice(-KEEP_AFTER_COMPACTION);
      for (const item of archived) {
        const key = cleanText(item.type, 48) || 'system';
        this.summary.byType[key] = (this.summary.byType[key] || 0) + 1;
      }
      this.summary.compacted = (this.summary.compacted || 0) + archived.length;
      this.summary.lastCompactedAt = new Date().toISOString();
      await fs.writeFile(this.summaryPath, `${JSON.stringify(this.summary, null, 2)}\n`, { mode: 0o600 });
      await fs.writeFile(this.logPath, kept.map((item) => JSON.stringify(item)).join('\n') + '\n', { mode: 0o600 });
    } finally {
      this.compacting = false;
    }
  }
}
