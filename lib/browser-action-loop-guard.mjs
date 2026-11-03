import { createHash } from 'node:crypto';

/**
 * Adapted from OpenJarvis LoopGuard's repeated-call hash check:
 * https://github.com/open-jarvis/OpenJarvis/blob/c6c782b924c9040d7c35f76ff693d4057bc0032f/src/openjarvis/agents/loop_guard.py
 * Copyright 2025 The OpenJarvis Authors; licensed under Apache-2.0.
 * See third_party/licenses/openjarvis-Apache-2.0.txt.
 * JARVIS changes: JS port, short in-memory expiry, bounded storage, and
 * application only to repeated browser actions. Alternating-cycle detection
 * compares complete call signatures rather than tool names alone. No call
 * arguments are logged.
 */
function stableJson(value, state = { nodes: 2048, characters: 32_768 }, depth = 0) {
  if (depth > 24 || --state.nodes < 0) return null;
  let encoded;
  if (Array.isArray(value)) {
    const items = [];
    for (const valueItem of value) {
      const item = stableJson(valueItem, state, depth + 1);
      if (item === null) return null;
      items.push(item);
    }
    encoded = `[${items.join(',')}]`;
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    if (keys.length > 1024) return null;
    const fields = [];
    for (const key of keys) {
      const item = stableJson(value[key], state, depth + 1);
      if (item === null) return null;
      fields.push(`${JSON.stringify(key)}:${item}`);
    }
    encoded = `{${fields.join(',')}}`;
  }
  if (encoded === undefined) encoded = JSON.stringify(value) ?? 'null';
  if (encoded.length > state.characters) return null;
  state.characters -= encoded.length;
  return encoded;
}

export class BrowserActionLoopGuard {
  #calls = new Map();
  #recentCalls = [];
  #warnedCycles = new Map();

  constructor({ maxIdenticalCalls = 3, windowMs = 30_000, maxEntries = 256 } = {}) {
    this.maxIdenticalCalls = Math.max(1, Math.min(10, Math.floor(Number(maxIdenticalCalls) || 3)));
    this.windowMs = Math.max(1_000, Math.min(5 * 60_000, Math.floor(Number(windowMs) || 30_000)));
    this.maxEntries = Math.max(16, Math.min(2_048, Math.floor(Number(maxEntries) || 256)));
  }

  checkCall(toolName, argumentsValue, now = Date.now()) {
    const name = String(toolName || '').slice(0, 100);
    if (!name) return { blocked: false, warned: false, reason: '' };
    const timestamp = Number.isFinite(now) && now >= 0 ? now : Date.now();
    const canonicalArguments = stableJson(argumentsValue);
    // Large/deep arguments are passed through; do not turn a lossy fingerprint
    // into a false-positive action block or spend unbounded time hashing it.
    if (canonicalArguments === null) return { blocked: false, warned: false, reason: '' };
    const signature = createHash('sha256').update(`${name}:${canonicalArguments}`).digest('hex');
    const lastRecent = this.#recentCalls.at(-1);
    if (lastRecent && (timestamp < lastRecent.at || timestamp - lastRecent.at >= this.windowMs)) {
      this.#recentCalls = [];
      this.#warnedCycles.clear();
    }
    this.#recentCalls.push({ signature, at: timestamp });
    if (this.#recentCalls.length > 6) this.#recentCalls.shift();

    // OpenJarvis LoopGuard also detects A-B-A-B action cycles. JARVIS only
    // considers an exact pair of canonical tool+argument signatures, warns
    // after two rounds, and blocks after three rounds. Ordinary navigation
    // between different pages therefore does not look like a loop.
    const recent = this.#recentCalls;
    const withinWarningWindow = recent.length >= 4
      && recent.at(-1).at - recent.at(-4).at < this.windowMs;
    const alternatingPair = withinWarningWindow
      && recent.at(-4).signature === recent.at(-2).signature
      && recent.at(-3).signature === recent.at(-1).signature
      && recent.at(-4).signature !== recent.at(-3).signature;
    const repeatedPair = recent.length === 6
      && recent.at(-1).at - recent[0].at < this.windowMs
      && recent[0].signature === recent[2].signature
      && recent[1].signature === recent[3].signature
      && recent[0].signature === recent[4].signature
      && recent[1].signature === recent[5].signature
      && recent[0].signature !== recent[1].signature;

    let cycleWarning = false;
    if (alternatingPair) {
      const pairKey = [recent.at(-4).signature, recent.at(-3).signature].sort().join(':');
      const warnedAt = this.#warnedCycles.get(pairKey);
      if (warnedAt === undefined || timestamp - warnedAt >= this.windowMs) {
        if (this.#warnedCycles.size >= this.maxEntries) {
          const oldest = [...this.#warnedCycles.entries()].reduce((a, b) => a[1] <= b[1] ? a : b)[0];
          this.#warnedCycles.delete(oldest);
        }
        this.#warnedCycles.set(pairKey, timestamp);
        cycleWarning = true;
      }
    }

    if (repeatedPair) {
      return {
        blocked: true,
        warned: false,
        reason: 'JARVIS stopped a two-action browser cycle after three identical rounds.'
      };
    }

    const previous = this.#calls.get(signature);
    const count = previous && timestamp >= previous.lastAt && timestamp - previous.lastAt < this.windowMs ? previous.count + 1 : 1;

    if (this.#calls.size >= this.maxEntries && !previous) {
      for (const [key, item] of this.#calls) {
        if (timestamp - item.lastAt >= this.windowMs) this.#calls.delete(key);
      }
      if (this.#calls.size >= this.maxEntries) {
        const oldest = [...this.#calls.entries()].reduce((a, b) => a[1].lastAt <= b[1].lastAt ? a : b)[0];
        this.#calls.delete(oldest);
      }
    }

    this.#calls.set(signature, { count: Math.min(count, this.maxIdenticalCalls + 1), lastAt: timestamp });
    if (count > this.maxIdenticalCalls) {
      return {
        blocked: true,
        warned: false,
        reason: `JARVIS stopped the same browser action after ${this.maxIdenticalCalls} repeats within ${Math.ceil(this.windowMs / 1000)} seconds.`
      };
    }
    return {
      blocked: false,
      warned: count === this.maxIdenticalCalls || cycleWarning,
      reason: count === this.maxIdenticalCalls
        ? 'If repeated again, this identical browser action will be stopped.'
        : cycleWarning
          ? 'If this same two-action browser cycle repeats once more, JARVIS will stop it.'
          : ''
    };
  }

  reset() {
    this.#calls.clear();
    this.#recentCalls = [];
    this.#warnedCycles.clear();
  }
}

export function guardBrowserToolRequest(payload, guard, guardedTools) {
  const name = String(payload?.params?.name || '');
  if (payload?.method !== 'tools/call' || !guardedTools?.has?.(name)) return null;
  const verdict = guard.checkCall(name, payload.params?.arguments || {});
  return {
    tracked: true,
    ...verdict,
    localResponse: verdict.blocked ? {
      jsonrpc: '2.0',
      id: payload.id,
      result: { isError: true, content: [{ type: 'text', text: verdict.reason }] }
    } : null
  };
}
