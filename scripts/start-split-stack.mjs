import { spawn } from 'node:child_process';

const children = new Set();
let shuttingDown = false;

function start(label, entry, overrides = {}) {
  const child = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    env: { ...process.env, ...overrides },
    stdio: 'inherit',
    windowsHide: true
  });
  children.add(child);
  child.once('error', (error) => {
    console.error(`Could not start JARVIS ${label}: ${error.message}`);
    void shutdown(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`JARVIS ${label} stopped (${signal || code || 'unknown'}); stopping the split stack.`);
      void shutdown(code || 1);
    }
  });
  return child;
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  const deadline = Date.now() + 3_000;
  while (children.size && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  for (const child of children) child.kill('SIGKILL');
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
start('back end', 'server.mjs', { JARVIS_API_ONLY: '1' });
start('front end', 'frontend.mjs', { JARVIS_API_ONLY: '0' });
