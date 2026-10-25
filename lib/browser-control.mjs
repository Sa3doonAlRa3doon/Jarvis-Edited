import crypto from 'node:crypto';

const BROWSER_NOUN = /\b(?:browser|website|webpage|site|tab|chrome|chromium|edge|firefox|portal|dashboard|gmail|google|youtube|github|reddit|instagram|discord)\b/i;
const CONTROL_VERB = /\b(?:click|tap|type|fill|select|choose|press|scroll|drag|log\s*in|sign\s*in|download|interact|control|use)\b/i;
const SEQUENCE = /\b(?:then|after that|next)\b/i;
const WEB_ADDRESS = /(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9][a-z0-9.-]+\.(?:com|org|net|io|ai|dev|app|co|ae|edu|gov)(?:\/[^\s]*)?/i;

function clean(value, limit = 6000) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, limit);
}

export function interactiveBrowserIntent(prompt) {
  const text = clean(prompt);
  if (!text || !(BROWSER_NOUN.test(text) || WEB_ADDRESS.test(text))) return false;
  return CONTROL_VERB.test(text) || SEQUENCE.test(text) || /\bgo\s+to\b[\s\S]{0,200}\band\b/i.test(text);
}

export function restrictedBrowserIntent(prompt) {
  const text = clean(prompt);
  if (/\b(?:password|passcode|one[- ]time code|otp|two[- ]factor|2fa|api key|secret key|credit card|debit card|cvv|bank account|passport|social security)\b/i.test(text)) return 'secrets-or-sensitive-data';
  if (/\b(?:buy|purchase|checkout|pay|transfer money|subscribe)\b/i.test(text)) return 'financial-action';
  if (/\b(?:delete|remove|erase|cancel account|change permissions?|share access|upload)\b/i.test(text)) return 'destructive-or-sharing-action';
  if (/\b(?:send|post|publish|submit|comment|reply|message|dm)\b/i.test(text)) return 'external-communication';
  return '';
}

export class BrowserControlStore {
  constructor({ ttlMs = 10 * 60_000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.requests = new Map();
    this.grants = new Map();
  }

  prune() {
    const now = this.now();
    for (const [id, item] of this.requests) if (item.expiresAtMs <= now || item.claimed) this.requests.delete(id);
    for (const [token, item] of this.grants) if (item.expiresAtMs <= now || item.claimed) this.grants.delete(token);
  }

  create(prompt) {
    this.prune();
    const task = clean(prompt);
    if (!task) throw new Error('Browser-control task is empty.');
    const id = crypto.randomUUID();
    const expiresAtMs = this.now() + this.ttlMs;
    this.requests.set(id, { id, task, expiresAtMs, claimed: false });
    return { id, task, expiresAt: new Date(expiresAtMs).toISOString(), confirmation: 'ALLOW BROWSER CONTROL' };
  }

  approve(id) {
    this.prune();
    const request = this.requests.get(String(id || ''));
    if (!request || request.claimed || request.expiresAtMs <= this.now()) throw new Error('This browser-control request expired or was already used.');
    request.claimed = true;
    this.requests.delete(request.id);
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAtMs = this.now() + this.ttlMs;
    this.grants.set(token, { task: request.task, expiresAtMs, claimed: false });
    return { token, task: request.task, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  claim(token, prompt) {
    this.prune();
    const key = String(token || '');
    const grant = this.grants.get(key);
    const task = clean(prompt);
    if (!grant || grant.claimed || grant.expiresAtMs <= this.now() || grant.task !== task) throw new Error('Browser-control approval is missing, expired, or does not match this exact task.');
    grant.claimed = true;
    this.grants.delete(key);
    return { task, approved: true };
  }
}
