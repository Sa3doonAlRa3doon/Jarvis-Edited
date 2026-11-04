import dotenv from 'dotenv';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_LOCAL_PORTS } from '../lib/local-ports.mjs';
import { freshPiWakeDiagnostic } from '../lib/wake-diagnostics.mjs';

// Local-only readiness check. It authenticates to the dashboard when the
// configured PIN is available, but never prints the PIN or any other secret.
dotenv.config({ override: true, quiet: true });

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const required = {
  auth: args.has('--require-auth'),
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
    auth: requested.has('--require-auth'),
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

export function doctorBaseUrl(environment = process.env) {
  const configured = String(environment.JARVIS_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const port = Number(environment.PORT) || DEFAULT_LOCAL_PORTS.dashboard;
  return `http://127.0.0.1:${port}`;
}

async function request(url, path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 8_000)
  });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json')
    ? await response.json().catch(() => ({}))
    : /^(?:image\/|application\/octet-stream)/i.test(type)
      ? { bytes: (await response.arrayBuffer().catch(() => new ArrayBuffer(0))).byteLength }
      : await response.text().catch(() => '');
  return { status: response.status, body, headers: response.headers, contentType: type };
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
  add('frontend', snapshot.frontend?.ok, snapshot.frontend?.detail || 'dashboard front end unavailable', true);
  add('dashboard', snapshot.dashboard?.ok, snapshot.dashboard?.detail || 'dashboard health', true);
  for (const [key, label] of [['settings', 'settings'], ['camera', 'camera'], ['microphone', 'microphone']]) {
    if (snapshot.backends) add(`${key}-backend`, snapshot.backends[key]?.status === 'ok', `${label} backend ${snapshot.backends[key]?.status === 'ok' ? 'healthy' : 'unavailable'}`, true);
  }
  add('auth', snapshot.auth?.ok, snapshot.auth?.detail || 'dashboard authentication', needs.auth);
  add('camoufox', snapshot.config?.browserEngine === 'camoufox', snapshot.config?.browserEngine ? `browser engine ${snapshot.config.browserEngine}` : 'Camoufox engine not reported', true);
  add('openjarvis', snapshot.services?.openjarvis?.online, `OpenJarvis ${statusLabel(snapshot.services?.openjarvis?.online)}`, needs.openJarvis);
  add('ollama', snapshot.services?.ollama?.online, `Ollama ${statusLabel(snapshot.services?.ollama?.online)}`, needs.ollama);
  const visionReady = snapshot.vision?.runtime === 'ready' && snapshot.vision?.capabilityVerified === true;
  add('vision', visionReady, snapshot.vision?.runtime ? `vision ${snapshot.vision.runtime}` : 'vision status unavailable', needs.vision);
  const googleCapability = Array.isArray(snapshot.capabilities?.capabilities)
    ? snapshot.capabilities.capabilities.find((item) => item?.id === 'google')
    : null;
  const googleReady = Boolean(googleCapability?.status?.available);
  add('google', googleReady, googleReady ? 'Google OAuth live' : 'Google OAuth unavailable; review Google authorization in Settings', needs.google);
  const stirling = snapshot.integrations?.stirling || {};
  const processingState = String(stirling.processing?.state || 'not-verified');
  const stirlingReady = Boolean(stirling.online && processingState === 'verified');
  const stirlingDetail = stirling.online
    ? processingState === 'verified'
      ? 'Stirling online // processing verified'
      : processingState === 'rejected'
        ? `Stirling online // processing rejected${stirling.processing?.providerStatus ? ` (HTTP ${Number(stirling.processing.providerStatus)})` : ''}`
        : 'Stirling health online // PDF processing not verified'
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
  const printerCameraFrame = snapshot.printerCameraFrame || {};
  const localFrameReady = Boolean(printerCameraFrame.ok && Number(printerCameraFrame.bytes) > 100);
  const discoveredCameraReady = Boolean(printerCamera.configured && printerCamera.discovery !== 'not-found' && !printerCamera.configError);
  const printerCameraReady = localFrameReady || discoveredCameraReady;
  const printerCameraDetail = localFrameReady
    ? `printer camera frame captured (${Number(printerCameraFrame.bytes)} bytes)`
    : discoveredCameraReady
      ? `printer camera ${printerCamera.discovery === 'found' ? 'snapshot found' : 'configured'}`
    : printerCamera.configError
      ? `printer camera config error (${printerCamera.configError})`
      : printerCameraFrame.status
        ? `printer camera frame unavailable (HTTP ${printerCameraFrame.status})`
      : printerCamera.autoDiscovery
        ? `printer camera ${printerCamera.discovery === 'pending' ? 'discovery pending' : 'snapshot not found'}`
        : 'printer camera not configured';
  add('printer-camera', printerCameraReady, printerCameraDetail, needs.printerCamera);
  const media = snapshot.media || {};
  const linux = snapshot.platform === 'linux';
  add('camera', Array.isArray(media.cameras) && media.cameras.length > 0, linux ? `${media.cameras?.length || 0} V4L2 camera(s)` : 'camera enumeration is browser-side on this host', needs.camera && linux);
  add('microphone', Array.isArray(media.microphones) && media.microphones.length > 0, linux ? `${media.microphones?.length || 0} ALSA capture device(s)` : 'microphone enumeration is browser-side on this host', needs.microphone && linux);
  const settings = snapshot.settings || {};
  if (linux && settings.source === 'pi' && (settings.wakeWord || settings.doubleClap)) {
    const wake = snapshot.wake || {};
    const ready = wake.running && wake.ready && !wake.error && (!settings.wakeWord || wake.model);
    add('wake-listener', ready, ready ? `listener ready // ${clean(wake.captureBackend || 'capture', 24)}` : 'listener not ready; inspect microphone service', true);
    add('transcription', wake.sttModel, wake.sttModel ? 'local transcription model loaded' : 'local transcription model unavailable', needs.microphone);
    const diagnostic = freshPiWakeDiagnostic(wake.diagnostics, options.now ?? snapshot.wakeObservedAt ?? Date.now());
    add('mic-stream', Boolean(ready && diagnostic), diagnostic && ready ? `recent audio telemetry // level ${diagnostic.micLevel.toFixed(4)}` : 'no recent microphone telemetry', true);
  }
  return { checks, pass: checks.filter((item) => item.ok).length, warn: checks.filter((item) => !item.ok && !item.required).length, fail: checks.filter((item) => !item.ok && item.required).length };
}

// Optional endpoints fail independently, so a printer/vision timeout cannot
// erase healthy model, Google, or microphone results from the same inspection.
export async function collectDoctorProbes(read, { platform = process.platform, now = Date.now } = {}) {
  const paths = {
    status: '/api/status', config: '/api/config', vision: '/api/vision/status',
    capabilities: '/api/capabilities', stirling: '/api/stirling/status',
    printer: '/api/printer/status', printerCamera: '/api/media/printer-camera/discover',
    media: '/api/media/devices', settings: '/api/settings', wake: '/api/wake/status'
  };
  if (platform === 'linux') paths.printerFrame = '/api/media/printer-camera/frame.jpg';
  const keys = Object.keys(paths);
  const results = await Promise.allSettled(keys.map(async (key) => ({ ...await read(paths[key]), observedAt: now() })));
  const responses = {};
  const probeErrors = [];
  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status === 'fulfilled') responses[key] = result.value;
    if (result.status !== 'fulfilled' || result.value.status !== 200) probeErrors.push(`${key}: ${result.status === 'fulfilled' ? `HTTP ${Number(result.value.status) || 0}` : 'request failed or timed out'}`);
  });
  const body = (key) => responses[key]?.status === 200 ? responses[key].body || {} : {};
  const frame = responses.printerFrame;
  return {
    services: body('status').services || {}, wake: body('wake'), wakeObservedAt: responses.wake?.observedAt,
    config: body('config'), vision: body('vision'), capabilities: body('capabilities'),
    integrations: { stirling: body('stirling'), printerCamera: body('printerCamera') },
    printer: body('printer'), media: body('media'), settings: body('settings').settings || body('settings'),
    printerCameraFrame: { ok: Boolean(frame?.status === 200 && Number(frame.body?.bytes) > 100), status: frame?.status || 0, bytes: frame?.status === 200 ? Number(frame.body?.bytes) || 0 : 0, contentType: clean(frame?.contentType, 80) },
    probeErrors
  };
}

function printCheck(check) {
  const level = check.ok ? 'PASS' : check.required ? 'FAIL' : 'WARN';
  process.stdout.write(`${level}  ${check.id.toUpperCase()} // ${check.detail}\n`);
}

async function run() {
  const url = doctorBaseUrl();
  const snapshot = { platform: process.platform, frontend: {}, dashboard: {}, auth: {}, services: {}, config: {}, vision: {}, capabilities: {}, integrations: {}, printer: {}, media: {} };
  process.stdout.write(`JARVIS DOCTOR // local readiness // ${new Date().toISOString()}\n`);
  process.stdout.write(`TARGET // ${new URL(url).host}\n`);

  try {
    const frontend = await request(url, '/health');
    const frontendReady = frontend.status === 200 && frontend.body?.status === 'ok' && frontend.body?.service === 'dashboard';
    snapshot.frontend = { ok: frontendReady, detail: frontendReady ? 'dashboard front end healthy' : `front end health failed (HTTP ${frontend.status})` };
  } catch {
    snapshot.frontend = { ok: false, detail: 'dashboard front end unavailable' };
  }
  try {
    const health = await request(url, '/api/health');
    snapshot.dashboard = { ok: health.status === 200 && health.body?.status === 'ok', detail: health.status === 200 ? `dashboard ${health.body?.version || 'healthy'}` : `HTTP ${health.status}` };
    snapshot.backends = health.body?.backends || {};
  } catch (error) {
    snapshot.dashboard = { ok: false, detail: `dashboard unavailable (${clean(error.message, 120)})` };
  }

  let cookie = '';
  try {
    const auth = await request(url, '/api/auth/status');
    const authRequired = Boolean(auth.body?.required);
    if (!authRequired) {
      snapshot.auth = { ok: false, detail: 'dashboard PIN is not enabled' };
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
  Object.assign(snapshot, await collectDoctorProbes(protectedProbe));

  const report = evaluateDoctorSnapshot(snapshot, required);
  for (const check of report.checks) printCheck(check);
  for (const error of snapshot.probeErrors || []) process.stdout.write(`WARN  PROBE // ${error}\n`);
  process.stdout.write(`SUMMARY // pass=${report.pass} warn=${report.warn} fail=${report.fail}\n`);
  const shouldFail = report.fail > 0 || (strict && report.warn > 0);
  process.exitCode = shouldFail ? 2 : 0;
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run().catch((error) => { process.stderr.write(`JARVIS DOCTOR // ERROR // ${clean(error.message)}\n`); process.exitCode = 2; });
}
