import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GoogleWorkspaceBridge } from '../lib/google-workspace.mjs';
import { readPrivateJsonFile } from '../lib/private-json-file.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-private-json-'));
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(directory, { force: true, recursive: true });
  });
  return directory;
}

test('reads one private regular JSON file', async (t) => {
  const directory = await fixture(t);
  const file = path.join(directory, 'token.json');
  await fs.writeFile(file, JSON.stringify({ client_id: 'fixture-client' }), { mode: 0o600 });
  assert.deepEqual(await readPrivateJsonFile(file), { client_id: 'fixture-client' });
});

test('rejects a Google JSON file readable by group or other users', async (t) => {
  if (process.platform === 'win32') return t.skip('Windows does not expose POSIX file modes');
  const directory = await fixture(t);
  const file = path.join(directory, 'token.json');
  await fs.writeFile(file, JSON.stringify({ refresh_token: 'private-refresh' }), { mode: 0o644 });
  await fs.chmod(file, 0o644);
  await assert.rejects(() => readPrivateJsonFile(file), { code: 'EPRIVATEFILE', message: /group or other users/i });
});

test('rejects a private JSON symlink without reading its target', async (t) => {
  if (process.platform === 'win32') return t.skip('Windows test hosts may not grant symlink privilege');
  const directory = await fixture(t);
  const target = path.join(directory, 'target.json');
  const link = path.join(directory, 'token.json');
  await fs.writeFile(target, JSON.stringify({ refresh_token: 'private-refresh' }), { mode: 0o600 });
  await fs.symlink(target, link);
  await assert.rejects(() => readPrivateJsonFile(link), { code: 'EPRIVATEFILE', message: /cannot be a link/i });
});

test('rejects a multiply linked JSON token and does not fall back to another token', async (t) => {
  const directory = await fixture(t);
  const source = path.join(directory, 'source.json');
  const tokenPath = path.join(directory, 'token.json');
  await fs.writeFile(source, JSON.stringify({ client_id: 'fixture-client', refresh_token: 'private-refresh' }), { mode: 0o600 });
  try {
    await fs.link(source, tokenPath);
  } catch (error) {
    if (['EPERM', 'ENOTSUP', 'EACCES'].includes(error?.code)) return t.skip(`Hard links unavailable: ${error.code}`);
    throw error;
  }
  const bridge = new GoogleWorkspaceBridge({
    environment: {
      GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret',
      GOOGLE_TOKEN_PATH: tokenPath, GOOGLE_AUTH_DIRECTORY: directory
    },
    home: directory,
    fetchImpl: async () => { throw new Error('unsafe token must not reach the network'); }
  });
  await assert.rejects(() => bridge.loadConfiguration(), { code: 'EPRIVATEFILE', message: /cannot be a link/i });
});
