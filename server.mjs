import 'dotenv/config';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { agentRoles, resolvePrimaryModel, routePrompt } from './lib/agent-router.mjs';
import { EventStore } from './lib/event-store.mjs';
import { buildKnowledgeIndex } from './lib/knowledge-index.mjs';
import { PrinterClient } from './lib/printer-client.mjs';
import {
  audioRms, clamp, dockerSummary, linuxCameras, linuxMicrophones,
  mediaDevices, runBinary, storageDevices, systemMetrics
} from './lib/system-probe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const appVersion = '3.4.0';
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const openJarvisUrl = (process.env.OPENJARVIS_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const ollamaUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const dataDirectory = path.join(__dirname, 'data');
const settingsPath = path.join(dataDirectory, 'settings.json');
const eventStore = new EventStore(dataDirectory);
const printerClient = new PrinterClient({
  baseUrl: process.env.PRINTER_URL || '',
  apiKey: process.env.PRINTER_API_KEY || '',
  timeoutMs: process.env.PRINTER_TIMEOUT_MS || 2800
});
let printerSnapshot = { configured: printerClient.configured, online: false, ready: false, state: printerClient.configured ? 'checking' : 'unconfigured', checkedAt: new Date().toISOString() };
const printerSubscribers = new Set();
let knowledgeCache = null;
const wakeEventToken = crypto.randomBytes(32).toString('hex');
const dashboardAccessPin = String(process.env.DASHBOARD_ACCESS_PIN || process.env.OPS_CONTROL_PIN || '');
const helperPath = process.env.OPS_HELPER_PATH || '/usr/local/sbin/jarvis-service-control';
const primaryModel = resolvePrimaryModel(process.env);
const models = { primary: primaryModel };

function asBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}
function cleanText(value, limit = 1200) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, limit);
}
function safeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}
function wakePhrases(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const phrases = source.map((item) => cleanText(item, 40).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8);
  return [...new Set(phrases.length ? phrases : ['hey jarvis', 'jarvis', 'جارفيس', 'يا جارفيس'])];
}
function voiceVocabulary(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const seen = new Set(); const terms = [];
  for (const item of source) {
    const term = cleanText(item, 48).normalize('NFKC').replace(/[^\p{L}\p{N}._+ -]+/gu, ' ').replace(/\s+/g, ' ').trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key); terms.push(term);
    if (terms.length >= 24) break;
  }
  return terms;
}

const defaultSettings = {
  source: 'browser', browserCamera: '', browserMicrophone: '', piCamera: '', piMicrophone: '',
  personDetection: true, voiceActivity: true, wakeWord: true, doubleClap: true,
  autoSpeak: true, autoRepair: asBool(process.env.AUTO_REPAIR_ENABLED, process.platform === 'linux'), personThreshold: 0.55,
  micSensitivity: 0.18, wakeSensitivity: 0.55, clapSensitivity: 0.34,
  doubleClapWindow: 700, scanInterval: 900, gestureControl: true, gestureSensitivity: 0.42, accent: '#64e8ff',
  voiceLanguage: 'en-US', wakePhrases: ['hey jarvis', 'jarvis', 'جارفيس', 'يا جارفيس'],
  voiceVocabulary: ['OpenJarvis', 'Ollama', 'Docker', 'Moonraker', 'Klipper', 'Raspberry Pi', 'Tailscale', 'CodeAct', 'OpenHands', 'Hatclanker'], recognitionConfidence: 0.35, commandSilenceMs: 700,
  voiceAutoStart: true, preferLocalRecognition: true, echoCancellation: true, noiseSuppression: true, autoGainControl: true, bargeIn: false,
  ttsVoice: '', ttsRate: 1.02, ttsPitch: 0.92, ttsVolume: 1, wakeResponse: 'Yes?'
};
let settings = { ...defaultSettings };

function validateSettings(input = {}) {
  const accent = /^#[0-9a-f]{6}$/i.test(String(input.accent || '')) ? String(input.accent) : defaultSettings.accent;
  return {
    source: input.source === 'pi' ? 'pi' : 'browser',
    browserCamera: cleanText(input.browserCamera, 180), browserMicrophone: cleanText(input.browserMicrophone, 180),
    piCamera: /^\/dev\/video\d+$/.test(String(input.piCamera || '')) ? String(input.piCamera) : '',
    piMicrophone: /^plughw:\d+,\d+$/.test(String(input.piMicrophone || '')) ? String(input.piMicrophone) : '',
    personDetection: input.personDetection !== false, voiceActivity: input.voiceActivity !== false,
    wakeWord: input.wakeWord !== false, doubleClap: input.doubleClap !== false,
    autoSpeak: input.autoSpeak !== false, autoRepair: input.autoRepair === true,
    personThreshold: safeNumber(input.personThreshold, defaultSettings.personThreshold, 0.25, 0.95),
    micSensitivity: safeNumber(input.micSensitivity, defaultSettings.micSensitivity, 0.01, 0.8),
    wakeSensitivity: safeNumber(input.wakeSensitivity, defaultSettings.wakeSensitivity, 0.2, 0.95),
    clapSensitivity: safeNumber(input.clapSensitivity, defaultSettings.clapSensitivity, 0.08, 0.95),
    gestureControl: input.gestureControl !== false,
    gestureSensitivity: safeNumber(input.gestureSensitivity, defaultSettings.gestureSensitivity, 0.18, 0.8),
    doubleClapWindow: Math.round(safeNumber(input.doubleClapWindow, defaultSettings.doubleClapWindow, 300, 1500)),
    scanInterval: Math.round(safeNumber(input.scanInterval, defaultSettings.scanInterval, 300, 4000)), accent,
    voiceLanguage: /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(String(input.voiceLanguage || '')) ? String(input.voiceLanguage) : defaultSettings.voiceLanguage,
    wakePhrases: wakePhrases(input.wakePhrases),
    voiceVocabulary: input.voiceVocabulary == null ? [...defaultSettings.voiceVocabulary] : voiceVocabulary(input.voiceVocabulary),
    recognitionConfidence: safeNumber(input.recognitionConfidence, defaultSettings.recognitionConfidence, 0.1, 0.95),
    commandSilenceMs: Math.round(safeNumber(input.commandSilenceMs, defaultSettings.commandSilenceMs, 300, 1800)),
    voiceAutoStart: input.voiceAutoStart !== false, preferLocalRecognition: input.preferLocalRecognition !== false, echoCancellation: input.echoCancellation !== false,
    noiseSuppression: input.noiseSuppression !== false, autoGainControl: input.autoGainControl !== false, bargeIn: input.bargeIn === true,
    ttsVoice: cleanText(input.ttsVoice, 180), ttsRate: safeNumber(input.ttsRate, defaultSettings.ttsRate, 0.7, 1.4),
    ttsPitch: safeNumber(input.ttsPitch, defaultSettings.ttsPitch, 0.6, 1.3), ttsVolume: safeNumber(input.ttsVolume, defaultSettings.ttsVolume, 0.2, 1),
    wakeResponse: input.wakeResponse == null ? defaultSettings.wakeResponse : cleanText(input.wakeResponse, 60)
  };
}
async function loadSettings() {
  await fs.mkdir(dataDirectory, { recursive: true });
  try { settings = validateSettings(JSON.parse(await fs.readFile(settingsPath, 'utf8'))); }
  catch { settings = { ...defaultSettings }; }
}
function openJarvisHeaders(extra = {}) {
  const headers = { ...extra };
  if (process.env.OPENJARVIS_API_KEY) headers.Authorization = `Bearer ${process.env.OPENJARVIS_API_KEY}`;
  return headers;
}
async function fetchJson(url, options = {}, timeoutMs = 3000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function serviceStatus() {
  const [jarvis, ollama] = await Promise.allSettled([
    fetchJson(`${openJarvisUrl}/health`, { headers: openJarvisHeaders() }),
    fetchJson(`${ollamaUrl}/api/tags`)
  ]);
  return {
    openjarvis: { online: jarvis.status === 'fulfilled', detail: jarvis.status === 'fulfilled' ? (jarvis.value.status || 'ready') : 'offline' },
    ollama: { online: ollama.status === 'fulfilled', models: ollama.status === 'fulfilled' ? (ollama.value.models || []).map((item) => item.name) : [] }
  };
}
async function googleConnectorStatus() {
  const base = path.join(os.homedir(), '.openjarvis', 'connectors');
  const shared = await fs.access(path.join(base, 'google.json')).then(() => true).catch(() => false);
  const names = ['gdrive', 'gmail', 'gmail_imap', 'gcalendar', 'gtasks', 'gcontacts'];
  const entries = await Promise.all(names.map(async (name) => [name, shared || await fs.access(path.join(base, `${name}.json`)).then(() => true).catch(() => false)]));
  return {
    connected: shared || entries.some(([, value]) => value), sharedOAuth: shared,
    connectors: Object.fromEntries(entries), directory: base,
    scopesNote: 'Actual access is limited to the Google APIs and OAuth scopes authorized in OpenJarvis.'
  };
}
function routeModel(prompt) {
  return routePrompt(prompt, primaryModel);
}

function traceAgentName(trace) {
  return cleanText(trace.agent_id || trace.agent || trace.agent_type || trace.metadata?.agent_id || trace.metadata?.agent || 'unknown', 80);
}
function traceKind(trace) {
  const name = traceAgentName(trace).toLowerCase();
  if (name.includes('openhands') || name.includes('code')) return 'code';
  if (name.includes('research')) return 'research';
  if (name.includes('monitor') || name.includes('operative')) return 'monitor';
  return 'agent';
}
function stepPreview(step) {
  const type = cleanText(step.step_type || step.type || 'step', 60).toLowerCase();
  const tool = cleanText(step.tool_name || step.name || step.action || '', 80);
  let content = '';
  if (/tool|code|execution|observation|result|citation|search/.test(type)) {
    const value = step.output ?? step.result ?? step.content ?? step.observation ?? '';
    content = cleanText(typeof value === 'string' ? value : JSON.stringify(value), 760);
  }
  return { type, tool, content, durationMs: Number(step.duration_ms || step.latency_ms || 0) || 0, success: step.success !== false };
}
function normaliseTrace(trace) {
  const output = cleanText(trace.output || trace.response || trace.result || trace.final_answer || '', 1600);
  const urls = [...new Set((output.match(/https?:\/\/[^\s)\]}>,]+/g) || []).slice(0, 8))];
  return {
    id: cleanText(trace.id || trace.trace_id || crypto.randomUUID(), 100), agent: traceAgentName(trace), kind: traceKind(trace),
    createdAt: trace.created_at || trace.started_at || null, durationMs: Number(trace.duration_ms || trace.total_latency_ms || 0) || 0,
    success: trace.success !== false && !trace.error, input: cleanText(trace.input || trace.query || trace.prompt || '', 420), output,
    citations: urls, steps: Array.isArray(trace.steps) ? trace.steps.slice(-30).map(stepPreview) : []
  };
}
async function agentSnapshot() {
  const [traceResult, telemetryResult, memoryResult] = await Promise.allSettled([
    fetchJson(`${openJarvisUrl}/v1/traces?limit=40`, { headers: openJarvisHeaders() }, 4500),
    fetchJson(`${openJarvisUrl}/v1/telemetry/stats`, { headers: openJarvisHeaders() }, 4500),
    fetchJson(`${openJarvisUrl}/v1/memory/stats`, { headers: openJarvisHeaders() }, 4500)
  ]);
  const traces = traceResult.status === 'fulfilled' ? (traceResult.value.traces || []).map(normaliseTrace) : [];
  return {
    online: traceResult.status === 'fulfilled' || telemetryResult.status === 'fulfilled', traces,
    lanes: { code: traces.filter((trace) => trace.kind === 'code').slice(0, 8), research: traces.filter((trace) => trace.kind === 'research').slice(0, 8), monitor: traces.filter((trace) => trace.kind === 'monitor').slice(0, 8) },
    telemetry: telemetryResult.status === 'fulfilled' ? telemetryResult.value : null,
    memory: memoryResult.status === 'fulfilled' ? memoryResult.value : null,
    error: traceResult.status === 'rejected' ? cleanText(traceResult.reason?.message || 'OpenJarvis unavailable', 160) : null
  };
}
async function operationStatus() {
  if (process.platform !== 'linux') return { available: false, platform: process.platform, maintenancePersistent: false, maintenanceUntilReboot: false, services: [] };
  try {
    const output = await runBinary('sudo', ['-n', helperPath, 'status'], { timeout: 5000, maxBuffer: 512 * 1024 });
    return { available: true, platform: process.platform, ...JSON.parse(output) };
  } catch (error) {
    return { available: false, platform: process.platform, error: cleanText(error.stderr || error.message, 220), services: [] };
  }
}
function verifyPin(input) {
  const expected = String(process.env.OPS_CONTROL_PIN || '');
  const actual = String(input || '');
  if (!expected || !actual) return false;
  const left = crypto.createHash('sha256').update(expected).digest();
  const right = crypto.createHash('sha256').update(actual).digest();
  return crypto.timingSafeEqual(left, right);
}
const operationAttempts = new Map();
function operationRateLimited(key) {
  const now = Date.now();
  const recent = (operationAttempts.get(key) || []).filter((timestamp) => now - timestamp < 60_000);
  recent.push(now); operationAttempts.set(key, recent);
  return recent.length > 8;
}

const dashboardSessions = new Map();
const dashboardLoginAttempts = new Map();
function cookieValue(request, name) {
  const prefix = `${name}=`;
  for (const part of String(request.get('Cookie') || '').split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return '';
}
function sessionDigest(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function dashboardAuthenticated(request) {
  if (!dashboardAccessPin) return true;
  const token = cookieValue(request, 'jarvis_session');
  const expiresAt = dashboardSessions.get(sessionDigest(token));
  if (!expiresAt || expiresAt < Date.now()) { if (token) dashboardSessions.delete(sessionDigest(token)); return false; }
  return true;
}
function verifyDashboardPin(input) {
  const actual = String(input || '');
  if (!dashboardAccessPin || !actual) return false;
  const left = crypto.createHash('sha256').update(dashboardAccessPin).digest();
  const right = crypto.createHash('sha256').update(actual).digest();
  return crypto.timingSafeEqual(left, right);
}
function loginRateLimited(key) {
  const now = Date.now();
  const recent = (dashboardLoginAttempts.get(key) || []).filter((timestamp) => now - timestamp < 10 * 60_000);
  recent.push(now); dashboardLoginAttempts.set(key, recent);
  return recent.length > 10;
}
function requireDashboardAuth(request, response, next) {
  if (dashboardAuthenticated(request)) return next();
  response.status(401).json({ error: 'Enter the JARVIS dashboard PIN.', authenticationRequired: true });
}

const wakeState = { process: null, running: false, ready: false, model: false, lastEvent: null, error: null };
async function stopWakeListener() {
  if (wakeState.process && !wakeState.process.killed) wakeState.process.kill('SIGTERM');
  wakeState.process = null; wakeState.running = false; wakeState.ready = false;
}
async function startWakeListener() {
  await stopWakeListener(); wakeState.error = null;
  if (process.platform !== 'linux' || !asBool(process.env.ENABLE_PI_WAKE_LISTENER, true)) return;
  if (settings.source !== 'pi' || !settings.piMicrophone || (!settings.wakeWord && !settings.doubleClap)) return;
  const microphones = await linuxMicrophones();
  if (!microphones.some((item) => item.id === settings.piMicrophone)) { wakeState.error = 'Selected Pi microphone is not available.'; return; }
  const python = process.env.WAKE_PYTHON || path.join(__dirname, '.wake-venv', 'bin', 'python');
  try { await fs.access(python); } catch { wakeState.error = `Wake listener Python was not found at ${python}. Run install-pi.sh.`; return; }
  const args = [path.join(__dirname, 'lib', 'wake-listener.py'), '--device', settings.piMicrophone,
    '--callback', `http://127.0.0.1:${port}/api/wake-event`, '--token', wakeEventToken,
    '--wake-threshold', String(settings.wakeSensitivity), '--clap-threshold', String(settings.clapSensitivity),
    '--double-clap-ms', String(settings.doubleClapWindow)];
  if (settings.wakeWord) args.push('--wake-enabled');
  if (settings.doubleClap) args.push('--clap-enabled');
  const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  wakeState.process = child; wakeState.running = true;
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk; const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.type === 'ready') { wakeState.ready = true; wakeState.model = Boolean(message.wake_model); }
        else if (message.type === 'activation') wakeState.lastEvent = { ...message, at: new Date().toISOString() };
        else if (message.type.endsWith('error')) wakeState.error = cleanText(message.message, 220);
      } catch {}
    }
  });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { wakeState.error = cleanText(chunk, 220); });
  child.on('exit', (code) => {
    if (wakeState.process === child) { wakeState.process = null; wakeState.running = false; wakeState.ready = false; if (code && !wakeState.error) wakeState.error = `Wake listener exited with code ${code}.`; }
  });
}

app.disable('x-powered-by');
app.use((request, response, next) => {
  const scriptPolicy = request.path === '/settings' ? "'self' 'unsafe-eval' 'wasm-unsafe-eval'" : "'self' 'wasm-unsafe-eval'";
  response.set({
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(self), on-device-speech-recognition=(self), geolocation=()',
    'Content-Security-Policy': `default-src 'self'; script-src ${scriptPolicy}; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'`
  }); next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/vendor/tfjs', express.static(path.join(__dirname, 'node_modules', '@tensorflow', 'tfjs', 'dist'), { maxAge: '30d' }));
app.use('/vendor/coco-ssd', express.static(path.join(__dirname, 'node_modules', '@tensorflow-models', 'coco-ssd', 'dist'), { maxAge: '30d' }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build'), { maxAge: '30d' }));
app.use('/vendor/mediapipe', express.static(path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision'), { maxAge: '30d' }));

app.post('/api/wake-event', async (request, response) => {
  const token = String(request.get('X-Wake-Token') || '');
  if (token.length !== wakeEventToken.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(wakeEventToken))) { response.status(403).json({ error: 'Forbidden' }); return; }
  const kind = request.body?.kind === 'double_clap' ? 'double_clap' : 'wake_word';
  const event = await eventStore.append('wake', kind === 'double_clap' ? 'Double clap detected' : 'Hey Jarvis detected', { kind, score: safeNumber(request.body?.score, 0, 0, 1), source: 'pi' });
  wakeState.lastEvent = event; response.json({ ok: true });
});
function enforceSameOrigin(request, response, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
  const origin = request.get('Origin');
  if (!origin) return next();
  try { if (new URL(origin).host === request.get('Host')) return next(); } catch {}
  response.status(403).json({ error: 'Cross-origin mutation blocked.' });
}
app.use('/api', enforceSameOrigin);
app.get('/api/health', (_request, response) => response.json({ status: 'ok', version: appVersion }));
app.get('/api/auth/status', (request, response) => response.json({ required: Boolean(dashboardAccessPin), authenticated: dashboardAuthenticated(request) }));
app.post('/api/auth/login', (request, response) => {
  if (!dashboardAccessPin) { response.json({ ok: true, required: false }); return; }
  if (loginRateLimited(request.ip)) { response.status(429).json({ error: 'Too many login attempts. Wait ten minutes.' }); return; }
  if (!verifyDashboardPin(request.body?.pin)) { response.status(403).json({ error: 'Dashboard PIN is incorrect.' }); return; }
  const token = crypto.randomBytes(32).toString('base64url');
  dashboardSessions.set(sessionDigest(token), Date.now() + 12 * 60 * 60_000);
  const secure = request.secure || String(request.get('X-Forwarded-Proto') || '').toLowerCase() === 'https';
  response.set('Set-Cookie', `jarvis_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure ? '; Secure' : ''}`);
  response.json({ ok: true, expiresIn: 43200 });
});
app.post('/api/auth/logout', (request, response) => {
  const token = cookieValue(request, 'jarvis_session');
  if (token) dashboardSessions.delete(sessionDigest(token));
  response.set('Set-Cookie', 'jarvis_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  response.json({ ok: true });
});
app.use('/api', requireDashboardAuth);

app.get('/api/config', (_request, response) => response.json({ name: 'JARVIS', version: appVersion, ttsMode: process.env.TTS_MODE || 'local', fishVoiceId: process.env.FISH_AUDIO_VOICE_ID || '', model: primaryModel, models, agents: Object.fromEntries(Object.entries(agentRoles).map(([route, role]) => [route, role.name])), timezone: 'Asia/Dubai', piOnly: true, operationsEnabled: Boolean(process.env.OPS_CONTROL_PIN), printerConfigured: printerClient.configured }));
app.get('/api/metrics', async (_request, response) => response.json(await systemMetrics()));
app.get('/api/storage', async (_request, response) => response.json({ devices: await storageDevices() }));
app.get('/api/docker', async (_request, response) => response.json(await dockerSummary()));
app.get('/api/agents', async (_request, response) => response.json(await agentSnapshot()));
app.get('/api/events/history', (_request, response) => response.json(eventStore.snapshot()));
app.get('/api/operations/status', async (_request, response) => response.json(await operationStatus()));
app.get('/api/wake/status', (_request, response) => response.json({ ...wakeState, process: undefined, configured: settings.source === 'pi' && Boolean(settings.piMicrophone) }));
app.get('/api/knowledge', async (_request, response) => {
  if (!knowledgeCache || Date.now() - knowledgeCache.createdAt > 30_000) {
    const value = await buildKnowledgeIndex({ projectRoot: __dirname, roots: process.env.KNOWLEDGE_ROOTS || '', maxDepth: 4, maxNodes: 180 });
    knowledgeCache = { value, createdAt: Date.now() };
  }
  response.set('Cache-Control', 'private, max-age=20'); response.json(knowledgeCache.value);
});
app.get('/api/printer/status', (_request, response) => { response.set('Cache-Control', 'no-store'); response.json(printerSnapshot); });
app.get('/api/printer/events', (request, response) => {
  response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  response.flushHeaders(); response.write(`event: printer\ndata: ${JSON.stringify(printerSnapshot)}\n\n`);
  const push = (snapshot) => response.write(`event: printer\ndata: ${JSON.stringify(snapshot)}\n\n`);
  printerSubscribers.add(push);
  const keepalive = setInterval(() => response.write(': printer-pulse\n\n'), 20_000);
  request.on('close', () => { clearInterval(keepalive); printerSubscribers.delete(push); });
});
app.get('/api/events', (request, response) => {
  response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  response.flushHeaders(); response.write(`event: snapshot\ndata: ${JSON.stringify(eventStore.snapshot())}\n\n`);
  const unsubscribe = eventStore.subscribe((event) => response.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`));
  const keepalive = setInterval(() => response.write(': pulse\n\n'), 20_000);
  request.on('close', () => { clearInterval(keepalive); unsubscribe(); });
});
app.get('/api/status', async (_request, response) => {
  const [services, google, operations] = await Promise.all([serviceStatus(), googleConnectorStatus(), operationStatus()]);
  response.json({ services, google, operations, wake: { ...wakeState, process: undefined } });
});
app.get('/api/settings', (_request, response) => response.json(settings));
app.put('/api/settings', async (request, response) => {
  const next = validateSettings({ ...settings, ...request.body });
  if (next.piCamera && process.platform === 'linux' && !(await linuxCameras()).some((item) => item.id === next.piCamera)) { response.status(400).json({ error: 'Selected Pi camera is not currently available.' }); return; }
  if (next.piMicrophone && process.platform === 'linux' && !(await linuxMicrophones()).some((item) => item.id === next.piMicrophone)) { response.status(400).json({ error: 'Selected Pi microphone is not currently available.' }); return; }
  settings = next; await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await startWakeListener(); await eventStore.append('settings', 'Perception settings updated', { source: settings.source, wakeWord: settings.wakeWord, doubleClap: settings.doubleClap });
  response.json(settings);
});
app.post('/api/wake/test', async (_request, response) => {
  const event = await eventStore.append('wake', 'Wake signal test', { kind: 'wake_word', source: 'test', score: 1 });
  response.json({ ok: true, event });
});
app.get('/api/media/devices', async (_request, response) => { response.set('Cache-Control', 'no-store'); response.json(await mediaDevices()); });
app.get('/api/media/pi-camera/frame.jpg', async (request, response) => {
  const requestedDevice = String(request.query.device || '');
  if (!(await linuxCameras()).some((item) => item.id === requestedDevice)) { response.status(400).json({ error: 'Choose a camera returned by /api/media/devices.' }); return; }
  try {
    const frame = await runBinary('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'v4l2', '-i', requestedDevice, '-frames:v', '1', '-vf', 'scale=960:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { encoding: 'buffer', timeout: 9000, maxBuffer: 8 * 1024 * 1024 });
    response.set({ 'Cache-Control': 'no-store, max-age=0', 'Content-Type': 'image/jpeg', 'Content-Length': frame.length }); response.send(frame);
  } catch (error) { response.status(503).json({ error: `Pi camera capture failed: ${error.message}` }); }
});
app.get('/api/media/pi-microphone/level', async (request, response) => {
  const requestedDevice = String(request.query.device || '');
  if (!(await linuxMicrophones()).some((item) => item.id === requestedDevice)) { response.status(400).json({ error: 'Choose a microphone returned by /api/media/devices.' }); return; }
  try {
    const audio = await runBinary('arecord', ['-D', requestedDevice, '-q', '-d', '1', '-f', 'S16_LE', '-r', '16000', '-c', '1', '-t', 'raw'], { encoding: 'buffer', timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    response.set('Cache-Control', 'no-store'); response.json({ level: clamp(audioRms(audio), 0, 1), device: requestedDevice });
  } catch (error) { response.status(503).json({ error: `Pi microphone sample failed: ${error.message}` }); }
});

app.post('/api/operations/action', async (request, response) => {
  const actions = { 'restart-all': 'RESTART ALL', 'stop-until-reboot': 'STOP UNTIL REBOOT', 'maintenance-on': 'ENTER MAINTENANCE', resume: 'RESUME SERVICES', repair: 'REPAIR SERVICES' };
  const action = String(request.body?.action || '');
  if (!actions[action]) { response.status(400).json({ error: 'Unknown operation.' }); return; }
  if (operationRateLimited(request.ip)) { response.status(429).json({ error: 'Too many control attempts. Wait one minute.' }); return; }
  if (!verifyPin(request.body?.pin)) { response.status(403).json({ error: 'Control PIN is incorrect or not configured.' }); return; }
  if (String(request.body?.confirmation || '').trim().toUpperCase() !== actions[action]) { response.status(400).json({ error: `Type ${actions[action]} exactly to confirm.` }); return; }
  if (process.platform !== 'linux') { response.status(501).json({ error: 'Service controls only run on the Raspberry Pi Linux host.' }); return; }
  try {
    const output = await runBinary('sudo', ['-n', helperPath, action], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    const result = JSON.parse(output); await eventStore.append('control', `Operation completed: ${action}`, { action, maintenancePersistent: result.maintenancePersistent, maintenanceUntilReboot: result.maintenanceUntilReboot });
    response.json({ ok: true, result });
  } catch (error) {
    await eventStore.append('alert', `Operation failed: ${action}`, { error: cleanText(error.stderr || error.message, 200) });
    response.status(500).json({ error: cleanText(error.stderr || error.message, 320) });
  }
});

app.post('/api/printer/action', async (request, response) => {
  const confirmations = { pause: 'PAUSE PRINT', resume: 'RESUME PRINT', cancel: 'CANCEL PRINT' };
  const action = String(request.body?.action || '');
  if (!confirmations[action]) { response.status(400).json({ error: 'Unknown printer operation.' }); return; }
  if (operationRateLimited(`printer:${request.ip}`)) { response.status(429).json({ error: 'Too many control attempts. Wait one minute.' }); return; }
  if (!verifyPin(request.body?.pin)) { response.status(403).json({ error: 'Control PIN is incorrect or not configured.' }); return; }
  if (String(request.body?.confirmation || '').trim().toUpperCase() !== confirmations[action]) { response.status(400).json({ error: `Type ${confirmations[action]} exactly to confirm.` }); return; }
  if (!printerClient.configured) { response.status(503).json({ error: 'Set PRINTER_URL on the Pi first.' }); return; }
  try {
    printerSnapshot = await printerClient.action(action);
    for (const push of printerSubscribers) push(printerSnapshot);
    await eventStore.append('printer', `Printer ${action} requested`, { action, state: printerSnapshot.state, filename: printerSnapshot.filename || '' });
    response.json({ ok: true, result: printerSnapshot });
  } catch (error) {
    await eventStore.append('alert', `Printer ${action} failed`, { action, error: cleanText(error.message, 200) });
    response.status(502).json({ error: cleanText(error.message, 260) });
  }
});

app.post('/api/chat', async (request, response) => {
  const prompt = cleanText(request.body?.prompt, 6000); const history = Array.isArray(request.body?.history) ? request.body.history.slice(-16) : [];
  if (!prompt) { response.status(400).json({ error: 'Prompt must contain 1–6000 characters.' }); return; }
  const selected = routeModel(prompt); let liveContext = '';
  if (/\b(docker|container|compose|service|cpu|ram|memory|storage|disk|temperature|gpu)\b/i.test(prompt)) {
    const [metrics, docker, operations] = await Promise.all([systemMetrics(), dockerSummary(), operationStatus()]);
    liveContext = `\nLive read-only system context (do not claim actions):\n${JSON.stringify({ metrics, docker, operations }).slice(0, 12_000)}`;
  }
  if (/\b(printer|print|printing|klipper|moonraker|nozzle|bed|gcode|time left|eta)\b/i.test(prompt)) {
    liveContext += `\nLive read-only 3D printer context (never claim or execute a printer action):\n${JSON.stringify(printerSnapshot).slice(0, 5000)}`;
  }
  const activeRole = agentRoles[selected.route] || agentRoles.GENERAL;
  const messages = [{ role: 'system', content: `You are JARVIS, a private assistant running on a Raspberry Pi 5. You are currently operating through the ${activeRole.name} specialist role. ${activeRole.instruction} Be precise, calm, helpful, and concise. Never claim a tool or maintenance action succeeded unless the provided result confirms it. You may explain Docker state from supplied read-only context, but never invent containers or metrics. Every specialist role uses the same local model: ${primaryModel}.${liveContext}` },
    ...history.filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string').map((item) => ({ role: item.role, content: cleanText(item.content, 6000) })), { role: 'user', content: prompt }];
  try {
    const result = await fetchJson(`${openJarvisUrl}/v1/chat/completions`, { method: 'POST', headers: openJarvisHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ model: selected.model, messages, stream: false }) }, 180_000);
    const content = result.choices?.[0]?.message?.content; if (!content) throw new Error('OpenJarvis returned no message.');
    await eventStore.append('agent', 'JARVIS completed a request', { route: selected.route, source: 'openjarvis' }); response.json({ content, ...selected, source: 'openjarvis' }); return;
  } catch (jarvisError) {
    if (!asBool(process.env.ALLOW_OLLAMA_FALLBACK, true)) { response.status(502).json({ error: `OpenJarvis is unavailable: ${jarvisError.message}` }); return; }
  }
  try {
    const result = await fetchJson(`${ollamaUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: selected.model, messages, stream: false, keep_alive: '2m' }) }, 180_000);
    await eventStore.append('agent', 'JARVIS completed a request', { route: selected.route, source: 'ollama-fallback' }); response.json({ content: result.message?.content || 'No response generated.', ...selected, source: 'ollama-fallback' });
  } catch (error) { response.status(502).json({ error: `Neither OpenJarvis nor Ollama could answer: ${error.message}` }); }
});

app.post('/api/tts', async (request, response) => {
  const text = cleanText(request.body?.text, 2500); const requestedMode = request.body?.mode === 'fish' ? 'fish' : 'local';
  if (!text) { response.status(400).json({ error: 'Speech text is empty.' }); return; }
  if (requestedMode !== 'fish') { response.status(409).json({ error: 'Use the browser local voice for offline speech.', fallback: 'browser' }); return; }
  const apiKey = process.env.FISH_AUDIO_API_KEY; const voiceId = process.env.FISH_AUDIO_VOICE_ID;
  if (!apiKey || !voiceId) { response.status(503).json({ error: 'Fish Audio is not configured.', fallback: 'browser' }); return; }
  try {
    const fishResponse = await fetch('https://api.fish.audio/v1/tts', { method: 'POST', signal: AbortSignal.timeout(120_000), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', model: process.env.FISH_AUDIO_MODEL || 's2.1-pro-free' }, body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3', latency: 'balanced', prosody: { speed: 1.02, volume: 0 } }) });
    if (!fishResponse.ok) throw new Error(`Fish Audio returned HTTP ${fishResponse.status}`);
    response.type(fishResponse.headers.get('content-type') || 'audio/mpeg'); response.send(Buffer.from(await fishResponse.arrayBuffer()));
  } catch (error) { response.status(502).json({ error: error.message, fallback: 'browser' }); }
});

app.get('/settings', (_request, response) => response.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use((error, _request, response, _next) => { console.error('Dashboard request failed:', error.message); response.status(500).json({ error: 'Dashboard request failed.' }); });

let knownTraceIds = new Set(); let traceInitialised = false; let lastHealthSignature = ''; let lastRepairAt = 0;
let printerRefreshActive = false; let monitorTickActive = false;
async function refreshPrinterStatus() {
  if (printerRefreshActive) return;
  printerRefreshActive = true;
  try {
    const previousSignature = `${printerSnapshot.online}:${printerSnapshot.state}:${printerSnapshot.filename || ''}`;
    printerSnapshot = await printerClient.status();
    const nextSignature = `${printerSnapshot.online}:${printerSnapshot.state}:${printerSnapshot.filename || ''}`;
    for (const push of printerSubscribers) push(printerSnapshot);
    if (previousSignature !== nextSignature) await eventStore.append('printer', printerSnapshot.online ? `Printer state: ${printerSnapshot.state}` : 'Printer offline', { state: printerSnapshot.state, filename: printerSnapshot.filename || '' });
  } finally { printerRefreshActive = false; }
}
async function monitorTick() {
  if (monitorTickActive) return;
  monitorTickActive = true;
  try {
    const [services, agents, operations] = await Promise.all([serviceStatus(), agentSnapshot(), operationStatus()]);
    const signature = JSON.stringify({ jarvis: services.openjarvis.online, ollama: services.ollama.online, maintenance: operations.maintenancePersistent || operations.maintenanceUntilReboot });
    if (lastHealthSignature && signature !== lastHealthSignature) await eventStore.append('health', 'Core service state changed', { openjarvis: services.openjarvis.online, ollama: services.ollama.online, maintenance: operations.maintenancePersistent || operations.maintenanceUntilReboot });
    lastHealthSignature = signature;
    const currentIds = new Set(agents.traces.map((trace) => trace.id));
    if (traceInitialised) {
      for (const trace of agents.traces.slice().reverse()) if (!knownTraceIds.has(trace.id)) await eventStore.append(trace.kind, `${trace.agent} trace ${trace.success ? 'completed' : 'failed'}`, { traceId: trace.id, durationMs: trace.durationMs, steps: trace.steps.length });
    }
    knownTraceIds = currentIds; traceInitialised = true;
    const maintenance = operations.maintenancePersistent || operations.maintenanceUntilReboot;
    const repairable = (operations.services || []).filter((item) => !['active', 'activating', 'reloading'].includes(item.active));
    if (settings.autoRepair && !maintenance && repairable.length && Date.now() - lastRepairAt > 10 * 60_000) {
      lastRepairAt = Date.now();
      try { await runBinary('sudo', ['-n', helperPath, 'repair'], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 }); await eventStore.append('repair', 'Constrained auto-repair restarted inactive JARVIS services', { services: repairable.map((item) => item.name).join(', ') }); }
      catch (error) { await eventStore.append('alert', 'Constrained auto-repair failed', { error: cleanText(error.stderr || error.message, 200) }); }
    }
  } catch {}
  finally { monitorTickActive = false; }
}

await eventStore.init(); await loadSettings(); await eventStore.append('boot', 'JARVIS command center starting', { version: appVersion, platform: process.platform });
const server = app.listen(port, host, async () => {
  console.log(`JARVIS Command Center listening at http://${host}:${port}`); console.log(`OpenJarvis: ${openJarvisUrl} | Ollama: ${ollamaUrl}`);
  await startWakeListener(); void monitorTick(); void refreshPrinterStatus();
});
const monitorTimer = setInterval(() => void monitorTick(), 12_000);
const printerTimer = setInterval(() => void refreshPrinterStatus(), 2_000);
async function shutdown() {
  clearInterval(monitorTimer); clearInterval(printerTimer); await stopWakeListener(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

