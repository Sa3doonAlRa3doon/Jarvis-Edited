import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadOrCreatePrivateSecret } from '../lib/private-secret.mjs';

test('concurrent creators converge on one complete private secret', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-private-secret-'));
  const target = path.join(directory, 'secret');
  try {
    const values = await Promise.all(Array.from({ length: 30 }, () => loadOrCreatePrivateSecret(target)));
    assert.equal(new Set(values).size, 1);
    assert.equal((await fs.readFile(target, 'utf8')).trim(), values[0]);
    assert.deepEqual(await fs.readdir(directory), ['secret']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('refuses a private secret symlink instead of reading or chmodding its target', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-private-secret-link-'));
  const outside = path.join(directory, 'outside');
  const linked = path.join(directory, 'linked');
  try {
    await fs.writeFile(outside, `${'a'.repeat(48)}\n`);
    try { await fs.symlink(outside, linked, 'file'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) { context.skip(`file symlinks unavailable: ${error.code}`); return; }
      throw error;
    }
    await assert.rejects(() => loadOrCreatePrivateSecret(linked), /cannot be a link/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('refuses a multiply linked private secret', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-private-secret-hardlink-'));
  const first = path.join(directory, 'first');
  const second = path.join(directory, 'second');
  try {
    await fs.writeFile(first, `${'b'.repeat(48)}\n`);
    await fs.link(first, second);
    await assert.rejects(() => loadOrCreatePrivateSecret(second), /one regular file/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
