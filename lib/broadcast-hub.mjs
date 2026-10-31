import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_TIMERS = 32;
const MAX_POLLS = 24;
const MAX_GIVEAWAYS = 24;
const MAX_SAVED_MESSAGES = 120;
const MAX_COMMANDS = 120;
const MAX_READ_ALOUD = 80;
const MAX_TEXT = 500;

function clean(value, limit = MAX_TEXT) {
  return String(value ?? '').replace(/[\0\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function longText(value, limit = MAX_TEXT) {
  return String(value ?? '').replace(/\0/g, '').replace(/\r\n?/g, '\n').trim().slice(0, limit);
}

function iso(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function durationSeconds(value, fallback = 60) {
  return boundedInteger(value, fallback, 5, 86_400);
}

function list(value, { min = 0, max = 6 } = {}) {
  const source = Array.isArray(value) ? value : String(value ?? '').split('|');
  const seen = new Set(); const output = [];
  for (const item of source) {
    const text = clean(item, 160);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key); output.push(text);
    if (output.length >= max) break;
  }
  if (output.length < min) throw new Error(`At least ${min} distinct values are required.`);
  return output;
}

function statusForWindow(item, now) {
  if (item.status === 'stopped' || item.status === 'drawn' || item.status === 'closed') return item.status;
  const endsAt = new Date(item.endsAt || 0).getTime();
  if (endsAt && endsAt <= now) return 'ended';
  return item.status || 'active';
}

function remaining(item, now) {
  if (item.status === 'paused') return Math.max(0, Number(item.remainingSeconds) || 0);
  if (item.status !== 'active') return 0;
  return Math.max(0, Math.ceil((new Date(item.endsAt).getTime() - now) / 1000));
}

function normalizeTimer(input = {}, now = Date.now()) {
  const name = clean(input.name || input.title || 'JARVIS timer', 100);
  const duration = durationSeconds(input.durationSeconds ?? input.duration, 60);
  const startsAt = iso(input.startsAt, new Date(now).toISOString());
  const endsAt = iso(input.endsAt, new Date(now + duration * 1000).toISOString());
  if (!name || !startsAt || !endsAt) throw new Error('Timer needs a name and duration.');
  return { id: clean(input.id, 120) || id('timer'), name, durationSeconds: duration, startsAt, endsAt, status: ['active', 'paused', 'stopped', 'ended'].includes(input.status) ? input.status : 'active', remainingSeconds: boundedInteger(input.remainingSeconds, duration, 0, 86_400), createdAt: iso(input.createdAt, new Date(now).toISOString()), updatedAt: iso(input.updatedAt, new Date(now).toISOString()) };
}

function normalizePoll(input = {}, now = Date.now()) {
  const question = clean(input.question || input.title, 240);
  if (!question) throw new Error('Poll question is required.');
  const options = list(input.options, { min: 2, max: 6 });
  const duration = durationSeconds(input.durationSeconds ?? input.duration, 120);
  const startsAt = iso(input.startsAt, new Date(now).toISOString());
  const endsAt = iso(input.endsAt, new Date(now + duration * 1000).toISOString());
  const votes = Array.isArray(input.votes) ? input.votes.slice(0, 2_000).map((vote) => ({ voterId: clean(vote?.voterId, 100), option: boundedInteger(vote?.option, -1, 0, options.length - 1) })).filter((vote) => vote.voterId && vote.option >= 0) : [];
  return { id: clean(input.id, 120) || id('poll'), question, options, durationSeconds: duration, startsAt, endsAt, status: ['active', 'closed', 'ended'].includes(input.status) ? input.status : 'active', votes, createdAt: iso(input.createdAt, new Date(now).toISOString()), updatedAt: iso(input.updatedAt, new Date(now).toISOString()) };
}

function normalizeGiveaway(input = {}, now = Date.now()) {
  const name = clean(input.name || input.title || 'JARVIS giveaway', 100);
  const keyword = clean(input.keyword || 'jarvis', 60).replace(/\s+/g, '-').toLowerCase();
  const winners = boundedInteger(input.winners, 1, 1, 5);
  const duration = durationSeconds(input.durationSeconds ?? input.duration, 300);
  if (!name || !keyword) throw new Error('Giveaway name and keyword are required.');
  const entries = Array.isArray(input.entries) ? input.entries.slice(0, 5_000).map((entry) => clean(entry, 100)).filter(Boolean) : [];
  return { id: clean(input.id, 120) || id('giveaway'), name, keyword, winners, durationSeconds: duration, startsAt: iso(input.startsAt, new Date(now).toISOString()), endsAt: iso(input.endsAt, new Date(now + duration * 1000).toISOString()), status: ['active', 'closed', 'ended', 'drawn'].includes(input.status) ? input.status : 'active', entries: [...new Set(entries)], winnerIds: Array.isArray(input.winnerIds) ? input.winnerIds.map((value) => clean(value, 100)).filter(Boolean).slice(0, winners) : [], createdAt: iso(input.createdAt, new Date(now).toISOString()), updatedAt: iso(input.updatedAt, new Date(now).toISOString()) };
}

function normalizeSavedMessage(input = {}, now = Date.now()) {
  const label = clean(input.label || input.name || 'Saved reply', 100);
  const text = longText(input.text || input.message, MAX_TEXT);
  if (!label || !text) throw new Error('Saved reply needs a label and message.');
  return { id: clean(input.id, 120) || id('reply'), label, text, createdAt: iso(input.createdAt, new Date(now).toISOString()), updatedAt: iso(input.updatedAt, new Date(now).toISOString()) };
}

function normalizeCommand(input = {}, now = Date.now()) {
  let trigger = clean(input.trigger || input.command, 60).toLowerCase();
  if (trigger && !trigger.startsWith('!')) trigger = `!${trigger}`;
  const response = longText(input.response || input.text, MAX_TEXT);
  if (!/^![a-z0-9][a-z0-9_-]{0,39}$/.test(trigger) || !response) throw new Error('Command needs a trigger such as !hello and a response.');
  return { id: clean(input.id, 120) || id('command'), trigger, response, cooldownSeconds: boundedInteger(input.cooldownSeconds, 0, 0, 3_600), enabled: input.enabled !== false, createdAt: iso(input.createdAt, new Date(now).toISOString()), updatedAt: iso(input.updatedAt, new Date(now).toISOString()) };
}

function normalizeReadAloud(input = {}, now = Date.now()) {
  const text = longText(input.text || input.message, 600);
  if (!text) throw new Error('Read-aloud text is required.');
  return { id: clean(input.id, 120) || id('read'), text, status: 'pending', createdAt: iso(input.createdAt, new Date(now).toISOString()), spokenAt: null };
}

function safeArray(value, normalizer, now, limit) {
  return (Array.isArray(value) ? value : []).slice(-limit).map((item) => { try { return normalizer(item, now); } catch { return null; } }).filter(Boolean);
}

function publicPoll(poll, now) {
  const counts = poll.options.map((_, index) => poll.votes.filter((vote) => vote.option === index).length);
  return { ...poll, status: statusForWindow(poll, now), remainingSeconds: remaining(poll, now), votes: undefined, counts, totalVotes: counts.reduce((sum, count) => sum + count, 0) };
}

function publicGiveaway(giveaway, now) {
  return { ...giveaway, status: statusForWindow(giveaway, now), remainingSeconds: remaining(giveaway, now), entries: giveaway.entries.length, winnerIds: [...giveaway.winnerIds] };
}

export function parseBroadcastPrompt(prompt = {}) {
  const text = clean(prompt, 2_000);
  let match = text.match(/^start\s+(?:a\s+)?timer\s+(\d+)\s*(seconds?|minutes?|hours?)\s*(?:called|named|for)?\s*(.*)$/i);
  if (match) {
    const unit = match[2].toLowerCase(); const multiplier = unit.startsWith('hour') ? 3_600 : unit.startsWith('minute') ? 60 : 1;
    return { type: 'timer_create', name: clean(match[3] || 'JARVIS timer', 100), durationSeconds: Number(match[1]) * multiplier };
  }
  match = text.match(/^create\s+(?:a\s+)?poll\s*[:\-]?\s*(.+)$/i);
  if (match) {
    const parts = match[1].split('|').map((item) => clean(item, 180)).filter(Boolean);
    if (parts.length >= 3) return { type: 'poll_create', question: parts[0], options: parts.slice(1) };
  }
  match = text.match(/^(?:start|create)\s+(?:a\s+)?giveaway(?:\s+with)?\s+keyword\s+([\w-]+)(?:\s+called\s+(.+))?$/i);
  if (match) return { type: 'giveaway_create', keyword: match[1], name: match[2] || 'JARVIS giveaway' };
  match = text.match(/^(?:save|store)\s+(?:a\s+)?(?:chat\s+)?reply\s+(.+?)\s*[:\-]\s*(.+)$/i);
  if (match) return { type: 'saved_create', label: match[1], text: match[2] };
  match = text.match(/^read\s+(?:this\s+)?aloud\s*[:\-]?\s*(.+)$/i);
  if (match) return { type: 'read_aloud_enqueue', text: match[1] };
  match = text.match(/^(?:add|save)\s+command\s+(!?[a-z0-9][a-z0-9_-]{0,39})\s*[:\-]\s*(.+)$/i);
  if (match) return { type: 'command_create', trigger: match[1], response: match[2] };
  return null;
}

export class BroadcastHub {
  constructor(filePath, { onEvent = async () => {}, now = () => Date.now() } = {}) {
    this.filePath = filePath; this.onEvent = onEvent; this.now = now;
    this.timers = []; this.polls = []; this.giveaways = []; this.savedMessages = []; this.commands = []; this.readAloud = [];
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const payload = JSON.parse(await fs.readFile(this.filePath, 'utf8')); const now = this.now();
      this.timers = safeArray(payload?.timers, normalizeTimer, now, MAX_TIMERS);
      this.polls = safeArray(payload?.polls, normalizePoll, now, MAX_POLLS);
      this.giveaways = safeArray(payload?.giveaways, normalizeGiveaway, now, MAX_GIVEAWAYS);
      this.savedMessages = safeArray(payload?.savedMessages, normalizeSavedMessage, now, MAX_SAVED_MESSAGES);
      this.commands = safeArray(payload?.commands, normalizeCommand, now, MAX_COMMANDS);
      this.readAloud = safeArray(payload?.readAloud, normalizeReadAloud, now, MAX_READ_ALOUD);
    } catch {}
    return this.snapshot();
  }

  async persist() {
    await fs.writeFile(this.filePath, `${JSON.stringify({ timers: this.timers, polls: this.polls, giveaways: this.giveaways, savedMessages: this.savedMessages, commands: this.commands, readAloud: this.readAloud }, null, 2)}\n`, { mode: 0o600 });
  }

  snapshot() {
    const now = this.now();
    return { hostOnly: true, externalConnected: false, mode: 'local-stage', chat: { commands: this.commands.map((item) => ({ ...item })), savedMessages: this.savedMessages.map((item) => ({ ...item })), readAloud: this.readAloud.slice(-MAX_READ_ALOUD).map((item) => ({ ...item })) }, activities: { timers: this.timers.map((item) => ({ ...item, status: statusForWindow(item, now), remainingSeconds: remaining(item, now) })), polls: this.polls.map((item) => publicPoll(item, now)), giveaways: this.giveaways.map((item) => publicGiveaway(item, now)) } };
  }

  async applyAction(input = {}) {
    const type = clean(input.type, 60).toLowerCase(); const now = this.now();
    if (type === 'timer_create') { if (this.timers.length >= MAX_TIMERS) throw new Error(`A maximum of ${MAX_TIMERS} timers is allowed.`); const timer = normalizeTimer(input, now); this.timers.push(timer); await this.onEvent({ type: 'broadcast', message: `Local timer started: ${timer.name}`, detail: { timerId: timer.id, durationSeconds: timer.durationSeconds } }); await this.persist(); return { type, timer: { ...timer, remainingSeconds: remaining(timer, now) } }; }
    if (type.startsWith('timer_')) { const timer = this.timers.find((item) => item.id === clean(input.id, 120)); if (!timer) throw new Error('Timer not found.'); const action = type.slice(6); if (action === 'pause' && timer.status === 'active') { timer.remainingSeconds = remaining(timer, now); timer.status = 'paused'; } else if (action === 'resume' && timer.status === 'paused') { timer.endsAt = new Date(now + timer.remainingSeconds * 1000).toISOString(); timer.status = 'active'; } else if (action === 'reset') { timer.remainingSeconds = timer.durationSeconds; timer.endsAt = new Date(now + timer.durationSeconds * 1000).toISOString(); timer.status = 'active'; } else if (action === 'stop') timer.status = 'stopped'; else throw new Error('Unsupported timer action.'); timer.updatedAt = new Date(now).toISOString(); await this.persist(); return { type, timer: { ...timer, remainingSeconds: remaining(timer, now) } }; }
    if (type === 'poll_create') { if (this.polls.length >= MAX_POLLS) throw new Error(`A maximum of ${MAX_POLLS} polls is allowed.`); const poll = normalizePoll(input, now); this.polls.push(poll); await this.onEvent({ type: 'broadcast', message: `Local poll opened: ${poll.question}`, detail: { pollId: poll.id, optionCount: poll.options.length } }); await this.persist(); return { type, poll: publicPoll(poll, now) }; }
    if (type === 'poll_vote') { const poll = this.polls.find((item) => item.id === clean(input.id, 120)); if (!poll) throw new Error('Poll not found.'); if (statusForWindow(poll, now) !== 'active') throw new Error('Poll is no longer active.'); const voterId = clean(input.voterId, 100); const option = boundedInteger(input.option, -1, 0, poll.options.length - 1); if (!voterId || option < 0) throw new Error('Poll vote needs a voter id and valid option.'); poll.votes = poll.votes.filter((vote) => vote.voterId !== voterId); poll.votes.push({ voterId, option }); poll.updatedAt = new Date(now).toISOString(); await this.persist(); return { type, poll: publicPoll(poll, now) }; }
    if (type === 'giveaway_create') { if (this.giveaways.length >= MAX_GIVEAWAYS) throw new Error(`A maximum of ${MAX_GIVEAWAYS} giveaways is allowed.`); const giveaway = normalizeGiveaway(input, now); this.giveaways.push(giveaway); await this.onEvent({ type: 'broadcast', message: `Local giveaway opened: ${giveaway.name}`, detail: { giveawayId: giveaway.id, keyword: giveaway.keyword } }); await this.persist(); return { type, giveaway: publicGiveaway(giveaway, now) }; }
    if (type === 'giveaway_enter') { const giveaway = this.giveaways.find((item) => item.id === clean(input.id, 120)); if (!giveaway) throw new Error('Giveaway not found.'); if (statusForWindow(giveaway, now) !== 'active') throw new Error('Giveaway is no longer active.'); const entry = clean(input.entry || input.voterId, 100); if (!entry) throw new Error('Giveaway entry needs a viewer id.'); if (!giveaway.entries.includes(entry)) giveaway.entries.push(entry); giveaway.updatedAt = new Date(now).toISOString(); await this.persist(); return { type, giveaway: publicGiveaway(giveaway, now) }; }
    if (type === 'giveaway_draw') { const giveaway = this.giveaways.find((item) => item.id === clean(input.id, 120)); if (!giveaway) throw new Error('Giveaway not found.'); if (!giveaway.entries.length) throw new Error('Giveaway has no entries.'); const pool = [...giveaway.entries]; const winners = []; while (pool.length && winners.length < giveaway.winners) winners.push(pool.splice(crypto.randomInt(pool.length), 1)[0]); giveaway.winnerIds = winners; giveaway.status = 'drawn'; giveaway.updatedAt = new Date(now).toISOString(); await this.onEvent({ type: 'broadcast', message: `Local giveaway drawn: ${giveaway.name}`, detail: { giveawayId: giveaway.id, winners: winners.join(', ') } }); await this.persist(); return { type, giveaway: publicGiveaway(giveaway, now) }; }
    if (type === 'saved_create') { if (this.savedMessages.length >= MAX_SAVED_MESSAGES) throw new Error(`A maximum of ${MAX_SAVED_MESSAGES} saved replies is allowed.`); const saved = normalizeSavedMessage(input, now); this.savedMessages.push(saved); await this.persist(); return { type, savedMessage: { ...saved } }; }
    if (type === 'command_create') { if (this.commands.length >= MAX_COMMANDS) throw new Error(`A maximum of ${MAX_COMMANDS} commands is allowed.`); const command = normalizeCommand(input, now); const duplicate = this.commands.find((item) => item.trigger === command.trigger); if (duplicate) throw new Error('That command trigger already exists.'); this.commands.push(command); await this.persist(); return { type, command: { ...command } }; }
    if (type === 'read_aloud_enqueue') { if (this.readAloud.length >= MAX_READ_ALOUD) this.readAloud.shift(); const item = normalizeReadAloud(input, now); this.readAloud.push(item); await this.persist(); return { type, readAloud: { ...item } }; }
    if (type === 'read_aloud_spoken') { const item = this.readAloud.find((entry) => entry.id === clean(input.id, 120)); if (!item) throw new Error('Read-aloud item not found.'); item.status = 'spoken'; item.spokenAt = new Date(now).toISOString(); await this.persist(); return { type, readAloud: { ...item } }; }
    if (type === 'remove') { const collection = { timer: 'timers', poll: 'polls', giveaway: 'giveaways', saved: 'savedMessages', command: 'commands', read: 'readAloud' }[clean(input.kind, 30)]; if (!collection) throw new Error('Unsupported broadcast item.'); const index = this[collection].findIndex((item) => item.id === clean(input.id, 120)); if (index < 0) throw new Error('Broadcast item not found.'); const [removed] = this[collection].splice(index, 1); await this.persist(); return { type, kind: collection, removed }; }
    throw new Error('Unsupported broadcast action.');
  }

  async tick() {
    const now = this.now(); let changed = false;
    for (const item of [...this.timers, ...this.polls, ...this.giveaways]) {
      if (item.status === 'active' && new Date(item.endsAt).getTime() <= now) { item.status = 'ended'; item.updatedAt = new Date(now).toISOString(); changed = true; await this.onEvent({ type: 'broadcast', message: `Local broadcast activity ended: ${item.name || item.question}`, detail: { id: item.id } }); }
    }
    if (changed) await this.persist();
    return changed;
  }
}

export const broadcastHubLimits = Object.freeze({ MAX_TIMERS, MAX_POLLS, MAX_GIVEAWAYS, MAX_SAVED_MESSAGES, MAX_COMMANDS, MAX_READ_ALOUD });
