import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_QUEUE = 50;
const MAX_HISTORY = 40;
const MAX_TITLE = 140;
const MAX_ARTIST = 100;
const MAX_DURATION_SECONDS = 24 * 60 * 60;

function clean(value, limit) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function duration(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(MAX_DURATION_SECONDS, Math.max(0, Math.round(parsed))) : 0;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeId() { return `media_${crypto.randomUUID()}`; }

function safeItem(item, now = Date.now()) {
  if (!item || typeof item !== 'object') return null;
  const title = clean(item.title, MAX_TITLE);
  if (!title) return null;
  const status = ['queued', 'playing', 'paused', 'ended', 'stopped'].includes(item.status) ? item.status : 'queued';
  return {
    id: clean(item.id, 180) || makeId(),
    title,
    artist: clean(item.artist || 'JARVIS local', MAX_ARTIST),
    durationSeconds: duration(item.durationSeconds),
    source: 'local-stage',
    status,
    createdAt: clean(item.createdAt, 40) || new Date(now).toISOString(),
    startedAt: clean(item.startedAt, 40) || '',
    endedAt: clean(item.endedAt, 40) || ''
  };
}

export function parseMediaPrompt(prompt = '') {
  const text = clean(prompt, 1200);
  if (!text) return null;
  if (/\b(?:show|list|what(?:'s| is) in|check)\b[\s\S]{0,80}\b(?:music|media|playlist|queue|now playing)\b/i.test(text) || /^(?:music|media|playlist|queue|now playing)\s*\??$/i.test(text)) return { type: 'state' };
  if (/\b(?:pause|hold)\b[\s\S]{0,40}\b(?:music|media|track|song|playback)\b/i.test(text) || /^pause\s*$/i.test(text)) return { type: 'pause' };
  if (/\b(?:resume|continue|unpause)\b[\s\S]{0,40}\b(?:music|media|track|song|playback|queue)\b/i.test(text) || /^resume\s*$/i.test(text)) return { type: 'resume' };
  if (/\b(?:next|skip)\s+(?:track|song|music|media)\b/i.test(text) || /^(?:next|skip)\s*$/i.test(text)) return { type: 'next' };
  if (/\b(?:stop|end|clear)\b[\s\S]{0,40}\b(?:music|media|track|song|playback|queue)\b/i.test(text) || /^stop\s*$/i.test(text)) return { type: 'stop' };
  const match = text.match(/^(?:play|queue|enqueue|add)\s+(?:(?:this|a|the)\s+)?(?:(?:music|song|track)\s+)?(.+)$/i);
  if (match && /\b(?:music|song|track|playlist|queue|lofi|ambient|podcast)\b/i.test(text)) {
    return { type: /^queue|^enqueue|^add/i.test(text) ? 'enqueue' : 'play', title: clean(match[1], MAX_TITLE) };
  }
  return null;
}

export class MediaDeck {
  constructor(filePath, { onEvent = async () => {}, now = () => Date.now() } = {}) {
    this.filePath = filePath;
    this.onEvent = onEvent;
    this.now = now;
    this.current = null;
    this.queue = [];
    this.history = [];
    this.initialized = false;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const payload = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      this.current = safeItem(payload?.current, this.now());
      this.queue = (Array.isArray(payload?.queue) ? payload.queue : []).map((item) => safeItem(item, this.now())).filter(Boolean).slice(0, MAX_QUEUE);
      this.history = (Array.isArray(payload?.history) ? payload.history : []).map((item) => safeItem(item, this.now())).filter(Boolean).slice(-MAX_HISTORY);
      if (this.current && !['playing', 'paused'].includes(this.current.status)) this.current = null;
    } catch { this.current = null; this.queue = []; this.history = []; }
    this.initialized = true;
    await this.persist();
  }

  async persist() {
    const payload = { current: this.current, queue: this.queue, history: this.history.slice(-MAX_HISTORY), updatedAt: new Date(this.now()).toISOString() };
    await fs.writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  }

  snapshot() {
    return { hostOnly: true, externalConnected: false, mode: 'local-stage', current: clone(this.current), queue: clone(this.queue), history: clone(this.history.slice(-MAX_HISTORY)) };
  }

  async emit(type, message, detail = {}) { await this.onEvent({ type, message, detail }); }

  async play(id = '') {
    if (this.current && (!id || this.current.id === id)) {
      this.current.status = 'playing';
      await this.persist();
      return { current: clone(this.current) };
    }
    const index = id ? this.queue.findIndex((item) => item.id === id) : 0;
    if (index < 0 || !this.queue[index]) throw new Error('No queued media item is available.');
    if (this.current) await this.finishCurrent('stopped');
    const [item] = this.queue.splice(index, 1);
    item.status = 'playing'; item.startedAt = new Date(this.now()).toISOString(); item.endedAt = '';
    this.current = item;
    await this.persist();
    await this.emit('media', `Local media started: ${item.title}`, { mediaId: item.id });
    return { current: clone(this.current), queue: clone(this.queue) };
  }

  async enqueue(input = {}, { autoplay = false } = {}) {
    if (this.queue.length >= MAX_QUEUE) throw new Error(`The local media queue is limited to ${MAX_QUEUE} items.`);
    const item = safeItem({ id: makeId(), title: input.title, artist: input.artist, durationSeconds: input.durationSeconds, status: 'queued', createdAt: new Date(this.now()).toISOString() }, this.now());
    if (!item) throw new Error('A media title is required.');
    this.queue.push(item);
    await this.persist();
    await this.emit('media', `Local media queued: ${item.title}`, { mediaId: item.id });
    if (autoplay && !this.current) return this.play(item.id);
    return { item: clone(item), queue: clone(this.queue), current: clone(this.current) };
  }

  async pause() {
    if (!this.current) throw new Error('Nothing is playing locally.');
    this.current.status = 'paused'; await this.persist();
    await this.emit('media', `Local media paused: ${this.current.title}`, { mediaId: this.current.id });
    return { current: clone(this.current) };
  }

  async resume() {
    if (!this.current) return this.play();
    this.current.status = 'playing'; await this.persist();
    await this.emit('media', `Local media resumed: ${this.current.title}`, { mediaId: this.current.id });
    return { current: clone(this.current) };
  }

  async finishCurrent(status = 'ended') {
    if (!this.current) return;
    this.current.status = status; this.current.endedAt = new Date(this.now()).toISOString();
    this.history.push(this.current); this.history = this.history.slice(-MAX_HISTORY); this.current = null;
  }

  async next() {
    if (this.current) await this.finishCurrent('ended');
    if (!this.queue.length) { await this.persist(); return { current: null, queue: [] }; }
    return this.play(this.queue[0].id);
  }

  async stop() {
    if (this.current) await this.finishCurrent('stopped');
    await this.persist();
    await this.emit('media', 'Local media stopped', {});
    return { current: null, queue: clone(this.queue), history: clone(this.history) };
  }

  async remove(id) {
    const target = clean(id, 180);
    const index = this.queue.findIndex((item) => item.id === target);
    if (index < 0) throw new Error('Queued media item not found.');
    const [removed] = this.queue.splice(index, 1); await this.persist();
    return { removed: clone(removed), queue: clone(this.queue), current: clone(this.current) };
  }

  async clear() {
    this.queue = []; await this.persist();
    await this.emit('media', 'Local media queue cleared', {});
    return { current: clone(this.current), queue: [] };
  }

  async applyAction(input = {}) {
    if (!this.initialized) throw new Error('Local media deck is still starting.');
    const type = clean(input.type, 40).toLowerCase();
    if (type === 'state') return this.snapshot();
    if (type === 'enqueue') return this.enqueue(input, { autoplay: Boolean(input.autoplay) });
    if (type === 'play') return input.title ? this.enqueue(input, { autoplay: true }) : this.play(clean(input.id, 180));
    if (type === 'pause') return this.pause();
    if (type === 'resume') return this.resume();
    if (type === 'next') return this.next();
    if (type === 'stop') return this.stop();
    if (type === 'remove') return this.remove(input.id);
    if (type === 'clear') return this.clear();
    throw new Error('Unsupported local media action.');
  }

  async tick() {
    if (!this.current || this.current.status !== 'playing' || !this.current.durationSeconds || !this.current.startedAt) return;
    const elapsed = (this.now() - Date.parse(this.current.startedAt)) / 1000;
    if (elapsed >= this.current.durationSeconds) await this.next();
  }
}

