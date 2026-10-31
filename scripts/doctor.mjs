import dotenv from 'dotenv';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Local-only readiness check. It authenticates to the dashboard when the
// configured PIN is available, but never prints the PIN or any other secret.
dotenv.config({ override: true, quiet: true });

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const required = {
  openJarvis: args.has('--require-openjarvis'),
  ollama: args.has('--require-ollama'),
  vision: args.has('--require-vision'),
  google: args.has('--require-google'),
  stirling: args.has('--require-stirling'),
  printer: args.has('--require-printer'),
  printerCamera: args.has('--require-printer-camera'),
  camera: args.has('--require-camera'),
  microphone: args.has('--require-mic') || args.has('--require-microphone')
};

export function doctorRequirements(argv = []) {
  const requested = new Set(argv);
  return {
    strict: requested.has('--strict'),
    openJarvis: requested.has('--require-openjarvis'),
    ollama: requested.has('--require-ollama'),
    vision: requested.has('--require-vision'),
    google: requested.has('--require-google'),
    stirling: requested.has('--require-stirling'),
    printer: requested.has('--require-printer'),
    printerCamera: requested.has('--require-printer-camera'),
    camera: requested.has('--require-camera'),
    microphone: requested.has('--require-mic') || requested.has('--require-microphone')
  };
}

function clean(value, limit = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function baseUrl() {
  const configured = String(process.env.JARVIS_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const port = Number(process.env.PORT) || 8788;
  return `http://127.0.0.1:${port}`;
}

async function request(url, path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 8_000)
  });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json().catch(() => ({})) : await response.text().catch(() => '');
  return { status: response.status, body, headers: response.headers };
}

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

function statusLabel(value) {
  return value ? 'online' : 'offline';
}

export function evaluateDoctorSnapshot(snapshot, options = {}) {
  const needs = { ...required, ...options };
  const checks = [];
  const add = (id, ok, detail, requiredCheck = false) => checks.push({ id, ok: Boolean(ok), detail: clean(detail), required: Boolean(requiredCheck) });
  add('dashboard', snapshot.dashboard?.ok, snapshot.dashboard?.detail || 'dashboard health', true);
  add('auth', snapshot.auth?.ok, snapshot.auth?.detail || 'dashboard authentication', true);
  add('camoufox', snapshot.config?.browserEngine === 'camoufox', snapshot.config?.browserEngine ? `browser engine ${snapshot.config.browserEngine}` : 'Camoufox engine not reported', true);
  add('openjarvis', snapshot.services?.openjarvis?.online, `OpenJarvis ${statusLabel(snapshot.services?.openjarvis?.online)}`, needs.openJarvis);
  add('ollama', snapshot.services?.ollama?.online, `Ollama ${statusLabel(snapshot.services?.ollama?.online)}`, needs.ollama);
  const visionReady = snapshot.vision?.runtime === 'ready' && snapshot.vision?.capabilityVerified === true;
  add('vision', visionReady, snapshot.vision?.runtime ? `vision ${snapshot.vision.runtime}` : 'vision status unavailable', needs.vision);
  const googleCapability = Array.isArray(snapshot.capabilities?.capabilities)
    ? snapshot.capabilities.capabilities.find((item) => item?.id === 'google')
    : null;
  const googleReady = Boolean(googleCapability?.status?.available);
  add('google', googleReady, googleReady ? 'Google OAuth live' : 'Google OAuth unavailable; create/authorize a replacement Desktop client', needs.google);
  const stirling = snapshot.integrations?.stirling || {};
  const stirlingReady = Boolean(stirling.online);
  const stirlingDetail = stirling.online
    ? `Stirling online${stirling.processing?.state === 'verified' ? ' // processing verified' : ''}`
    : stirling.configured
      ? `Stirling unavailable${stirling.error ? ` (${stirling.error})` : ''}`
      : 'Stirling not configured';
  add('stirling', stirlingReady, stirlingDetail, needs.stirling);
  const printer = snapshot.printer || {};
  const printerReady = Boolean(printer.online && printer.ready);
  const printerDetail = printerReady
    ? `printer online // ${printer.state || 'ready'}`
    : printer.configured
      ? `printer unavailable // ${printer.state || 'offline'}`
      : 'printer not configured';
  add('printer', printerReady, printerDetail, needs.printer);
  const printerCamera = snapshot.integrations?.printerCamera || {};
  const printerCameraReady = Boolean(printerCamera.configured && printerCamera.discovery !== 'not-found' && !printerCamera.configError);
  const printerCameraDetail = printerCameraReady
    ? `printer camera ${printerCamera.discovery === 'found' ? 'snapshot found' : 'configured'}`
    : printerCamera.configError
      ? `printer camera config error (${printerCamera.configError})`
      : printerCamera.autoDiscovery
        ? `printer camera ${printerCamera.discovery === 'pending' ? 'discovery pending' : 'snapshot not found'}`
        : 'printer camera not configured';
  add('printer-camera', printerCameraReady, printerCameraDetail, needs.printerCamera);
  const media = snapshot.media || {};
  const linux = snapshot.platform === 'linux';
  add('camera', Array.isArray(media.cameras) && media.cameras.length > 0, linux ? `${media.cameras?.length || 0} V4L2 camera(s)` : 'camera enumeration is browser-side on this host', needs.camera && linux);
  add('microphone', Array.isArray(media.microphones) && media.microphones.length > 0, linux ? `${media.microphones?.length || 0} ALSA capture device(s)` : 'microphone enumeration is browser-side on this host', needs.microphone && linux);
  return { checks, pass: checks.filter((item) => item.ok).length, warn: checks.filter((item) => !item.ok && !item.required).length, fail: checks.filter((item) => !item.ok && item.required).length };
}

function printCheck(check) {
  const level = check.ok ? 'PASS' : check.required ? 'FAIL' : 'WARN';
  process.stdout.write(`${level}  ${check.id.toUpperCase()} // ${check.detail}\n`);
}

async function run() {
  const url = baseUrl();
  const snapshot = { platform: process.platform, dashboard: {}, auth: {}, services: {}, config: {}, vision: {}, capabilities: {}, integrations: {}, printer: {}, media: {} };
  process.stdout.write(`JARVIS DOCTOR // local readiness // ${new Date().toISOString()}\n`);
  process.stdout.write(`TARGET // ${new URL(url).host}\n`);

  try {
    const health = await request(url, '/api/health');
    snapshot.dashboard = { ok: health.status === 200 && health.body?.status === 'ok', detail: health.status === 200 ? `dashboard ${health.body?.version || 'healthy'}` : `HTTP ${health.status}` };
  } catch (error) {
    snapshot.dashboard = { ok: false, detail: `dashboard unavailable (${clean(error.message, 120)})` };
  }

  let cookie = '';
  try {
    const auth = await request(url, '/api/auth/status');
    const authRequired = Boolean(auth.body?.required);
    if (!authRequired) {
      snapshot.auth = { ok: true, detail: 'dashboard PIN is not enabled' };
    } else if (!String(process.env.DASHBOARD_ACCESS_PIN || '').trim()) {
      snapshot.auth = { ok: false, detail: 'DASHBOARD_ACCESS_PIN is required for protected checks' };
    } else {
      const login = await request(url, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: process.env.DASHBOARD_ACCESS_PIN }) });
      cookie = cookieFrom(login);
      snapshot.auth = { ok: login.status === 200 && Boolean(login.body?.ok) && Boolean(cookie), detail: login.status === 200 ? 'dashboard session established' : `dashboard login HTTP ${login.status}` };
    }
  } catch (error) {
    snapshot.auth = { ok: false, detail: `authentication probe unavailable (${clean(error.message, 120)})` };
  }

  const headers = cookie ? { cookie } : {};
  const protectedProbe = async (path) => request(url, path, { headers });
  try {
    const [status, config, vision, capabilities, stirling, printer, printerCamera, media] = await Promise.all([
      protectedProbe('/api/status'), protectedProbe('/api/config'), protectedProbe('/api/vision/status'),
      protectedProbe('/api/capabilities'), protectedProbe('/api/stirling/status'), protectedProbe('/api/printer/status'), protectedProbe('/api/media/printer-camera/discover'), protectedProbe('/api/media/devices')
    ]);
    snapshot.services = status.body?.services || {};
    snapshot.config = config.body || {};
    snapshot.vision = vision.body || {};
    snapshot.capabilities = capabilities.body || {};
    snapshot.integrations = { stirling: stirling.body || {}, printerCamera: printerCamera.body || {} };
    snapshot.printer = printer.body || {};
    snapshot.media = media.body || {};
    if (status.status !== 200) snapshot.services = {};
  } catch (error) {
    snapshot.config = { browserEngine: '' };
    snapshot.vision = {};
    snapshot.media = {};
    snapshot.capabilities = {};
    snapshot.integrations = {};
    snapshot.printer = {};
    snapshot.services = {};
    snapshot.probeError = clean(error.message, 160);
  }

  const report = evaluateDoctorSnapshot(snapshot, required);
  for (const check of report.checks) printCheck(check);
  if (snapshot.probeError) process.stdout.write(`WARN  PROBE // ${snapshot.probeError}\n`);
  process.stdout.write(`SUMMARY // pass=${report.pass} warn=${report.warn} fail=${report.fail}\n`);
  const shouldFail = report.fail > 0 || (strict && report.warn > 0);
  process.exitCode = shouldFail ? 2 : 0;
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run().catch((error) => { process.stderr.write(`JARVIS DOCTOR // ERROR // ${clean(error.message)}\n`); process.exitCode = 2; });
}
