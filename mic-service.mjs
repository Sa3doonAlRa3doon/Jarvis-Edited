import 'dotenv/config';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { appendWakeStderr, wakeListenerExitError } from './lib/wake-stderr.mjs';
import { requireInternalServiceAuth } from './lib/local-service-auth.mjs';
import { binaryAvailable, linuxMicrophones } from './lib/system-probe.mjs';
import { piWakeEnergyFloor } from './lib/pi-wake-profile.mjs';
import { normalizeWakeCapture } from './public/wake-state.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.JARVIS_MIC_BACKEND_PORT || 8791);
const token = String(process.env.JARVIS_INTERNAL_SERVICE_TOKEN || '');
const apiPort = Number(process.env.API_PORT || 8788);
const defaultCallback = 'http://127.0.0.1:' + apiPort + '/api/wake-event';
const wakeState = { process: null, running: false, ready: false, model: false, sttModel: false, captureBackend: null, captureTarget: null, lastEvent: null, diagnostics: null, commandCapture: normalizeWakeCapture({ state: 'idle' }), error: null };
let activeSettings = null;
let callbackUrl = defaultCallback;
let desiredConfiguration = null;
let intentionalChildStop = null;
let restartTimer = null;
let restartAttempts = 0;
let configurationRevision = 0;
let shuttingDown = false;
let configurationQueue = Promise.resolve();

function boundedNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? numeric : fallback));
}

function publicState() {
  const result = { ...wakeState, process: undefined };
  return result;
}

function listenerWanted() {
  return process.platform === 'linux' && /^(1|true|yes|on)$/i.test(String(process.env.ENABLE_PI_WAKE_LISTENER || 'true')) && activeSettings?.source === 'pi' && Boolean(activeSettings.piMicrophone) && (activeSettings.wakeWord || activeSettings.doubleClap);
}

function scheduleListenerRetry(revision, detail = 'Mic listener stopped unexpectedly.') {
  if (shuttingDown || !listenerWanted() || !desiredConfiguration || revision !== configurationRevision) return;
  restartAttempts = Math.min(6, restartAttempts + 1);
  const delayMs = Math.min(30_000, 1_000 * (2 ** (restartAttempts - 1)));
  const message = String(detail || 'Mic listener stopped unexpectedly.').replace(/ Retrying in \d+s\.$/, '');
  wakeState.error = `${message.slice(0, 160)} Retrying in ${Math.ceil(delayMs / 1000)}s.`.slice(0, 220);
  restartTimer = setTimeout(() => {
    if (!shuttingDown && revision === configurationRevision && desiredConfiguration) void configureListener(desiredConfiguration);
  }, delayMs);
  restartTimer.unref();
}

async function stopListener() {
  const child = wakeState.process;
  if (child) {
    intentionalChildStop = child;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => { child.kill('SIGKILL'); finish(); }, 2500);
      if (child.exitCode !== null || child.signalCode) { finish(); return; }
      child.once('exit', finish);
      if (!child.killed) child.kill('SIGTERM');
    });
  }
  if (intentionalChildStop === child) intentionalChildStop = null;
  if (wakeState.process === child) wakeState.process = null;
  wakeState.running = false;
  wakeState.ready = false;
  wakeState.model = false;
  wakeState.sttModel = false;
  wakeState.captureBackend = null;
  wakeState.captureTarget = null;
  wakeState.diagnostics = null;
  wakeState.commandCapture = normalizeWakeCapture({ state: 'idle' });
}

function configureListener(input = {}) {
  const operation = configurationQueue.then(() => configureListenerNow(input));
  configurationQueue = operation.catch(() => {});
  return operation;
}

async function configureListenerNow(input = {}) {
  if (shuttingDown) return publicState();
  configurationRevision += 1;
  const revision = configurationRevision;
  clearTimeout(restartTimer);
  restartTimer = null;
  await stopListener();
  wakeState.error = null;
  const settings = input.settings && typeof input.settings === 'object' ? input.settings : {};
  activeSettings = settings;
  callbackUrl = /^http:\/\/127\.0\.0\.1:\d{1,5}\/api\/wake-event$/.test(String(input.callbackUrl || '')) ? String(input.callbackUrl) : defaultCallback;
  desiredConfiguration = { settings: { ...settings }, callbackUrl };
  if (process.platform !== 'linux' || !/^(1|true|yes|on)$/i.test(String(process.env.ENABLE_PI_WAKE_LISTENER || 'true'))) return publicState();
  if (settings.source !== 'pi' || !settings.piMicrophone || (!settings.wakeWord && !settings.doubleClap)) return publicState();

  const microphones = await linuxMicrophones();
  if (!microphones.some((item) => item.id === settings.piMicrophone)) {
    wakeState.error = 'Selected Pi microphone is not available to the local microphone backend.';
    scheduleListenerRetry(revision, wakeState.error);
    return publicState();
  }
  const python = process.env.WAKE_PYTHON || path.join(root, '.wake-venv', 'bin', 'python');
  try { await fs.access(python); }
  catch { wakeState.error = 'Wake-listener Python is missing. Run the local Pi installer.'; return publicState(); }

  const args = [path.join(root, 'lib', 'wake-listener.py'), '--device', settings.piMicrophone,
    '--callback', callbackUrl,
    '--wake-threshold', String(boundedNumber(settings.wakeSensitivity, 0.72, 0.2, 0.95)),
    '--clap-threshold', String(boundedNumber(settings.clapSensitivity, 0.42, 0.08, 0.95)),
    '--double-clap-ms', String(Math.round(boundedNumber(settings.doubleClapWindow, 700, 300, 1500))),
    '--wake-energy-floor', String(piWakeEnergyFloor(settings.micSensitivity, boundedNumber(process.env.PI_WAKE_ENERGY_FLOOR, 0.0035, 0.0005, 0.05))),
    '--wake-noise-multiplier', String(boundedNumber(process.env.PI_WAKE_NOISE_MULTIPLIER, 1.6, 1.05, 8)),
    '--wake-peak-floor', String(boundedNumber(process.env.PI_WAKE_PEAK_FLOOR, 0.004, 0.0005, 0.25)),
    '--wake-peak-ratio', String(boundedNumber(process.env.PI_WAKE_PEAK_RATIO, 1.12, 1, 3))];
  const configuredSttModel = String(process.env.JARVIS_STT_MODEL_DIR || '').trim();
  const sttModel = configuredSttModel ? (path.isAbsolute(configuredSttModel) ? configuredSttModel : path.resolve(root, configuredSttModel)) : '';
  if (sttModel) args.push('--stt-model', sttModel,
    '--command-timeout-ms', String(boundedNumber(process.env.JARVIS_STT_COMMAND_TIMEOUT_MS, 15_000, 5_000, 30_000)),
    '--command-silence-ms', String(boundedNumber(process.env.JARVIS_STT_COMMAND_SILENCE_MS, 900, 350, 2_000)),
    '--command-warmup-ms', String(boundedNumber(process.env.JARVIS_STT_COMMAND_WARMUP_MS, 1_200, 0, 5_000)));
  if (settings.wakeWord) args.push('--wake-enabled');
  if (settings.doubleClap) args.push('--clap-enabled');

  const childEnv = { ...process.env, PYTHONUNBUFFERED: '1', JARVIS_WAKE_EVENT_TOKEN: token };
  if (!childEnv.XDG_RUNTIME_DIR && typeof process.getuid === 'function') {
    const runtimeDir = '/run/user/' + process.getuid();
    try { await fs.access(runtimeDir); childEnv.XDG_RUNTIME_DIR = runtimeDir; } catch {}
  }
  const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
  wakeState.process = child;
  wakeState.running = true;
  let stderrTail = '';
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.type === 'ready') {
          wakeState.ready = true;
          wakeState.model = Boolean(message.wake_model);
          wakeState.sttModel = Boolean(message.stt_model);
          restartAttempts = 0;
          wakeState.captureBackend = String(message.capture_backend || '').slice(0, 24) || null;
          wakeState.captureTarget = String(message.capture_target || '').slice(0, 48) || null;
          wakeState.commandCapture = normalizeWakeCapture({ state: 'idle' });
        } else if (message.type === 'diagnostic') {
          wakeState.diagnostics = {
            micLevel: boundedNumber(message.mic_level, 0, 0, 1),
            micPeak: boundedNumber(message.mic_peak, 0, 0, 1),
            noiseFloor: boundedNumber(message.noise_floor, 0, 0, 1),
            signalToNoiseDb: boundedNumber(message.signal_to_noise_db, 0, -120, 120),
            physicalGate: Boolean(message.physical_gate),
            wakeScore: boundedNumber(message.wake_score, 0, 0, 1),
            wakeScoreHits: boundedNumber(message.wake_score_hits, 0, 0, 3),
            wakeScoreReady: Boolean(message.wake_score_ready),
            source: 'pi', at: new Date().toISOString()
          };
        } else if (message.type === 'activation') wakeState.lastEvent = { ...message, at: new Date().toISOString() };
        else if (message.type === 'command_capture') wakeState.commandCapture = normalizeWakeCapture(message);
        else if (message.type === 'command') wakeState.commandCapture = normalizeWakeCapture({ state: 'complete' });
        else if (String(message.type || '').endsWith('error')) wakeState.error = String(message.message || 'Mic listener reported an error.').slice(0, 220);
      } catch {}
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderrTail = appendWakeStderr(stderrTail, chunk); });
  child.on('exit', (code) => {
    if (wakeState.process !== child) return;
    wakeState.process = null;
    wakeState.running = false;
    wakeState.ready = false;
    wakeState.model = false;
    wakeState.sttModel = false;
    wakeState.captureBackend = null;
    wakeState.captureTarget = null;
    wakeState.commandCapture = normalizeWakeCapture({ state: 'idle' });
    const exitError = wakeListenerExitError(code, wakeState.error, stderrTail);
    if (exitError) wakeState.error = String(exitError).slice(0, 220);
    if (intentionalChildStop !== child) scheduleListenerRetry(revision, wakeState.error || `Mic listener exited (${code ?? 'unknown'}).`);
  });
  child.on('error', (error) => { wakeState.error = String(error?.message || 'Could not start the mic listener.').slice(0, 220); });
  return publicState();
}

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_request, response) => {
  const listenerExpected = listenerWanted();
  const status = !token || (listenerExpected && !wakeState.ready) ? 'degraded' : 'ok';
  response.json({ status, service: 'mic', localOnly: true, authenticationConfigured: Boolean(token), listenerExpected: Boolean(listenerExpected), listenerRunning: wakeState.running, listenerReady: wakeState.ready, error: wakeState.error });
});
app.use(requireInternalServiceAuth(token));
app.get('/devices', async (_request, response) => {
  const [microphones, arecord] = await Promise.all([linuxMicrophones(), binaryAvailable('arecord', ['--version'])]);
  response.set('Cache-Control', 'no-store').json({ platform: process.platform, microphones, tools: { arecord } });
});
app.get('/status', (_request, response) => response.set('Cache-Control', 'no-store').json(publicState()));
app.get('/level', async (request, response) => {
  const device = String(request.query.device || '');
  if (!activeSettings || device !== activeSettings.piMicrophone) { response.status(400).json({ error: 'Select the active Pi microphone first.' }); return; }
  if (!wakeState.diagnostics) { response.status(503).json({ error: wakeState.error || 'Waiting for a mic diagnostic sample.', device, running: wakeState.running, ready: wakeState.ready }); return; }
  response.set('Cache-Control', 'no-store').json({ ...wakeState.diagnostics, level: wakeState.diagnostics.micLevel, device, running: wakeState.running, ready: wakeState.ready });
});
app.put('/configure', async (request, response) => {
  try {
    const state = await configureListener(request.body || {});
    response.set('Cache-Control', 'no-store').json(state);
  } catch (error) {
    wakeState.error = String(error?.message || 'Mic backend configuration failed.').slice(0, 220);
    response.status(500).json({ error: wakeState.error });
  }
});

const server = app.listen(port, '127.0.0.1', () => console.log(`JARVIS mic backend listening on 127.0.0.1:${port}`));
async function shutdown() { shuttingDown = true; configurationRevision += 1; clearTimeout(restartTimer); await configurationQueue.catch(() => {}); await stopListener(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
