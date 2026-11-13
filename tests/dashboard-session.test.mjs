import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { issueDashboardSession, loadDashboardSessionSecret, verifyDashboardSession } from '../lib/dashboard-session.mjs';

test('signed dashboard sessions survive a process restart', () => {
  const persistedSecret = crypto.randomBytes(32);
  const token = issueDashboardSession(persistedSecret, { now: 10_000, ttlMs: 60_000 });
  const reloadedSecret = Buffer.from(persistedSecret);
  assert.equal(verifyDashboardSession(token, reloadedSecret, { now: 20_000 }), true);
});

test('rejects expired and tampered dashboard sessions', () => {
  const secret = crypto.randomBytes(32);
  const token = issueDashboardSession(secret, { now: 10_000, ttlMs: 60_000 });
  assert.equal(verifyDashboardSession(token, secret, { now: 80_000 }), false);
  assert.equal(verifyDashboardSession(`${token.slice(0, -1)}x`, secret, { now: 20_000 }), false);
});

test('concurrent first starts converge on one persisted dashboard secret', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-dashboard-secret-'));
  try {
    const secrets = await Promise.all(Array.from({ length: 20 }, () => loadDashboardSessionSecret(directory)));
    assert.equal(new Set(secrets.map((secret) => secret.toString('hex'))).size, 1);
    const persisted = await loadDashboardSessionSecret(directory);
    assert.equal(persisted.equals(secrets[0]), true);
    const files = await fs.readdir(directory);
    assert.deepEqual(files, ['.dashboard-session-secret']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
