import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
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
  for (const asset of ['/app.js', '/styles.css']) {
    const fresh = await fetch(frontendUrl + asset);
    assert.equal(fresh.status, 200); assert.equal(fresh.headers.get('cache-control'), 'no-cache');
    const etag = fresh.headers.get('etag'); assert.ok(etag, 'unchanged application assets keep ETag validation');
    await fresh.arrayBuffer();
    // fetch adds a request no-cache directive to conditional requests; use a
    // plain HTTP client here to exercise the browser cache-validator exchange.
    const unchanged = await new Promise((resolve, reject) => {
      http.get(frontendUrl + asset, { headers: { 'If-None-Match': etag }, signal: AbortSignal.timeout(3000) }, (response) => {
        response.resume(); response.once('end', () => resolve({ status: response.statusCode, cache: response.headers['cache-control'] }));
      }).once('error', reject);
    });
    assert.equal(unchanged.status, 304); assert.equal(unchanged.cache, 'no-cache');
  }

  const apiHealth = await waitForJson(`${apiUrl}/api/health`, 25_000, { headers: sessionHeaders });
  assert.equal(apiHealth.backends.settings.status, 'ok');
  assert.equal(apiHealth.backends.camera.status, 'ok');
  assert.equal(apiHealth.backends.microphone.status, 'ok');

  const settingsPath = `${backendUrls.settings}/settings`;
  const unauthenticated = await getJson(settingsPath);
  assert.equal(unauthenticated.response.status, 401, 'settings backend must reject unauthenticated access');
  const authorization = { Authorization: `Bearer ${token}` };
  const anonymousAck = await getJson(`${backendUrls.mic}/command/acknowledge`, { method: 'POST' });
  assert.equal(anonymousAck.response.status, 401, 'mic acknowledgement control requires internal service authentication');
  const idleBackendAck = await getJson(`${backendUrls.mic}/command/acknowledge`, { method: 'POST', headers: authorization });
  assert.equal(idleBackendAck.response.status, 409, 'mic backend refuses acknowledgement without a waiting native capture');
  const idleDashboardAck = await getJson(`${frontendUrl}/api/wake/acknowledged`, { method: 'POST', headers: sessionHeaders });
  assert.equal(idleDashboardAck.response.status, 409, 'dashboard acknowledgement proxy preserves the waiting-capture boundary');
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

  const config = await getJson(`${frontendUrl}/api/config`, { headers: sessionHeaders });
  assert.equal(config.response.status, 200);
  const ttsRequest = { method: 'POST', headers: { ...sessionHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Split stack speech check.', mode: 'local' }) };
  const anonymousSpeech = await fetch(`${frontendUrl}/api/tts`, { ...ttsRequest, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(3000) });
  assert.equal(anonymousSpeech.status, 401, 'speech generation requires a dashboard session');
  const speech = await fetch(`${frontendUrl}/api/tts`, { ...ttsRequest, signal: AbortSignal.timeout(20_000) });
  if (config.body.localSpeech?.available) {
    assert.equal(speech.status, 200); assert.match(speech.headers.get('content-type') || '', /^audio\/wav/);
    assert.equal(speech.headers.get('x-jarvis-tts-provider'), 'espeak');
    assert.match(speech.headers.get('cache-control') || '', /no-store/);
    const wav = Buffer.from(await speech.arrayBuffer()); assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.ok(wav.length > 44);
  } else {
    assert.equal(speech.status, 503); assert.match((await speech.json()).error, /Offline Pi speech is unavailable/);
  }

  const directLogin = await getJson(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', 'X-Jarvis-Proxy-Token': 'caller-spoof', 'X-Jarvis-Client-Address': '203.0.113.8' },
    body: JSON.stringify({ pin: dashboardPin })
  });
  assert.equal(directLogin.response.status, 200);
  assert.doesNotMatch(directLogin.response.headers.get('set-cookie') || '', /;\s*Secure(?:;|$)/i, 'unauthenticated loopback callers cannot assert forwarded HTTPS');
  const trustedLogin = await getJson(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', 'X-Jarvis-Proxy-Token': token, 'X-Jarvis-Client-Address': '203.0.113.8' },
    body: JSON.stringify({ pin: dashboardPin })
  });
  assert.equal(trustedLogin.response.status, 200);
  assert.match(trustedLogin.response.headers.get('set-cookie') || '', /;\s*Secure(?:;|$)/i, 'authenticated front-end proof preserves forwarded HTTPS');
  let lastStatus;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await getJson(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jarvis-Proxy-Token': 'caller-spoof', 'X-Jarvis-Client-Address': `198.51.100.${attempt + 1}` },
      body: JSON.stringify({ pin: 'wrong-test-pin' })
    });
    lastStatus = result.response.status;
  }
  assert.equal(lastStatus, 429, 'rotating unauthenticated local proxy headers must not reset PIN attempt limits');

  console.log('Split-stack smoke passed: 5 processes ready; dashboard login/session cookies, authenticated proxy identity/HTTPS, local PIN throttling, local backends, settings persistence, media proxy, core settings round-trip, and session-protected local speech all succeeded.');
} finally {
  await stopStack();
  const resolvedTemp = path.resolve(temporaryRoot);
  const resolvedOsTemp = path.resolve(os.tmpdir());
  assert.ok(resolvedTemp.startsWith(resolvedOsTemp + path.sep), 'refusing to remove a path outside the temporary directory');
  await fs.rm(resolvedTemp, { recursive: true, force: true });
}
