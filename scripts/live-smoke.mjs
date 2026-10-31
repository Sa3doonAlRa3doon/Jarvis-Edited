import dotenv from 'dotenv';

// A shell may already contain stale dashboard values. For this explicit live
// test, the repository's local .env is the source of truth; never print it.
dotenv.config({ override: true, quiet: true });

const baseUrl = String(process.env.JARVIS_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8788}`).replace(/\/$/, '');
const args = new Set(process.argv.slice(2));
const requireGoogle = args.has('--require-google');
const requireModel = args.has('--require-model');
const requireVision = args.has('--require-vision');
const requireStirling = args.has('--require-stirling');
const requireStirlingProcessing = args.has('--require-stirling-processing');
const skipTts = args.has('--skip-tts');
const publicPrompts = [
  ['weather', 'weather in Dubai'], ['air_quality', 'air quality in Dubai'], ['map', 'map of Dubai'], ['time', 'local time in Dubai'],
  ['sun', 'sunrise in Dubai'], ['exchange', 'convert 20 USD to EUR'], ['holiday', 'public holidays in AE 2026'],
  ['earthquake', 'latest earthquakes'], ['iss', 'where is the ISS'], ['dictionary', 'define resilient'],
  ['wikipedia', 'Wikipedia Raspberry Pi summary'], ['crypto', 'bitcoin price'], ['github', 'Search GitHub for local voice assistant projects']
];
const googlePrompts = [
  ['gmail', 'Show my latest Gmail emails'], ['gcalendar', 'Show my upcoming calendar events'], ['gdrive', 'Find my latest Google Drive files'],
  ['gtasks', 'Show my Google Tasks'], ['gcontacts', 'Find my Google Contacts']
];

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 30_000) });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('json') ? await response.json().catch(() => ({})) : await response.arrayBuffer();
  return { status: response.status, body, headers: response.headers };
}

async function requestTransientSafe(path, options = {}, attempts = 2) {
  let last;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try {
      last = await request(path, options);
      if (last.status < 500 || attempt === attempts - 1) return last;
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return last;
}

async function waitForEngineeringRun(runId, { cookie, timeoutMs = 90_000, pollMs = 300 } = {}) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    latest = await request('/api/engineering/pipeline', { headers: { cookie } });
    if (latest.status === 200 && latest.body?.busy === false && latest.body?.last?.id === runId) return latest;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return latest || { status: 0, body: {} };
}

function jsonBody(body, extraHeaders = {}) {
  return { headers: { 'content-type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) };
}

function safeError(error) {
  return String(error?.message || error || 'request failed').replace(/\s+/g, ' ').slice(0, 240);
}

const result = { baseUrl, dashboard: {}, mission: null, vision: null, stirling: null, routines: null, memory: null, broadcast: null, media: null, analytics: null, statsDeck: null, voiceDiagnostics: null, engineeringChat: null, briefing: null, overlay: null, publicApis: [], google: { status: null, queries: [] }, tts: null, backends: {} };
let exitCode = 0;
let cookie = '';
try {
  const pin = String(process.env.DASHBOARD_ACCESS_PIN || '');
  if (!pin) throw new Error('DASHBOARD_ACCESS_PIN is not configured.');
  const login = await request('/api/auth/login', { method: 'POST', ...jsonBody({ pin }) });
  cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  result.dashboard.login = { status: login.status, ok: Boolean(login.body?.ok) };
  if (!login.body?.ok || !cookie) throw new Error(`dashboard login returned HTTP ${login.status}`);
  const health = await request('/api/health', { headers: { cookie } });
  result.dashboard.health = { status: health.status, ok: health.body?.status === 'ok', version: health.body?.version || null };
  const config = await request('/api/config', { headers: { cookie } });
  result.dashboard.config = { status: config.status, ok: config.body?.name === 'JARVIS', model: config.body?.model || null, visionRuntime: config.body?.visionRuntime || null, visionModel: config.body?.visionModel || null };
  try {
    const healthPlan = await request('/api/mission/plan', { method: 'POST', ...jsonBody({ prompt: 'show me the current system health and open example.com for a read-only view' }, { cookie }) });
    const engineeringPlan = await request('/api/mission/plan', { method: 'POST', ...jsonBody({ prompt: 'run the full engineering checks and let the Architect, Critic, and Debugger review the result' }, { cookie }) });
    const healthPolicy = healthPlan.body?.policy || {};
    const engineeringSteps = Array.isArray(engineeringPlan.body?.steps) ? engineeringPlan.body.steps.map((step) => step.id) : [];
    result.mission = {
      healthStatus: healthPlan.status,
      healthMode: healthPlan.body?.executionMode || null,
      healthSteps: Array.isArray(healthPlan.body?.steps) ? healthPlan.body.steps.length : 0,
      engineeringStatus: engineeringPlan.status,
      engineeringSteps,
      ok: healthPlan.status === 200 && healthPlan.body?.policy?.noSecretEntry === true && healthPolicy.noSilentExternalMutation === true && healthPolicy.screenFramesUserSelected === true && engineeringPlan.status === 200 && engineeringSteps.includes('engineering') && engineeringSteps.includes('critic') && engineeringSteps.includes('debugger')
    };
  } catch (error) {
    result.mission = { healthStatus: 0, healthMode: null, healthSteps: 0, engineeringStatus: 0, engineeringSteps: [], ok: false, error: safeError(error) };
  }
  try {
    const stirling = await request('/api/stirling/status', { headers: { cookie } });
    const healthProviderStatus = Number(stirling.body?.providerStatus);
    result.stirling = { status: stirling.status, configured: Boolean(stirling.body?.configured), online: Boolean(stirling.body?.online), baseHost: stirling.body?.baseHost || '', operations: Array.isArray(stirling.body?.operations) ? stirling.body.operations.length : 0, error: stirling.body?.error || null, providerStatus: Number.isInteger(healthProviderStatus) && healthProviderStatus >= 100 && healthProviderStatus <= 599 ? healthProviderStatus : null, ok: stirling.status === 200 && Array.isArray(stirling.body?.operations) && stirling.body.operations.length === 4 };
    if (requireStirlingProcessing && result.stirling.ok) {
      const processing = await request('/api/stirling/smoke', { method: 'POST', ...jsonBody({ operation: 'compress' }, { cookie }), timeoutMs: 180_000 });
      const processingProviderStatus = Number(processing.body?.status?.processing?.providerStatus);
      result.stirling.processing = { status: processing.status, ok: processing.status === 200 && processing.body?.ok === true, synthetic: processing.body?.synthetic === true, operation: processing.body?.operation || null, outputSignature: processing.body?.outputSignature || null, providerStatus: Number.isInteger(processingProviderStatus) && processingProviderStatus >= 100 && processingProviderStatus <= 599 ? processingProviderStatus : null, error: processing.status === 200 ? null : String(processing.body?.error || 'processing unavailable').slice(0, 240) };
      result.stirling.ok = result.stirling.ok && result.stirling.processing.ok;
    }
  } catch (error) { result.stirling = { status: 0, configured: false, online: false, baseHost: '', operations: 0, providerStatus: null, ok: false, error: safeError(error) }; }
  try {
    const status = await request('/api/vision/status', { headers: { cookie } });
    const runtime = status.body?.runtime || 'unknown';
    let analyze = null;
    if (runtime === 'ready') {
      const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      analyze = await request('/api/screen/analyze', { method: 'POST', ...jsonBody({ image, prompt: 'Describe this approved test snapshot briefly.' }, { cookie }), timeoutMs: 180_000 });
    }
    result.vision = { status: status.status, runtime, configured: Boolean(status.body?.configured), installed: Boolean(status.body?.installed), ready: Boolean(status.body?.ready), capabilityVerified: Boolean(status.body?.capabilityVerified), capabilitySource: status.body?.capabilitySource || '', model: status.body?.model || '', analyzeStatus: analyze?.status || 0, ok: status.status === 200 && (runtime !== 'ready' || analyze?.status === 200 && Boolean(analyze.body?.content)) };
  } catch (error) { result.vision = { status: 0, runtime: 'error', configured: false, installed: false, model: '', analyzeStatus: 0, ok: false, error: safeError(error) }; }
  try {
    const link = await request('/api/obs/overlay/link?theme=jarvis', { headers: { cookie } });
    const overlayUrl = typeof link.body?.url === 'string' ? new URL(link.body.url) : null;
    const token = overlayUrl?.searchParams.get('token') || '';
    const status = token ? await request(`/api/obs/overlay/status?token=${encodeURIComponent(token)}&theme=${encodeURIComponent(overlayUrl.searchParams.get('theme') || 'jarvis')}`, { headers: { cookie: '' } }) : null;
    result.overlay = { link: link.status, status: status?.status || 0, available: Boolean(link.body?.available), ok: link.status === 200 && Boolean(link.body?.available) && status?.status === 200 && status.body?.theme === 'jarvis' };
  } catch (error) {
    result.overlay = { link: 0, status: 0, available: false, ok: false, error: safeError(error) };
  }
  let routineId = '';
  try {
    const created = await request('/api/routines', { method: 'POST', ...jsonBody({ kind: 'health', name: 'Live smoke health', intervalMinutes: 5 }, { cookie }) });
    routineId = created.body?.routine?.id || '';
    const ran = routineId ? await request(`/api/routines/${encodeURIComponent(routineId)}/run`, { method: 'POST', ...jsonBody({}, { cookie }) }) : null;
    const removed = routineId ? await request(`/api/routines/${encodeURIComponent(routineId)}`, { method: 'DELETE', headers: { cookie } }) : null;
    result.routines = { create: created.status, run: ran?.status || 0, remove: removed?.status || 0, ok: created.status === 201 && ran?.status === 200 && removed?.status === 200, summary: ran?.body?.routine?.lastResult || '' };
  } catch (error) {
    result.routines = { create: 0, run: 0, remove: 0, ok: false, error: safeError(error) };
  }
  try {
    const chatNote = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'remember live smoke memory path check', history: [] }, { cookie }) });
    const chatReminder = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'remind me in 2 hours to remove live smoke reminder', history: [] }, { cookie }) });
    const note = await request('/api/notes', { method: 'POST', ...jsonBody({ title: 'Live smoke note', body: 'Local memory path check', tags: 'smoke,local' }, { cookie }) });
    const reminder = await request('/api/reminders', { method: 'POST', ...jsonBody({ title: 'Live smoke reminder', dueAt: new Date(Date.now() + 3_600_000).toISOString() }, { cookie }) });
    const noteId = note.body?.note?.id || ''; const reminderId = reminder.body?.reminder?.id || '';
    const chatNoteId = chatNote.body?.action?.note?.id || ''; const chatReminderId = chatReminder.body?.action?.reminder?.id || '';
    const removedNote = noteId ? await request(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE', headers: { cookie } }) : null;
    const removedReminder = reminderId ? await request(`/api/reminders/${encodeURIComponent(reminderId)}`, { method: 'DELETE', headers: { cookie } }) : null;
    const removedChatNote = chatNoteId ? await request(`/api/notes/${encodeURIComponent(chatNoteId)}`, { method: 'DELETE', headers: { cookie } }) : null;
    const removedChatReminder = chatReminderId ? await request(`/api/reminders/${encodeURIComponent(chatReminderId)}`, { method: 'DELETE', headers: { cookie } }) : null;
    result.memory = { chatNote: chatNote.status, chatReminder: chatReminder.status, note: note.status, reminder: reminder.status, removeNote: removedNote?.status || 0, removeReminder: removedReminder?.status || 0, removeChatNote: removedChatNote?.status || 0, removeChatReminder: removedChatReminder?.status || 0, ok: chatNote.status === 200 && chatReminder.status === 200 && note.status === 201 && reminder.status === 201 && removedNote?.status === 200 && removedReminder?.status === 200 && removedChatNote?.status === 200 && removedChatReminder?.status === 200 };
  } catch (error) {
    result.memory = { chatNote: 0, chatReminder: 0, note: 0, reminder: 0, removeNote: 0, removeReminder: 0, removeChatNote: 0, removeChatReminder: 0, ok: false, error: safeError(error) };
  }
  try {
    const state = await request('/api/broadcast/state', { headers: { cookie } });
    const created = await request('/api/broadcast/action', { method: 'POST', ...jsonBody({ type: 'timer_create', name: 'Live smoke broadcast', durationSeconds: 5 }, { cookie }) });
    const timerId = created.body?.timer?.id || '';
    const removed = timerId ? await request('/api/broadcast/action', { method: 'POST', ...jsonBody({ type: 'remove', kind: 'timer', id: timerId }, { cookie }) }) : null;
    result.broadcast = { state: state.status, create: created.status, remove: removed?.status || 0, mode: state.body?.mode || null, externalConnected: state.body?.externalConnected ?? null, ok: state.status === 200 && state.body?.mode === 'local-stage' && state.body?.externalConnected === false && created.status === 200 && removed?.status === 200 };
  } catch (error) {
    result.broadcast = { state: 0, create: 0, remove: 0, mode: null, externalConnected: null, ok: false, error: safeError(error) };
  }
  try {
    const state = await request('/api/media/state', { headers: { cookie } });
    const title = `Live smoke media ${Date.now()}`;
    const queued = await request('/api/media/action', { method: 'POST', ...jsonBody({ type: 'enqueue', title, artist: 'smoke', durationSeconds: 0 }, { cookie }) });
    const mediaId = queued.body?.item?.id || '';
    const removed = mediaId ? await request('/api/media/action', { method: 'POST', ...jsonBody({ type: 'remove', id: mediaId }, { cookie }) }) : null;
    result.media = { state: state.status, enqueue: queued.status, remove: removed?.status || 0, mode: state.body?.mode || null, externalConnected: state.body?.externalConnected ?? null, ok: state.status === 200 && state.body?.mode === 'local-stage' && state.body?.externalConnected === false && queued.status === 200 && removed?.status === 200 };
  } catch (error) {
    result.media = { state: 0, enqueue: 0, remove: 0, mode: null, externalConnected: null, ok: false, error: safeError(error) };
  }
  try {
    const analytics = await request('/api/analytics', { headers: { cookie } });
    const analyticsChat = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'show local activity analytics', history: [] }, { cookie }) });
    const statsChat = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'Show me the current live deck stats.', history: [] }, { cookie }) });
    const voiceChat = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'Is my microphone and wake gate ready?', history: [] }, { cookie }) });
    const printerStatusChat = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'What is my 3D printer status?', history: [] }, { cookie }) });
    const hostStatusChat = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'Show CPU, RAM, disk, GPU, temperature, and service health.', history: [] }, { cookie }) });
    const engineeringChat = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'Run the Architect Critic Debugger unit checks.', history: [] }, { cookie }) });
    const engineeringRunId = engineeringChat.body?.action?.run?.id || '';
    const engineeringResult = engineeringRunId ? await waitForEngineeringRun(engineeringRunId, { cookie }) : null;
    const workspace = await request('/api/workspace/status', { headers: { cookie } });
    result.analytics = { status: analytics.status, readOnly: analytics.body?.readOnly === true, events: Number(analytics.body?.events?.events) || 0, services: analytics.body?.services || null, chatStatus: analyticsChat.status, chatRoute: analyticsChat.body?.route || null, chatSource: analyticsChat.body?.source || null, ok: analytics.status === 200 && analytics.body?.readOnly === true && analytics.body?.events && analytics.body?.broadcast?.externalConnected === false && analyticsChat.status === 200 && analyticsChat.body?.route === 'MONITOR' && analyticsChat.body?.source === 'local-analytics' };
    result.statsDeck = { chatStatus: statsChat.status, route: statsChat.body?.route || null, source: statsChat.body?.source || null, workspaceStatus: workspace.status, hasStats: Boolean(workspace.body?.multiPurposeDeck?.stats), hasVoice: Boolean(workspace.body?.multiPurposeDeck?.stats?.voice), externalConnected: workspace.body?.multiPurposeDeck?.stats?.twitch?.connected ?? null, ok: statsChat.status === 200 && statsChat.body?.source === 'local-stats-deck' && Boolean(statsChat.body?.content) && workspace.status === 200 && Boolean(workspace.body?.multiPurposeDeck?.stats) && Boolean(workspace.body?.multiPurposeDeck?.stats?.voice) && workspace.body?.multiPurposeDeck?.stats?.twitch?.connected === false };
    result.voiceDiagnostics = { status: voiceChat.status, source: voiceChat.body?.source || null, hasVoice: Boolean(voiceChat.body?.action?.voice), ok: voiceChat.status === 200 && voiceChat.body?.source === 'local-voice-diagnostics' && Boolean(voiceChat.body?.action?.voice) && Boolean(voiceChat.body?.content) };
    result.localStatus = { status: printerStatusChat.status, route: printerStatusChat.body?.route || null, source: printerStatusChat.body?.source || null, kind: printerStatusChat.body?.action?.kind || null, ok: printerStatusChat.status === 200 && printerStatusChat.body?.source === 'local-status-summary' && printerStatusChat.body?.route === 'FABRICATOR' && printerStatusChat.body?.action?.kind === 'printer' && Boolean(printerStatusChat.body?.content) };
    result.hostStatus = { status: hostStatusChat.status, route: hostStatusChat.body?.route || null, source: hostStatusChat.body?.source || null, kind: hostStatusChat.body?.action?.kind || null, hasTemperature: /temperature/i.test(String(hostStatusChat.body?.content || '')), ok: hostStatusChat.status === 200 && hostStatusChat.body?.source === 'local-status-summary' && hostStatusChat.body?.route === 'MONITOR' && hostStatusChat.body?.action?.kind === 'host' && Boolean(hostStatusChat.body?.content) && /temperature/i.test(String(hostStatusChat.body?.content || '')) };
    result.engineeringChat = { status: engineeringChat.status, source: engineeringChat.body?.source || null, profile: engineeringChat.body?.action?.profile || null, runId: engineeringRunId || null, completionStatus: engineeringResult?.body?.last?.status || null, busy: engineeringResult?.body?.busy ?? null, ok: engineeringChat.status === 202 && engineeringChat.body?.source === 'local-engineering-pipeline' && engineeringChat.body?.action?.type === 'engineering_pipeline' && engineeringResult?.status === 200 && engineeringResult.body?.busy === false && engineeringResult.body?.last?.id === engineeringRunId && engineeringResult.body?.last?.status === 'passed' };
  } catch (error) {
    result.analytics = { status: 0, readOnly: false, events: 0, services: null, ok: false, error: safeError(error) };
    result.statsDeck = { chatStatus: 0, route: null, source: null, workspaceStatus: 0, hasStats: false, externalConnected: null, ok: false, error: safeError(error) };
    result.voiceDiagnostics = { status: 0, source: null, hasVoice: false, ok: false, error: safeError(error) };
    result.localStatus = { status: 0, route: null, source: null, kind: null, ok: false, error: safeError(error) };
    result.hostStatus = { status: 0, route: null, source: null, kind: null, hasTemperature: false, ok: false, error: safeError(error) };
    result.engineeringChat = { status: 0, source: null, profile: null, runId: null, completionStatus: null, busy: null, ok: false, error: safeError(error) };
  }
  try {
    const briefing = await request('/api/chat', { method: 'POST', ...jsonBody({ prompt: 'Give me a morning briefing', history: [] }, { cookie }), timeoutMs: 60_000 });
    const agentLive = await request('/api/agent/live', { headers: { cookie } });
    result.briefing = { status: briefing.status, route: briefing.body?.route || null, source: briefing.body?.source || null, sections: Array.isArray(briefing.body?.action?.sections) ? briefing.body.action.sections.length : 0, citations: Array.isArray(briefing.body?.citations) ? briefing.body.citations.length : 0, agentLiveStatus: agentLive.status, agentActiveAfterLocalRun: Boolean(agentLive.body?.active), ok: briefing.status === 200 && briefing.body?.route === 'MONITOR' && briefing.body?.source === 'local-morning-briefing' && Array.isArray(briefing.body?.action?.sections) && agentLive.status === 200 && agentLive.body?.active === false };
  } catch (error) {
    result.briefing = { status: 0, route: null, source: null, sections: 0, citations: 0, agentLiveStatus: 0, agentActiveAfterLocalRun: true, ok: false, error: safeError(error) };
  }
} catch (error) {
  result.dashboard.error = safeError(error); exitCode = 2;
}

if (cookie) {
  for (const [service, prompt] of publicPrompts) {
    try {
      const response = await requestTransientSafe('/api/public/query', { method: 'POST', ...jsonBody({ prompt }, { cookie }) });
      result.publicApis.push({ service, status: response.status, ok: response.status === 200 && response.body?.ok === true, returnedService: response.body?.service || null });
    } catch (error) { result.publicApis.push({ service, status: 0, ok: false, error: safeError(error) }); }
  }
  try {
    const response = await request('/api/google/status?probe=1', { headers: { cookie } });
    result.google.status = { status: response.status, connected: Boolean(response.body?.connected), liveVerified: Boolean(response.body?.liveVerified), connectors: response.body?.connectors || {}, errors: response.body?.errors || {} };
  } catch (error) { result.google.status = { status: 0, connected: false, error: safeError(error) }; }
  for (const [service, prompt] of googlePrompts) {
    try {
      const response = await request('/api/google/query', { method: 'POST', ...jsonBody({ prompt }, { cookie }) });
      result.google.queries.push({ service, status: response.status, ok: response.status === 200 && Boolean(response.body?.result), error: response.status === 200 ? undefined : String(response.body?.error || 'unavailable').slice(0, 240) });
    } catch (error) { result.google.queries.push({ service, status: 0, ok: false, error: safeError(error) }); }
  }
  if (!skipTts) {
    try {
      const response = await request('/api/tts', { method: 'POST', ...jsonBody({ text: 'JARVIS live test', mode: process.env.TTS_MODE || 'local' }, { cookie }) });
      const bodyBytes = bodyIsArrayBuffer(response.body) ? response.body.byteLength : 0;
      result.tts = { status: response.status, ok: response.status === 200 && bodyBytes > 0, bytes: bodyBytes, contentType: response.headers.get('content-type') || '' };
    } catch (error) { result.tts = { status: 0, ok: false, error: safeError(error) }; }
  }
}

function bodyIsArrayBuffer(value) { return value && typeof value.byteLength === 'number'; }

const openJarvisHealthUrl = `${String(process.env.OPENJARVIS_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')}/health`;
const ollamaTagsUrl = `${String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/tags`;
for (const [name, url] of [['openjarvis', openJarvisHealthUrl], ['ollama', ollamaTagsUrl]]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    result.backends[name] = { online: response.ok, status: response.status };
  } catch { result.backends[name] = { online: false, status: 0 }; }
}

const publicPassed = result.publicApis.filter((item) => item.ok).length;
const googlePassed = result.google.queries.filter((item) => item.ok).length;
result.summary = { mission: result.mission?.ok ?? null, routines: result.routines?.ok ?? null, memory: result.memory?.ok ?? null, broadcast: result.broadcast?.ok ?? null, media: result.media?.ok ?? null, analytics: result.analytics?.ok ?? null, statsDeck: result.statsDeck?.ok ?? null, voiceDiagnostics: result.voiceDiagnostics?.ok ?? null, localStatus: result.localStatus?.ok ?? null, hostStatus: result.hostStatus?.ok ?? null, engineeringChat: result.engineeringChat?.ok ?? null, briefing: result.briefing?.ok ?? null, overlay: result.overlay?.ok ?? null, vision: result.vision?.ok ?? null, stirling: result.stirling?.ok ?? null, public: `${publicPassed}/${publicPrompts.length}`, google: `${googlePassed}/${googlePrompts.length}`, tts: result.tts?.ok ?? null, openjarvis: Boolean(result.backends.openjarvis?.online), ollama: Boolean(result.backends.ollama?.online) };
if (result.mission && !result.mission.ok) exitCode = Math.max(exitCode, 17);
if (result.routines && !result.routines.ok) exitCode = Math.max(exitCode, 7);
if (result.memory && !result.memory.ok) exitCode = Math.max(exitCode, 8);
if (result.broadcast && !result.broadcast.ok) exitCode = Math.max(exitCode, 11);
if (result.media && !result.media.ok) exitCode = Math.max(exitCode, 13);
if (result.analytics && !result.analytics.ok) exitCode = Math.max(exitCode, 12);
if (result.statsDeck && !result.statsDeck.ok) exitCode = Math.max(exitCode, 18);
if (result.voiceDiagnostics && !result.voiceDiagnostics.ok) exitCode = Math.max(exitCode, 19);
if (result.localStatus && !result.localStatus.ok) exitCode = Math.max(exitCode, 21);
if (result.hostStatus && !result.hostStatus.ok) exitCode = Math.max(exitCode, 22);
if (result.engineeringChat && !result.engineeringChat.ok) exitCode = Math.max(exitCode, 20);
if (result.briefing && !result.briefing.ok) exitCode = Math.max(exitCode, 16);
if (result.overlay && !result.overlay.ok) exitCode = Math.max(exitCode, 10);
if (result.vision && !result.vision.ok) exitCode = Math.max(exitCode, 14);
if (requireStirling && result.stirling && !result.stirling.ok) exitCode = Math.max(exitCode, 15);
if (requireStirlingProcessing && result.stirling && !result.stirling.processing?.ok) exitCode = Math.max(exitCode, 15);
if (publicPassed !== publicPrompts.length) exitCode = Math.max(exitCode, 6);
// Google is an optional external connector. Keep the OAuth result visible in
// the report, but only fail the whole live sweep when the caller explicitly
// requires Google to be linked.
if (requireGoogle && googlePassed !== googlePrompts.length) exitCode = Math.max(exitCode, 3);
if (!(result.backends.openjarvis?.online || result.backends.ollama?.online)) exitCode = Math.max(exitCode, 4);
if (requireGoogle && googlePassed !== googlePrompts.length) exitCode = Math.max(exitCode, 3);
if (requireModel && !(result.backends.openjarvis?.online || result.backends.ollama?.online)) exitCode = Math.max(exitCode, 4);
if (requireVision && !(result.vision?.runtime === 'ready' && result.vision?.ok)) exitCode = Math.max(exitCode, 14);
if (!skipTts && result.tts && !result.tts.ok) exitCode = Math.max(exitCode, 5);
console.log(JSON.stringify(result, null, 2));
process.exitCode = exitCode;
