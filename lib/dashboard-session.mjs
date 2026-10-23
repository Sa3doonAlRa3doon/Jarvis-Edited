import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_TTL_MS = 12 * 60 * 60_000;

function sessionSignature(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export async function loadDashboardSessionSecret(dataDirectory, configuredSecret = '') {
  const secretPath = path.join(dataDirectory, '.dashboard-session-secret');
  await fs.mkdir(dataDirectory, { recursive: true });
  let material = String(configuredSecret || '').trim();
  if (!material) {
    try { material = (await fs.readFile(secretPath, 'utf8')).trim(); }
    catch {
      material = crypto.randomBytes(48).toString('base64url');
      await fs.writeFile(secretPath, `${material}\n`, { mode: 0o600 });
    }
  }
  if (material.length < 32) throw new Error('Dashboard session secret is too short.');
  return crypto.createHash('sha256').update(material).digest();
}

export function issueDashboardSession(secret, { now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!secret) throw new Error('Dashboard session secret is unavailable.');
  const issuedAt = Math.floor(now);
  const expiresAt = issuedAt + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
  const payload = `${issuedAt}.${expiresAt}.${crypto.randomBytes(18).toString('base64url')}`;
  return `${payload}.${sessionSignature(secret, payload)}`;
}

export function verifyDashboardSession(token, secret, { now = Date.now(), maxTtlMs = DEFAULT_TTL_MS + 5 * 60_000 } = {}) {
  if (!token || !secret) return false;
  const parts = String(token).split('.');
  if (parts.length !== 4) return false;
  const [issuedText, expiresText, nonce, supplied] = parts;
  const issuedAt = Number(issuedText); const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || nonce.length < 16) return false;
  if (issuedAt > now + 60_000 || expiresAt <= now || expiresAt - issuedAt > maxTtlMs) return false;
  const payload = `${issuedText}.${expiresText}.${nonce}`;
  const expected = sessionSignature(secret, payload);
  const left = Buffer.from(supplied); const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
