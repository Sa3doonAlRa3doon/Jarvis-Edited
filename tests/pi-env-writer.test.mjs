import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import dotenv from 'dotenv';

const execute = promisify(execFile);
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

for (const source of ['install-pi.sh', 'scripts/setup-openjarvis-pi.sh']) {
  test(`${source} preserves the last private value when appending to an unterminated env file`, async (t) => {
    try { await execute(bash, ['--version']); } catch { t.skip('Bash is unavailable on this host.'); return; }
    const code = await fs.readFile(new URL(`../${source}`, import.meta.url), 'utf8');
    const definition = code.match(/^set_env_value\(\) \{[\s\S]*?^\}/m)?.[0];
    assert.ok(definition, 'installer env writer was not found');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-env-writer-'));
    t.after(async () => {
      assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
      await fs.rm(directory, { recursive: true, force: true });
    });
    await fs.writeFile(path.join(directory, '.env'), 'GOOGLE_CLIENT_SECRET=fixture-private-value');
    await execute(bash, ['-c', `ENV_FILE=.env\n${definition}\nset_env_value JARVIS_INTERNAL_SERVICE_TOKEN fixture-internal-value\nset_env_value JARVIS_SETTINGS_BACKEND_PORT 8789\n`], { cwd: directory });
    const raw = await fs.readFile(path.join(directory, '.env'), 'utf8');
    const saved = dotenv.parse(raw);
    assert.equal(saved.GOOGLE_CLIENT_SECRET, 'fixture-private-value');
    assert.equal(saved.JARVIS_INTERNAL_SERVICE_TOKEN, 'fixture-internal-value');
    assert.equal(saved.JARVIS_SETTINGS_BACKEND_PORT, '8789');
    assert.equal(raw.endsWith('\n'), true);
  });

  test(`${source} safely replaces special characters and rejects multiline env values`, async (t) => {
    try { await execute(bash, ['--version']); } catch { t.skip('Bash is unavailable on this host.'); return; }
    const code = await fs.readFile(new URL(`../${source}`, import.meta.url), 'utf8');
    const definition = code.match(/^set_env_value\(\) \{[\s\S]*?^\}/m)?.[0];
    assert.ok(definition, 'installer env writer was not found');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-env-writer-'));
    t.after(async () => {
      assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
      await fs.rm(directory, { recursive: true, force: true });
    });
    await fs.writeFile(path.join(directory, '.env'), 'GOOGLE_CLIENT_SECRET=old-value\n');
    const environment = { ...process.env, SPECIAL_VALUE: 'fixture&A|B\\C', MULTILINE_VALUE: 'first\nsecond' };
    await execute(bash, ['-c', `ENV_FILE=.env\n${definition}\nset_env_value GOOGLE_CLIENT_SECRET "$SPECIAL_VALUE"\nif set_env_value GOOGLE_CLIENT_SECRET "$MULTILINE_VALUE"; then exit 9; fi\n`], { cwd: directory, env: environment });
    const raw = await fs.readFile(path.join(directory, '.env'), 'utf8');
    const saved = dotenv.parse(raw);
    assert.equal(saved.GOOGLE_CLIENT_SECRET, environment.SPECIAL_VALUE);
    assert.equal(raw.includes('second'), false);
  });
}
