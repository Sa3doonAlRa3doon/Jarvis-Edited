import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SerializedPrivateFile } from '../lib/private-file-writer.mjs';

test('serializes atomic private writes in invocation order', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-private-writer-'));
  const file = path.join(root, 'state.json');
  try {
    const writer = new SerializedPrivateFile(file);
    await Promise.all(Array.from({ length: 30 }, (_, index) => writer.write(`${JSON.stringify({ index, value: 'x'.repeat(500) })}\n`)));
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { index: 29, value: 'x'.repeat(500) });
    assert.deepEqual((await fs.readdir(root)).sort(), ['state.json']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
