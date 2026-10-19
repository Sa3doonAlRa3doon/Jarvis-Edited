import { createKnowledgeGalaxy } from './galaxy.js';
import { GestureController } from './gesture-controller.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ui = {
  clock: $('#clock'), date: $('#date-label'), systemDot: $('#system-dot'), systemState: $('#system-state'),
  address: $('#node-address'), uptime: $('#uptime-value'), route: $('#active-route'),
  cpuValue: $('#cpu-value'), cpuBar: $('#cpu-bar'), cpuDetail: $('#cpu-detail'), ramValue: $('#ram-value'),
  ramBar: $('#ram-bar'), ramDetail: $('#ram-detail'), gpuValue: $('#gpu-value'), gpuBar: $('#gpu-bar'),
  gpuDetail: $('#gpu-detail'), temperatureValue: $('#temperature-value'), temperatureBar: $('#temperature-bar'),
  chart: $('#telemetry-chart'), storageList: $('#storage-list'), storageCount: $('#storage-count'),
  serviceList: $('#service-list'), serviceCount: $('#service-count'), brain: $('#brain-canvas'), coreStage: $('#core-stage'),
  coreState: $('#core-state'), coreSubtitle: $('#core-subtitle'), modelLabel: $('#model-label'), wakeState: $('#wake-state'),
  memoryState: $('#memory-state'), wakeFlash: $('#wake-flash'), messages: $('#messages'), composer: $('#composer'),
  prompt: $('#prompt'), send: $('#send-button'), voiceButton: $('#voice-button'), agentLink: $('#agent-link-state'),
  laneEyebrow: $('#lane-eyebrow'), laneTitle: $('#lane-title'), laneState: $('#lane-state'), laneFeed: $('#lane-feed'),
  traceId: $('#trace-id'), traceSteps: $('#trace-steps'), traceLatency: $('#trace-latency'),
  citationList: $('#citation-list'), citationCount: $('#citation-count'), dockerList: $('#docker-list'),
  dockerSummary: $('#docker-summary'), eventFeed: $('#event-feed'), eventTotal: $('#event-total'),
  maintenanceState: $('#maintenance-state'), operationDialog: $('#operation-dialog'), operationForm: $('#operation-form'),
  operationTitle: $('#operation-title'), operationDescription: $('#operation-description'), operationPin: $('#operation-pin'),
  operationConfirmation: $('#operation-confirmation'), confirmationPhrase: $('#confirmation-phrase'),
  operationError: $('#operation-error'), confirmOperation: $('#confirm-operation'), operationClose: $('#operation-close'), galaxyState: $('#galaxy-state'),
  nodeInspector: $('#node-inspector'), gestureButton: $('#gesture-button'), gestureFeed: $('#gesture-feed'),
  gestureVideo: $('#gesture-video'), gestureCanvas: $('#gesture-canvas'), gestureCursor: $('#gesture-cursor'), gestureState: $('#gesture-state'),
  printerState: $('#printer-state'), printerFile: $('#printer-file'), printerEta: $('#printer-eta'),
  printerProgress: $('#printer-progress'), printerPercent: $('#printer-percent'), printerTemps: $('#printer-temps')
};

const state = {
  config: null, settings: null, metrics: null, status: null, storage: [], docker: null,
  agents: { lanes: { code: [], research: [], monitor: [] }, traces: [] }, events: [], eventSummary: {},
  history: [], lane: 'code', operation: null, operationKind: 'system', operationStatus: null, lastAssistant: '',
  galaxy: null, gesture: null, printer: { configured: false, online: false, state: 'checking' },
  chart: { cpu: Array(52).fill(0), ram: Array(52).fill(0), gpu: Array(52).fill(0) },
  clap: { stream: null, context: null, analyser: null, raf: 0, firstAt: 0, above: false },
  neuralEnergy: 0.22
};

const laneLabels = {
  code: { eyebrow: 'CODEACT STREAM', title: 'Code Assistant' },
  research: { eyebrow: 'MULTI-HOP INDEX', title: 'Deep Research' },
  monitor: { eyebrow: 'PERSISTENT OPERATIVE', title: 'Continuous Monitor' }
};

const operationCopy = {
  repair: { title: 'Constrained self-repair', confirmation: 'REPAIR SERVICES', description: 'Restarts only failed allow-listed JARVIS services and previously saved Docker containers. It never runs AI-generated shell commands.' },
  'restart-all': { title: 'Restart the JARVIS stack', confirmation: 'RESTART ALL', description: 'Restarts Ollama, OpenJarvis, Hatclanker when installed, plus the exact containers saved by maintenance mode. The dashboard stays online.' },
  'stop-until-reboot': { title: 'Stop until next reboot', confirmation: 'STOP UNTIL REBOOT', description: 'Stops the allow-listed services and all currently running Docker containers. A runtime lock disappears automatically at the next reboot.' },
  'maintenance-on': { title: 'Persistent maintenance stop', confirmation: 'ENTER MAINTENANCE', description: 'Stops the allow-listed services and running containers and leaves a persistent lock, so they remain stopped after reboot until you press Resume.' },
  resume: { title: 'Resume services', confirmation: 'RESUME SERVICES', description: 'Removes both maintenance locks, starts the allow-listed services, and restarts only the Docker containers captured before maintenance.' }
};
const printerCopy = {
  pause: { title: 'Pause the active 3D print', confirmation: 'PAUSE PRINT', description: 'Requests a Moonraker pause for the currently active job. The printer URL is fixed on the Pi and cannot be changed here.' },
  resume: { title: 'Resume the paused 3D print', confirmation: 'RESUME PRINT', description: 'Requests a Moonraker resume for a paused job after the control PIN and exact confirmation.' },
  cancel: { title: 'End the active 3D print', confirmation: 'CANCEL PRINT', description: 'Destructive: permanently cancels the active print. JARVIS never performs this automatically or from model output.' }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
function safeCitationUrl(value) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function percent(value) { return `${Math.round(Number(value) || 0)}%`; }
function bytes(value) {
  const number = Number(value) || 0;
  if (!number) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(number) / Math.log(1024)));
  return `${(number / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}
function duration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function compactDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '--';
  const value = Math.max(0, Math.round(Number(seconds))); const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60);
  return hours ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}
function timeLabel(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString('en-GB', { hour12: false });
}
async function json(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function updateClock() {
  const now = new Date();
  ui.clock.textContent = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour12: false });
  ui.date.textContent = `${now.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()} // DUBAI`;
}

function renderMetric(element, bar, value, available = true) {
  element.textContent = available ? percent(value) : 'N/A';
  bar.style.width = available ? `${Math.max(0, Math.min(100, Number(value) || 0))}%` : '0%';
}

function renderMetrics(metrics) {
  state.metrics = metrics;
  renderMetric(ui.cpuValue, ui.cpuBar, metrics.cpu?.percent);
  renderMetric(ui.ramValue, ui.ramBar, metrics.memory?.percent);
  renderMetric(ui.gpuValue, ui.gpuBar, metrics.gpu?.percent, metrics.gpu?.available);
  const temperature = metrics.temperature == null ? Number.NaN : Number(metrics.temperature);
  ui.temperatureValue.textContent = Number.isFinite(temperature) ? `${Math.round(temperature)}°` : 'N/A';
  ui.temperatureBar.style.width = Number.isFinite(temperature) ? `${Math.min(100, Math.max(0, temperature))}%` : '0%';
  ui.cpuDetail.textContent = `${metrics.cpu?.cores || 0} cores // load ${(metrics.cpu?.load?.[0] || 0).toFixed(2)}`;
  ui.ramDetail.textContent = `${bytes(metrics.memory?.used)} / ${bytes(metrics.memory?.total)}`;
  ui.gpuDetail.textContent = metrics.gpu?.available ? metrics.gpu.name : 'counter unavailable';
  ui.address.textContent = metrics.address || '127.0.0.1';
  ui.uptime.textContent = duration(metrics.uptime);
  state.chart.cpu.push(metrics.cpu?.percent || 0); state.chart.cpu.shift();
  state.chart.ram.push(metrics.memory?.percent || 0); state.chart.ram.shift();
  state.chart.gpu.push(metrics.gpu?.percent || 0); state.chart.gpu.shift();
  drawTelemetry();
}

function drawTelemetry() {
  const canvas = ui.chart; const context = canvas.getContext('2d');
  const scale = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * scale)); const height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(100,232,255,.07)'; context.lineWidth = 1;
  for (let y = 0; y <= 4; y += 1) { context.beginPath(); context.moveTo(0, (height / 4) * y); context.lineTo(width, (height / 4) * y); context.stroke(); }
  const plot = (values, color, alpha) => {
    context.beginPath(); values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * width; const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }); context.strokeStyle = color; context.globalAlpha = alpha; context.lineWidth = 1.3 * scale; context.stroke(); context.globalAlpha = 1;
  };
  plot(state.chart.cpu, '#64e8ff', .95); plot(state.chart.ram, '#71ffca', .58); plot(state.chart.gpu, '#f5bd5c', .5);
}

function renderStorage(devices) {
  state.storage = devices;
  const visible = devices.filter((item) => item.mountpoints?.length || ['disk', 'rom'].includes(item.type)).slice(0, 7);
  ui.storageCount.textContent = String(visible.length);
  ui.storageList.innerHTML = visible.length ? visible.map((item) => {
    const used = item.used || Math.max(0, (item.size || 0) - (item.free || item.size || 0));
    const label = item.model || item.name; const mounts = item.mountpoints?.join(', ') || item.type;
    return `<article class="storage-item"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(mounts)} // ${escapeHtml(item.transport || 'local')}</span></div><b>${bytes(used)} / ${bytes(item.size)}</b></article>`;
  }).join('') : '<p class="empty-state">No mounted storage was reported.</p>';
}

function renderStatus(payload) {
  state.status = payload;
  const services = [
    { name: 'OpenJarvis', ok: payload.services?.openjarvis?.online, detail: payload.services?.openjarvis?.detail || 'offline' },
    { name: 'Ollama runtime', ok: payload.services?.ollama?.online, detail: `${payload.services?.ollama?.models?.length || 0} models` },
    { name: 'Google Workspace', ok: payload.google?.connected, detail: payload.google?.connected ? 'OAuth linked' : 'not linked' },
    { name: 'Local wake listener', ok: payload.wake?.ready, detail: payload.wake?.model ? 'Hey Jarvis + clap' : payload.wake?.running ? 'clap only' : 'standby' }
  ];
  const online = services.filter((item) => item.ok).length;
  ui.serviceCount.textContent = `${online}/${services.length}`;
  ui.serviceList.innerHTML = services.map((item) => `<article class="service-item"><i class="${item.ok ? 'ok' : ''}"></i><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.detail)}</span></div><b>${item.ok ? 'ONLINE' : 'OFFLINE'}</b></article>`).join('');
  const healthy = payload.services?.openjarvis?.online && payload.services?.ollama?.online;
  ui.systemDot.className = healthy ? 'online' : 'warning'; ui.systemState.textContent = healthy ? 'SYSTEM NOMINAL' : 'DEGRADED';
  ui.coreState.textContent = 'JARVIS'; ui.coreSubtitle.textContent = healthy ? 'Speak • pinch • inspect • command' : 'Visual core ready // model services standby';
  ui.modelLabel.textContent = payload.services?.ollama?.models?.[0] || 'NO MODEL';
  ui.wakeState.textContent = payload.wake?.ready ? 'LISTENING' : payload.wake?.configured ? 'STARTING' : 'STANDBY';
  state.neuralEnergy = healthy ? .42 : .18;
  renderOperationStatus(payload.operations);
}

function renderOperationStatus(operations) {
  state.operationStatus = operations;
  const maintenance = operations?.maintenancePersistent ? 'PERSISTENT STOP' : operations?.maintenanceUntilReboot ? 'STOPPED UNTIL REBOOT' : operations?.available ? 'ARMED' : 'PI ONLY';
  ui.maintenanceState.textContent = maintenance;
  $$('[data-operation]').forEach((button) => { button.disabled = !operations?.available; });
}

function renderDocker(payload) {
  state.docker = payload;
  if (!payload.available) { ui.dockerSummary.textContent = 'UNAVAILABLE'; ui.dockerList.innerHTML = '<p class="empty-state">Docker engine is not available on this host.</p>'; return; }
  const running = payload.containers.filter((item) => String(item.state).toLowerCase() === 'running').length;
  ui.dockerSummary.textContent = `${running}/${payload.containers.length} RUNNING`;
  ui.dockerList.innerHTML = payload.containers.length ? payload.containers.slice(0, 8).map((item) => `<article class="docker-item"><i class="${String(item.state).toLowerCase() === 'running' ? 'ok' : ''}"></i><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.cpu || item.state)}</span><b>${escapeHtml(item.memoryPercent || item.status)}</b></article>`).join('') : '<p class="empty-state">Docker is online with no containers.</p>';
}

function renderPrinter(payload) {
  state.printer = payload || state.printer;
  const online = Boolean(payload?.online); const progress = Math.round((Number(payload?.progress) || 0) * 100);
  ui.printerState.textContent = payload?.configured === false ? 'NOT SET' : online ? String(payload.state || 'online').toUpperCase() : 'OFFLINE';
  ui.printerState.style.color = online ? 'var(--mint)' : '';
  ui.printerFile.textContent = payload?.filename || (online ? 'NO ACTIVE FILE' : 'PRINTER OFFLINE');
  ui.printerEta.textContent = `ETA ${compactDuration(payload?.remaining)}`;
  ui.printerProgress.style.width = `${progress}%`; ui.printerPercent.textContent = `${progress}%`;
  const temperatures = payload?.temperatures || {};
  ui.printerTemps.textContent = online ? `N ${Math.round(temperatures.nozzle || 0)}°/${Math.round(temperatures.nozzleTarget || 0)}° · B ${Math.round(temperatures.bed || 0)}°/${Math.round(temperatures.bedTarget || 0)}°` : 'NOZZLE -- / BED --';
  $$('[data-printer]').forEach((button) => {
    const action = button.dataset.printer;
    button.disabled = !online || (action === 'pause' && payload.state !== 'printing') || (action === 'resume' && payload.state !== 'paused') || (action === 'cancel' && !['printing', 'paused'].includes(payload.state));
  });
}

function renderAgents(payload) {
  state.agents = payload;
  ui.agentLink.textContent = payload.online ? 'LIVE' : 'OFFLINE';
  ui.memoryState.textContent = payload.memory?.entries != null ? `${payload.memory.entries} ITEMS` : 'LOCAL';
  renderLane();
}

function renderLane() {
  const meta = laneLabels[state.lane]; const traces = state.agents?.lanes?.[state.lane] || []; const trace = traces[0];
  ui.laneEyebrow.textContent = meta.eyebrow; ui.laneTitle.textContent = meta.title;
  $$('.lane-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.lane === state.lane));
  if (!trace) {
    ui.laneState.textContent = 'WAITING'; ui.laneState.parentElement.classList.remove('active'); ui.traceId.textContent = '—'; ui.traceSteps.textContent = '0'; ui.traceLatency.textContent = '0 ms';
    ui.laneFeed.innerHTML = `<p class="empty-state">Waiting for ${escapeHtml(meta.title)} traces from OpenJarvis. This panel shows tool calls and results, not private model chain-of-thought.</p>`;
    renderCitations([]); return;
  }
  const recent = trace.createdAt && Date.now() - new Date(trace.createdAt).getTime() < 120_000;
  ui.laneState.textContent = recent ? 'ACTIVE' : trace.success ? 'COMPLETE' : 'FAILED'; ui.laneState.parentElement.classList.toggle('active', recent || trace.success);
  ui.traceId.textContent = trace.id.slice(0, 10); ui.traceSteps.textContent = String(trace.steps.length); ui.traceLatency.textContent = `${Math.round(trace.durationMs)} ms`;
  const steps = trace.steps.length ? trace.steps : [{ type: 'result', tool: trace.agent, content: trace.output || trace.input, durationMs: trace.durationMs, success: trace.success }];
  ui.laneFeed.innerHTML = steps.slice(-18).map((step, index) => `<article class="trace-step"><i>${String(index + 1).padStart(2, '0')}</i><div><strong>${escapeHtml(step.tool || step.type)}</strong>${step.content ? `<p>${escapeHtml(step.content)}</p>` : ''}</div><span>${step.durationMs ? `${Math.round(step.durationMs)}ms` : step.success ? 'OK' : 'ERR'}</span></article>`).join('');
  const researchTrace = (state.agents?.lanes?.research || [])[0]; renderCitations(state.lane === 'research' ? trace.citations : researchTrace?.citations || []);
}

function renderCitations(citations) {
  const safeCitations = citations.map(safeCitationUrl).filter(Boolean);
  ui.citationCount.textContent = String(safeCitations.length);
  ui.citationList.innerHTML = safeCitations.length ? safeCitations.map((url, index) => `<a class="citation-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">[${index + 1}] ${escapeHtml(url)}</a>`).join('') : '<p class="empty-state">Research links appear here.</p>';
}

function renderEvents() {
  const compacted = Number(state.eventSummary?.compacted || 0); ui.eventTotal.textContent = `MEMORY ${state.events.length + compacted}`;
  ui.eventFeed.innerHTML = state.events.length ? state.events.slice(0, 20).map((event) => `<article class="event-item"><time>${timeLabel(event.at)}</time><b>${escapeHtml(event.type)}</b><span>${escapeHtml(event.message)}</span></article>`).join('') : '<p class="empty-state">Persistent local activity log ready.</p>';
}

function addEvent(event) {
  if (state.events.some((item) => item.id === event.id)) return;
  state.events.unshift(event); state.events = state.events.slice(0, 120); renderEvents();
  if (event.type === 'wake') handleWake(event);
}

function appendMessage(role, content, source = '') {
  const article = document.createElement('article'); article.className = `message ${role}`;
  article.innerHTML = `<span>${role === 'user' ? 'U' : role === 'error' ? '!' : 'J'}</span><div><b>${role === 'user' ? 'YOU' : role === 'error' ? 'SYSTEM' : `JARVIS${source ? ` // ${escapeHtml(source)}` : ''}`}</b><p>${escapeHtml(content)}</p></div>`;
  ui.messages.append(article); ui.messages.scrollTop = ui.messages.scrollHeight;
}

async function speak(text) {
  if (!state.settings?.autoSpeak || !text) return;
  if (state.config?.ttsMode === 'fish') {
    try {
      const response = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, mode: 'fish' }) });
      if (response.ok) { const audio = new Audio(URL.createObjectURL(await response.blob())); await audio.play(); return; }
    } catch {}
  }
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.rate = 1.02; utterance.pitch = .92; speechSynthesis.speak(utterance);
  }
}

function handleWake(event) {
  ui.wakeFlash.classList.remove('active'); void ui.wakeFlash.offsetWidth; ui.wakeFlash.classList.add('active');
  ui.wakeState.textContent = event?.detail?.kind === 'double_clap' ? 'CLAP' : 'HEARD'; state.neuralEnergy = 1;
  ui.prompt.focus(); void speak('Yes?');
  setTimeout(() => { ui.wakeState.textContent = state.status?.wake?.ready ? 'LISTENING' : 'STANDBY'; }, 2200);
}

async function sendPrompt(prompt) {
  const text = String(prompt || '').trim(); if (!text || ui.send.disabled) return;
  state.galaxy?.focusFromText(text);
  const directPrinterAction = /\b(?:cancel|end|stop)\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'cancel'
    : /\bpause\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'pause'
      : /\bresume\s+(?:my\s+|the\s+)?(?:3d\s+)?print\b/i.test(text) ? 'resume' : '';
  if (directPrinterAction) {
    appendMessage('user', text); appendMessage('assistant', `I opened the guarded ${directPrinterAction} control. Enter the operations PIN and type ${printerCopy[directPrinterAction].confirmation} exactly. I will not execute it automatically.`, 'LOCAL SAFETY');
    openPrinterAction(directPrinterAction); return;
  }
  appendMessage('user', text); state.history.push({ role: 'user', content: text }); state.history = state.history.slice(-16);
  ui.prompt.value = ''; ui.send.disabled = true; ui.send.textContent = 'RUNNING'; state.neuralEnergy = .95;
  try {
    const result = await json('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text, history: state.history.slice(0, -1) }) });
    ui.route.textContent = result.route; state.lastAssistant = result.content; appendMessage('assistant', result.content, result.source); state.history.push({ role: 'assistant', content: result.content }); state.history = state.history.slice(-16); void speak(result.content);
  } catch (error) { appendMessage('error', error.message); }
  finally { ui.send.disabled = false; ui.send.textContent = 'EXECUTE'; state.neuralEnergy = .42; }
}

async function toggleBrowserClap() {
  if (state.clap.stream) { stopBrowserClap(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: state.settings?.browserMicrophone ? { deviceId: { exact: state.settings.browserMicrophone }, echoCancellation: true, noiseSuppression: true } : true, video: false });
    const context = new AudioContext(); const analyser = context.createAnalyser(); analyser.fftSize = 1024; context.createMediaStreamSource(stream).connect(analyser);
    Object.assign(state.clap, { stream, context, analyser, firstAt: 0, above: false }); ui.voiceButton.classList.add('listening'); ui.voiceButton.title = 'Browser double-clap listener active'; monitorBrowserClap();
  } catch (error) { appendMessage('error', `Microphone unavailable: ${error.message}`); }
}
function monitorBrowserClap() {
  if (!state.clap.analyser) return;
  const samples = new Uint8Array(state.clap.analyser.fftSize); state.clap.analyser.getByteTimeDomainData(samples);
  let sum = 0; for (const sample of samples) { const value = (sample - 128) / 128; sum += value * value; }
  const level = Math.sqrt(sum / samples.length); const threshold = state.settings?.clapSensitivity || .34; const now = performance.now();
  if (level > threshold && !state.clap.above) {
    state.clap.above = true;
    const windowMs = state.settings?.doubleClapWindow || 700;
    if (state.clap.firstAt && now - state.clap.firstAt <= windowMs) { state.clap.firstAt = 0; handleWake({ detail: { kind: 'double_clap' } }); }
    else state.clap.firstAt = now;
  }
  if (level < threshold * .55) state.clap.above = false;
  if (state.clap.firstAt && now - state.clap.firstAt > (state.settings?.doubleClapWindow || 700)) state.clap.firstAt = 0;
  state.clap.raf = requestAnimationFrame(monitorBrowserClap);
}
function stopBrowserClap() {
  cancelAnimationFrame(state.clap.raf); state.clap.stream?.getTracks().forEach((track) => track.stop()); state.clap.context?.close();
  Object.assign(state.clap, { stream: null, context: null, analyser: null, raf: 0, firstAt: 0, above: false }); ui.voiceButton.classList.remove('listening'); ui.voiceButton.title = 'Enable browser double-clap listener';
}

function openOperation(action) {
  const copy = operationCopy[action]; if (!copy) return;
  state.operation = action; state.operationKind = 'system'; ui.operationTitle.textContent = copy.title; ui.operationDescription.textContent = copy.description; ui.confirmationPhrase.textContent = copy.confirmation;
  ui.operationPin.value = ''; ui.operationConfirmation.value = ''; ui.operationError.textContent = ''; ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = 'RUN ON RASPBERRY PI'; ui.operationDialog.showModal(); ui.operationPin.focus();
}
function openPrinterAction(action) {
  const copy = printerCopy[action]; if (!copy) return;
  state.operation = action; state.operationKind = 'printer'; ui.operationTitle.textContent = copy.title; ui.operationDescription.textContent = copy.description; ui.confirmationPhrase.textContent = copy.confirmation;
  ui.operationPin.value = ''; ui.operationConfirmation.value = ''; ui.operationError.textContent = ''; ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = action === 'cancel' ? 'CONFIRM END PRINT' : 'SEND TO PRINTER'; ui.operationDialog.showModal(); ui.operationPin.focus();
}
async function runOperation() {
  const copy = state.operationKind === 'printer' ? printerCopy[state.operation] : operationCopy[state.operation]; if (!copy) return;
  ui.operationError.textContent = ''; ui.confirmOperation.disabled = true; ui.confirmOperation.textContent = 'EXECUTING';
  try {
    const endpoint = state.operationKind === 'printer' ? '/api/printer/action' : '/api/operations/action';
    const result = await json(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: state.operation, pin: ui.operationPin.value, confirmation: ui.operationConfirmation.value }) });
    if (state.operationKind === 'printer') renderPrinter(result.result); else renderOperationStatus(result.result);
    ui.operationDialog.close(); addEvent({ id: `local-${Date.now()}`, at: new Date().toISOString(), type: state.operationKind === 'printer' ? 'printer' : 'control', message: `${state.operation} completed`, detail: {} });
  } catch (error) { ui.operationError.textContent = error.message; }
  finally { ui.confirmOperation.disabled = false; ui.confirmOperation.textContent = state.operationKind === 'printer' ? (state.operation === 'cancel' ? 'CONFIRM END PRINT' : 'SEND TO PRINTER') : 'RUN ON RASPBERRY PI'; }
}

function startEventStream() {
  const source = new EventSource('/api/events');
  source.addEventListener('snapshot', (event) => { const payload = JSON.parse(event.data); state.events = payload.events || []; state.eventSummary = payload.summary || {}; renderEvents(); });
  source.addEventListener('activity', (event) => addEvent(JSON.parse(event.data)));
}
function startPrinterStream() {
  const source = new EventSource('/api/printer/events');
  source.addEventListener('printer', (event) => renderPrinter(JSON.parse(event.data)));
  source.addEventListener('error', () => { if (source.readyState === EventSource.CLOSED) setTimeout(() => void json('/api/printer/status').then(renderPrinter).catch(() => {}), 2500); });
}

async function refreshFast() {
  const [metrics, status] = await Promise.allSettled([json('/api/metrics'), json('/api/status')]);
  if (metrics.status === 'fulfilled') renderMetrics(metrics.value);
  if (status.status === 'fulfilled') renderStatus(status.value);
}
async function refreshSlow() {
  const [storage, docker, agents] = await Promise.allSettled([json('/api/storage'), json('/api/docker'), json('/api/agents')]);
  if (storage.status === 'fulfilled') renderStorage(storage.value.devices || []);
  if (docker.status === 'fulfilled') renderDocker(docker.value);
  if (agents.status === 'fulfilled') renderAgents(agents.value);
}

async function toggleGestures() {
  if (!state.gesture) return;
  if (state.gesture.active) { await state.gesture.stop(); ui.gestureButton.classList.remove('active'); ui.gestureButton.textContent = 'ENABLE GESTURES'; ui.gestureFeed.hidden = true; return; }
  if (state.settings?.gestureControl === false) { appendMessage('error', 'Gesture control is disabled in /settings.'); return; }
  ui.gestureFeed.hidden = false; ui.gestureButton.disabled = true;
  try {
    await state.gesture.start({ deviceId: state.settings?.browserCamera || '', sensitivity: state.settings?.gestureSensitivity || .42 });
    ui.gestureButton.classList.add('active'); ui.gestureButton.textContent = 'STOP GESTURES';
  } catch (error) { ui.gestureFeed.hidden = true; appendMessage('error', `Gesture camera unavailable: ${error.message}`); }
  finally { ui.gestureButton.disabled = false; }
}

ui.composer.addEventListener('submit', (event) => { event.preventDefault(); void sendPrompt(ui.prompt.value); });
ui.prompt.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ui.composer.requestSubmit(); } });
ui.voiceButton.addEventListener('click', () => void toggleBrowserClap());
$$('[data-prompt]').forEach((button) => button.addEventListener('click', () => void sendPrompt(button.dataset.prompt)));
$$('.lane-tabs button').forEach((button) => button.addEventListener('click', () => { state.lane = button.dataset.lane; renderLane(); }));
$$('[data-operation]').forEach((button) => button.addEventListener('click', () => openOperation(button.dataset.operation)));
$$('[data-printer]').forEach((button) => button.addEventListener('click', () => openPrinterAction(button.dataset.printer)));
ui.gestureButton.addEventListener('click', () => void toggleGestures());
ui.operationForm.addEventListener('submit', (event) => { event.preventDefault(); void runOperation(); });
ui.operationClose.addEventListener('click', () => ui.operationDialog.close());
window.addEventListener('resize', () => { state.galaxy?.resize(); drawTelemetry(); });
window.addEventListener('message', (event) => { if (event.origin === location.origin && event.data?.type === 'jarvis-settings-preview') { state.settings = { ...state.settings, ...event.data.settings }; document.documentElement.style.setProperty('--accent', state.settings.accent); } });
window.addEventListener('beforeunload', () => { stopBrowserClap(); void state.gesture?.stop(); });

async function init() {
  updateClock(); setInterval(updateClock, 1000);
  await window.ensureDashboardAuthentication?.();
  startEventStream(); startPrinterStream();
  const [config, settings] = await Promise.allSettled([json('/api/config'), json('/api/settings')]);
  if (config.status === 'fulfilled') state.config = config.value;
  if (settings.status === 'fulfilled') { state.settings = settings.value; document.documentElement.style.setProperty('--accent', state.settings.accent); }
  state.galaxy = await createKnowledgeGalaxy({ canvas: ui.brain, inspector: ui.nodeInspector, onStatus: (message) => { ui.galaxyState.textContent = message; } });
  state.gesture = new GestureController({
    video: ui.gestureVideo, canvas: ui.gestureCanvas, cursor: ui.gestureCursor,
    onGesture: (gesture) => state.galaxy?.gesture(gesture), onStatus: (message) => { ui.gestureState.textContent = message; }
  });
  await Promise.all([refreshFast(), refreshSlow()]);
  setInterval(() => void refreshFast(), 2500); setInterval(() => void refreshSlow(), 7000);
}

void init();
