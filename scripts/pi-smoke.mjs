import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshPiWakeDiagnostic } from '../lib/wake-diagnostics.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.slice(2).includes('--strict');

async function liveApiChecks() {
  let passed = 0;
  let warned = 0;
  let failed = 0;
  const pass = (label) => { passed += 1; console.log(`PASS  LIVE ${label}`); };
  const warn = (label) => { warned += 1; console.log(`WARN  LIVE ${label}`); };
  const fail = (label) => { failed += 1; console.log(`FAIL  LIVE ${label}`); };
  const port = Number(process.env.PORT || 8787);
  const base = `http://127.0.0.1:${Number.isInteger(port) && port > 0 && port < 65536 ? port : 8787}`;
  const fetchWithTimeout = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(12_000) });
  let cookie = '';

  try {
    const authResponse = await fetchWithTimeout(`${base}/api/auth/status`);
    if (!authResponse.ok) throw new Error(`dashboard auth status HTTP ${authResponse.status}`);
    const auth = await authResponse.json();
    if (auth.required) {
      const pin = String(process.env.DASHBOARD_ACCESS_PIN || process.env.OPS_CONTROL_PIN || '').trim();
      if (!pin) fail('dashboard requires a PIN but no local PIN is configured for the smoke check');
      else {
        const login = await fetchWithTimeout(`${base}/api/auth/login`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin })
        });
        if (!login.ok) fail(`dashboard PIN login failed (HTTP ${login.status})`);
        else {
          cookie = login.headers.getSetCookie?.()[0]?.split(';')[0] || '';
          if (!cookie) fail('dashboard login did not return a session cookie');
          else pass('private dashboard PIN login');
        }
      }
    } else warn('dashboard PIN is not enabled');

    const getJson = async (route) => {
      const response = await fetchWithTimeout(`${base}${route}`, { headers: cookie ? { cookie } : {} });
      if (!response.ok) throw new Error(`${route} HTTP ${response.status}`);
      return response.json();
    };
    const getImage = async (route) => {
      const response = await fetchWithTimeout(`${base}${route}`, { headers: cookie ? { cookie } : {} });
      const contentType = response.headers.get('content-type') || '';
      const body = new Uint8Array(await response.arrayBuffer());
      return { ok: response.ok && /^image\/(?:jpeg|png|webp)$/i.test(contentType) && body.length > 512 && body.length <= 8 * 1024 * 1024,
        status: response.status, contentType, bytes: body.length, jpeg: body[0] === 0xff && body[1] === 0xd8 };
    };

    const [vision, wake, workspace, settings, devices] = await Promise.all([
      getJson('/api/vision/status'), getJson('/api/wake/status'), getJson('/api/workspace/status'),
      getJson('/api/settings'), getJson('/api/media/devices')
    ]);

    if (vision.ready && vision.capabilityVerified) pass(`vision model ${vision.model || 'configured'} is ready`);
    else fail(`vision model is not capability-verified (${vision.error || vision.model || 'not ready'})`);

    const wakeEnabled = process.env.ENABLE_PI_WAKE_LISTENER !== 'false' && (settings.wakeWord || settings.doubleClap);
    if (wakeEnabled && wake.running && wake.ready && wake.model) pass('Hey Jarvis wake model and microphone listener ready');
    else if (wakeEnabled) fail(`wake listener is not ready (${wake.error || 'check /api/wake/status'})`);
    else warn('Pi wake listener is disabled in configuration');
    const micSignal = freshPiWakeDiagnostic(wake.diagnostics);
    if (wakeEnabled && micSignal) {
      const level = (micSignal.micLevel * 100).toFixed(2);
      const noise = (micSignal.noiseFloor * 100).toFixed(2);
      pass(`live mic samples fresh (RMS ${level}%, noise floor ${noise}%, SNR ${micSignal.signalToNoiseDb.toFixed(1)} dB, physical gate ${micSignal.physicalGate ? 'open' : 'closed'})`);
    } else if (wakeEnabled && wake.running && wake.ready) warn('live mic signal telemetry is missing or stale; device selection alone does not prove current audio frames');
    if (process.env.JARVIS_STT_MODEL_DIR && wake.sttModel) pass('local Vosk command transcription loaded');
    else if (process.env.JARVIS_STT_MODEL_DIR) fail('local Vosk command model is configured but not loaded');
    else warn('local command transcription model is not configured');

    if (workspace.camera?.source === 'pi' && workspace.camera?.selected && workspace.camera.available) {
      const selected = workspace.camera.devices?.find((item) => item.id === workspace.camera.selected);
      if (!selected || !/lenovo/i.test(selected.label || '')) fail('the selected main Pi camera is not identified as Lenovo');
      else pass(`Lenovo main camera selected (${selected.id})`);
      const frame = await getImage(`${workspace.camera.frameEndpoint}?device=${encodeURIComponent(workspace.camera.selected)}`);
      if (frame.ok) pass(`main camera frame received (${frame.bytes} bytes)`);
      else fail(`main camera frame failed (HTTP ${frame.status}, ${frame.contentType || 'no image'}, ${frame.bytes} bytes)`);
    } else fail('Lenovo Pi camera is not selected or available');

    const microphone = devices.microphones?.find((item) => item.id === settings.piMicrophone);
    if (settings.source === 'pi' && microphone && /lenovo/i.test(microphone.label || '')) pass(`Lenovo microphone selected (${settings.piMicrophone})`);
    else fail('the selected Pi microphone is not identified as Lenovo or is unavailable');

    if (workspace.printerCamera?.configured && workspace.printerCamera?.device) {
      const frame = await getImage(workspace.printerCamera.endpoint);
      if (frame.ok) pass(`separate printer camera frame received (${frame.bytes} bytes)`);
      else fail(`separate printer camera frame failed (HTTP ${frame.status}, ${frame.contentType || 'no image'}, ${frame.bytes} bytes)`);
    } else warn('a separate Pi printer camera is not configured');
  } catch (error) {
    fail(`live dashboard check could not complete (${String(error?.message || error).slice(0, 180)})`);
  }

  console.log(`LIVE SUMMARY // pass=${passed} warn=${warned} fail=${failed}`);
  return { passed, warned, failed };
}

if (process.platform === 'win32') {
  console.error('JARVIS PI ACCEPTANCE must run on the Raspberry Pi or an Ubuntu/Linux host. Use SSH to the Pi, then run npm run smoke:pi there.');
  process.exitCode = 2;
} else {
  const result = spawnSync('bash', [path.join(project, 'scripts', 'pi-smoke.sh'), ...process.argv.slice(2)], { cwd: project, stdio: 'inherit' });
  const shellExit = result.error ? 1 : (result.status ?? 1);
  const live = await liveApiChecks();
  process.exitCode = strict && live.failed > 0 ? 1 : shellExit;
}

