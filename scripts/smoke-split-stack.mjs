import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-split-smoke-'));
const dotenvPath = path.join(temporaryRoot, 'empty.env');
await fs.writeFile(dotenvPath, '', { flag: 'wx' });

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const ports = {};
for (const key of ['dashboard', 'api', 'settings', 'camera', 'mic']) {
  let candidate;
  do { candidate = await freePort(); } while (Object.values(ports).includes(candidate));
  ports[key] = candidate;
}

const token = crypto.randomBytes(32).toString('hex');
const dashboardPin = crypto.randomBytes(24).toString('base64url');
const dataDirectory = path.join(temporaryRoot, 'data');
const inheritedEnvKeys = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'ComSpec', 'PATHEXT'];
const childEnv = Object.fromEntries(inheritedEnvKeys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
Object.assign(childEnv, {
  DOTENV_CONFIG_PATH: dotenvPath,
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: String(ports.dashboard),
  API_HOST: '127.0.0.1',
  API_PORT: String(ports.api),
  JARVIS_SETTINGS_BACKEND_PORT: String(ports.settings),
  JARVIS_CAMERA_BACKEND_PORT: String(ports.camera),
  JARVIS_MIC_BACKEND_PORT: String(ports.mic),
  JARVIS_INTERNAL_SERVICE_TOKEN: token,
  DASHBOARD_ACCESS_PIN: dashboardPin,
  TRUSTED_DASHBOARD_PROXY_IPS: '',
  JARVIS_DATA_DIR: dataDirectory,
  ENABLE_PI_WAKE_LISTENER: 'false',
  OPENJARVIS_BASE_URL: 'http://127.0.0.1:1',
  OLLAMA_BASE_URL: 'http://127.0.0.1:1'
});

const stack = spawn(process.execPath, [path.join(root, 'scripts', 'start-split-stack.mjs')], {
  cwd: root,
  env: childEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let output = '';
const keepTail = (chunk) => { output = (output + chunk.toString()).slice(-12_000); };
stack.stdout.on('data', keepTail);
stack.stderr.on('data', keepTail);
const exited = new Promise((resolve) => stack.once('exit', (code, signal) => resolve({ code, signal })));

async function waitForJson(url, timeoutMs = 25_000, options = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';
  while (Date.now() < deadline) {
    if (stack.exitCode !== null || stack.signalCode) throw new Error(`Stack exited before readiness (${stack.signalCode || stack.exitCode}).\n${output}`);
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(900) });
      const body = await response.json();
      if (response.ok && body.status === 'ok') return body;
      lastError = `HTTP ${response.status}: ${JSON.stringify(body)}`;
    } catch (error) { lastError = error.message || 'request failed'; }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}\n${output}`);
}

async function getJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(4000) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function stopStack() {
  if (stack.exitCode !== null || stack.signalCode) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/PID', String(stack.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.once('error', resolve);
      killer.once('exit', resolve);
    });
  } else {
    stack.kill('SIGTERM');
  }
  const stopped = await Promise.race([exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 5000))]);
  if (!stopped) stack.kill('SIGKILL');
}

try {
  const frontendUrl = `http://127.0.0.1:${ports.dashboard}`;
  const apiUrl = `http://127.0.0.1:${ports.api}`;
  const backendUrls = {
    settings: `http://127.0.0.1:${ports.settings}`,
    camera: `http://127.0.0.1:${ports.camera}`,
    mic: `http://127.0.0.1:${ports.mic}`
  };

  await waitForJson(`${frontendUrl}/health`);
  for (const [name, url] of Object.entries(backendUrls)) await waitForJson(`${url}/health`);
  const login = await getJson(`${frontendUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ pin: dashboardPin })
  });
  assert.equal(login.response.status, 200, 'dashboard login must work through the front-end proxy');
  const setCookie = login.response.headers.get('set-cookie') || '';
  const dashboardCookie = setCookie.split(';')[0];
  assert.match(setCookie, /HttpOnly/i, 'dashboard session cookie must remain HttpOnly');
  assert.doesNotMatch(setCookie, /;\s*Secure(?:;|$)/i, 'untrusted forwarded HTTPS must not set the Secure cookie flag');
  assert.ok(dashboardCookie.startsWith('jarvis_session='), 'front end must preserve the dashboard session cookie');
  const sessionHeaders = { Cookie: dashboardCookie };

  const apiHealth = await waitForJson(`${apiUrl}/api/health`, 25_000, { headers: sessionHeaders });
  assert.equal(apiHealth.backends.settings.status, 'ok');
  assert.equal(apiHealth.backends.camera.status, 'ok');
  assert.equal(apiHealth.backends.microphone.status, 'ok');

  const settingsPath = `${backendUrls.settings}/settings`;
  const unauthenticated = await getJson(settingsPath);
  assert.equal(unauthenticated.response.status, 401, 'settings backend must reject unauthenticated access');
  const authorization = { Authorization: `Bearer ${token}` };
  let stored = await getJson(settingsPath, { headers: authorization });
  assert.equal(stored.response.status, 200);
  assert.equal(stored.body.source, 'browser', 'core startup should persist validated defaults through the settings backend');

  const update = await getJson(settingsPath, {
    method: 'PUT',
    headers: { ...authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ smokeCheck: 'settings-write-read' })
  });
  assert.equal(update.response.status, 200);
  stored = await getJson(settingsPath, { headers: authorization });
  assert.equal(stored.body.smokeCheck, 'settings-write-read');

  const media = await getJson(`${apiUrl}/api/media/devices`, { headers: sessionHeaders });
  assert.equal(media.response.status, 200, `core API must proxy local device inventories: ${JSON.stringify(media.body)}`);
  const apiSettings = await getJson(`${apiUrl}/api/settings`, { headers: sessionHeaders });
  assert.equal(apiSettings.response.status, 200);
  const savedThroughApi = await getJson(`${apiUrl}/api/settings`, {
    method: 'PUT',
    headers: { ...sessionHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ wakeResponse: 'split backend smoke check' })
  });
  assert.equal(savedThroughApi.response.status, 200, `core API must persist settings through its backend: ${JSON.stringify(savedThroughApi.body)}`);
  stored = await getJson(settingsPath, { headers: authorization });
  assert.equal(stored.body.wakeResponse, 'split backend smoke check');

  console.log('Split-stack smoke passed: 5 processes ready; dashboard login/session cookies, forwarded-HTTPS spoof rejection, local backends, settings persistence, media proxy, and core settings round-trip all succeeded.');
} finally {
  await stopStack();
  const resolvedTemp = path.resolve(temporaryRoot);
  const resolvedOsTemp = path.resolve(os.tmpdir());
  assert.ok(resolvedTemp.startsWith(resolvedOsTemp + path.sep), 'refusing to remove a path outside the temporary directory');
  await fs.rm(resolvedTemp, { recursive: true, force: true });
}
