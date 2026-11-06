import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildServiceEnvironment, serializeSystemdEnvironment } from '../lib/service-environments.mjs';

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const source = {
  JARVIS_INTERNAL_SERVICE_TOKEN: 'fixture-internal',
  JARVIS_MIC_BACKEND_PORT: '8791',
  API_PORT: '8788',
  WAKE_PYTHON: '/opt/jarvis wake/python',
  GOOGLE_CLIENT_SECRET: 'must-not-leak',
  GOOGLE_TOKEN_PATH: '/private/token.json',
  FISH_AUDIO_API_KEY: 'must-not-leak',
  OPS_CONTROL_PIN: 'must-not-leak',
  DASHBOARD_ACCESS_PIN: 'must-not-leak'
};

test('microphone service receives only its required local variables', () => {
  const result = buildServiceEnvironment(source, 'microphone');
  assert.deepEqual(result, {
    JARVIS_INTERNAL_SERVICE_TOKEN: 'fixture-internal',
    JARVIS_MIC_BACKEND_PORT: '8791',
    API_PORT: '8788',
    WAKE_PYTHON: '/opt/jarvis wake/python'
  });
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
});

test('camera, settings and frontend environments never inherit integration secrets', () => {
  for (const service of ['camera', 'settings', 'frontend']) {
    const result = buildServiceEnvironment(source, service);
    for (const forbidden of ['GOOGLE_CLIENT_SECRET', 'GOOGLE_TOKEN_PATH', 'FISH_AUDIO_API_KEY', 'OPS_CONTROL_PIN', 'DASHBOARD_ACCESS_PIN']) {
      assert.equal(Object.hasOwn(result, forbidden), false, `${service} inherited ${forbidden}`);
    }
  }
});

test('systemd environment serialization quotes spaces and rejects multiline values', () => {
  assert.equal(serializeSystemdEnvironment({ WAKE_PYTHON: '/opt/jarvis wake/python' }), 'WAKE_PYTHON="/opt/jarvis wake/python"\n');
  assert.throws(() => serializeSystemdEnvironment({ WAKE_PYTHON: 'first\nsecond' }), /forbidden control character/i);
  assert.throws(() => buildServiceEnvironment(source, 'unknown'), /unknown JARVIS service/i);
});

test('service environment writer creates private files without integration secrets', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-service-env-'));
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const sourceFile = path.join(directory, '.env');
  const outputDirectory = path.join(directory, 'output');
  await fs.writeFile(sourceFile, Object.entries(source).map(([key, value]) => `${key}=${value}`).join('\n'));
  await execute(process.execPath, ['scripts/write-service-environments.mjs', '--source', sourceFile, '--output', outputDirectory], {
    cwd: repository
  });
  const files = (await fs.readdir(outputDirectory)).sort();
  assert.deepEqual(files, ['camera.env', 'frontend.env', 'microphone.env', 'settings.env']);
  for (const file of files) {
    const target = path.join(outputDirectory, file);
    const content = await fs.readFile(target, 'utf8');
    assert.doesNotMatch(content, /must-not-leak|GOOGLE_|FISH_AUDIO|CONTROL_PIN/);
    if (process.platform !== 'win32') assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
  }
});
