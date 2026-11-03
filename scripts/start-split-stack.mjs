import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const children = new Map();
let shuttingDown = false;
const ports = {
  settings: Number(process.env.JARVIS_SETTINGS_BACKEND_PORT || 8789),
  camera: Number(process.env.JARVIS_CAMERA_BACKEND_PORT || 8790),
  microphone: Number(process.env.JARVIS_MIC_BACKEND_PORT || 8791),
  api: Number(process.env.API_PORT || 8788),
  dashboard: Number(process.env.PORT || 8787)
};

if (!process.env.JARVIS_INTERNAL_SERVICE_TOKEN) {
  process.env.JARVIS_INTERNAL_SERVICE_TOKEN = crypto.randomBytes(32).toString('hex');
  console.log('Generated a private in-memory token for this local JARVIS run.');
}

function start(label, entry, overrides = {}) {
  const child = spawn(process.execPath, [path.join(root, entry)], {
    cwd: root,
    env: { ...process.env, ...overrides },
    stdio: 'inherit',
    windowsHide: true
  });
  children.set(label, child);
  child.once('error', (error) => {
    console.error(`Could not start JARVIS ${label}: ${error.message}`);
    void shutdown(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(label);
    if (!shuttingDown) {
      console.error(`JARVIS ${label} stopped (${signal || code || 'unknown'}); stopping the local stack.`);
      void shutdown(code || 1);
    }
  });
  return child;
}

async function waitForHealth(label, port, child, healthPath = '/health', timeoutMs = 12_000) {
  const url = `http://127.0.0.1:${port}${healthPath}`;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';
  while (Date.now() < deadline && !shuttingDown) {
    if (child.exitCode !== null || child.signalCode) throw new Error(`JARVIS ${label} exited before becoming healthy.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(900) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.status === 'ok') return;
      lastError = payload.error || `HTTP ${response.status}`;
    } catch (error) { lastError = error.message || 'not ready'; }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`JARVIS ${label} did not become healthy at ${url}: ${lastError}`);
}

async function launch(label, entry, port, overrides = {}, healthPath = '/health') {
  const child = start(label, entry, overrides);
  await waitForHealth(label, port, child, healthPath);
  console.log(`JARVIS ${label} ready on 127.0.0.1:${port}.`);
  return child;
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) child.kill('SIGTERM');
  const deadline = Date.now() + 4_000;
  while (children.size && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  for (const child of children.values()) child.kill('SIGKILL');
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

try {
  await launch('settings backend', 'settings-service.mjs', ports.settings);
  await launch('camera backend', 'camera-service.mjs', ports.camera);
  await launch('microphone backend', 'mic-service.mjs', ports.microphone);
  await launch('core API', 'server.mjs', ports.api, {
    JARVIS_API_ONLY: '1',
    JARVIS_SETTINGS_BACKEND_URL: `http://127.0.0.1:${ports.settings}`,
    JARVIS_CAMERA_BACKEND_URL: `http://127.0.0.1:${ports.camera}`,
    JARVIS_MIC_BACKEND_URL: `http://127.0.0.1:${ports.microphone}`
  }, '/api/health');
  await launch('dashboard front end', 'frontend.mjs', ports.dashboard, { JARVIS_API_ONLY: '0' });
  console.log(`JARVIS is ready at http://127.0.0.1:${ports.dashboard}/ (API: 127.0.0.1:${ports.api}).`);
} catch (error) {
  console.error(error.message || error);
  await shutdown(1);
}
