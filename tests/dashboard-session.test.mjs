import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { issueDashboardSession, verifyDashboardSession } from '../lib/dashboard-session.mjs';

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
