import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform === 'win32') {
  console.error('JARVIS PI ACCEPTANCE must run on the Raspberry Pi or an Ubuntu/Linux host. Use SSH to the Pi, then run npm run smoke:pi there.');
  process.exitCode = 2;
} else {
  const result = spawnSync('bash', [path.join(project, 'scripts', 'pi-smoke.sh'), ...process.argv.slice(2)], { cwd: project, stdio: 'inherit' });
  process.exitCode = result.error ? 1 : (result.status ?? 1);
}

