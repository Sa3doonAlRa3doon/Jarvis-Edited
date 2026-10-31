import crypto from 'node:crypto';
import WebSocket from 'ws';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_TIMEOUT_MS = 2_500;

function clean(value, limit = 220) {
  return String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function normalizeObsUrl(value = '') {
  const raw = clean(value, 200);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['ws:', 'wss:'].includes(url.protocol) || !LOCAL_HOSTS.has(url.hostname.toLowerCase())) return '';
    url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return ''; }
}

export function obsAuthentication(password, salt, challenge) {
  const secret = crypto.createHash('sha256').update(`${password}${salt}`).digest('base64');
  return crypto.createHash('sha256').update(`${secret}${challenge}`).digest('base64');
}

function normalizeSceneRows(scenes) {
  return Array.isArray(scenes) ? scenes.map((item, position) => ({
    name: clean(item?.sceneName, 160),
    uuid: clean(item?.sceneUuid, 120),
    index: Number.isFinite(Number(item?.index)) ? Number(item.index) : position
  })).filter((item) => item.name) : [];
}

function normalizeSceneItems(sceneItemsByScene) {
  if (!sceneItemsByScene || typeof sceneItemsByScene !== 'object' || Array.isArray(sceneItemsByScene)) return {};
  return Object.fromEntries(Object.entries(sceneItemsByScene).map(([sceneName, items]) => [clean(sceneName, 160), (Array.isArray(items) ? items : []).map((item) => ({
    id: Number.isSafeInteger(Number(item?.sceneItemId)) ? Number(item.sceneItemId) : null,
    name: clean(item?.sourceName, 160),
    uuid: clean(item?.sourceUuid, 120),
    kind: clean(item?.inputKind || item?.sourceType, 100),
    enabled: item?.sceneItemEnabled !== false,
    locked: Boolean(item?.sceneItemLocked),
    index: Number.isSafeInteger(Number(item?.sceneItemIndex)) ? Number(item.sceneItemIndex) : null
  })).filter((item) => item.name)]));
}

function normalizeMixerRows(mixer) {
  return Array.isArray(mixer) ? mixer.map((item) => ({
    name: clean(item?.inputName || item?.sourceName, 160),
    uuid: clean(item?.inputUuid || item?.sourceUuid, 120),
    kind: clean(item?.inputKind, 100),
    muted: Boolean(item?.inputMuted),
    volumeDb: Number.isFinite(Number(item?.inputVolumeDb)) ? Number(item.inputVolumeDb) : null,
    volumeMul: Number.isFinite(Number(item?.inputVolumeMul)) ? Number(item.inputVolumeMul) : null
  })).filter((item) => item.name) : [];
}

export function normalizeObsSnapshot({ url = '', version = {}, stream = {}, record = {}, scene = {}, preview = {}, studio = {}, replay = {}, virtualCam = {}, scenes = [], inputs = [], sceneItemsByScene = {}, mixer = [], error = '' } = {}) {
  const sceneRows = normalizeSceneRows(scenes);
  const sceneNames = sceneRows.map((item) => item.name);
  const outputTotalFrames = Math.max(0, Number(stream.outputTotalFrames) || 0);
  const outputSkippedFrames = Math.max(0, Number(stream.outputSkippedFrames) || 0);
  const outputCongestion = Math.max(0, Math.min(1, Number(stream.outputCongestion) || 0));
  const outputFrameTotal = outputTotalFrames + outputSkippedFrames;
  const droppedPercent = outputFrameTotal ? outputSkippedFrames / outputFrameTotal : 0;
  const streamingHealth = !stream.outputActive
    ? 'idle'
    : outputCongestion >= .05 || droppedPercent >= .02
      ? 'degraded'
      : outputCongestion >= .01 || droppedPercent >= .005
        ? 'warning'
        : 'good';
  const inputNames = Array.isArray(inputs) ? inputs.map((item) => ({
    name: clean(item?.inputName, 160), uuid: clean(item?.inputUuid, 120), kind: clean(item?.inputKind, 100)
  })).filter((item) => item.name) : [];
  return {
    configured: Boolean(url), online: !error && Boolean(url), checkedAt: new Date().toISOString(),
    error: error ? clean(error, 240) : null,
    version: { obs: clean(version.obsVersion, 80), websocket: clean(version.obsWebSocketVersion, 80) },
    streaming: {
      active: Boolean(stream.outputActive), reconnecting: Boolean(stream.outputReconnecting),
      timecode: clean(stream.outputTimecode, 80), bytes: Number(stream.outputBytes) || 0,
      congestion: outputCongestion, skippedFrames: outputSkippedFrames,
      totalFrames: outputTotalFrames,
      health: { status: streamingHealth, congestion: outputCongestion, skippedFrames: outputSkippedFrames, totalFrames: outputTotalFrames, droppedPercent }
    },
    recording: {
      active: Boolean(record.outputActive), paused: Boolean(record.outputPaused),
      timecode: clean(record.outputTimecode, 80), bytes: Number(record.outputBytes) || 0,
      skippedFrames: Number(record.outputSkippedFrames) || 0, totalFrames: Number(record.outputTotalFrames) || 0
    },
    replayBuffer: { active: Boolean(replay.outputActive) },
    virtualCamera: { active: Boolean(virtualCam.outputActive) },
    studioMode: { enabled: Boolean(studio.studioModeEnabled), preview: clean(preview.currentPreviewSceneName, 160) },
    scenes: { current: clean(scene.currentProgramSceneName, 160), preview: clean(preview.currentPreviewSceneName, 160), list: sceneNames, details: sceneRows, sources: normalizeSceneItems(sceneItemsByScene) },
    inputs: inputNames,
    audioMixer: normalizeMixerRows(mixer)
  };
}

function waitForMessage(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => { cleanup(); reject(new Error('OBS WebSocket response timed out.')); }, timeoutMs);
    const onMessage = (raw) => {
      cleanup();
      try { resolve(JSON.parse(String(raw))); } catch { reject(new Error('OBS WebSocket returned invalid JSON.')); }
    };
    const onError = (error) => { cleanup(); reject(error instanceof Error ? error : new Error('OBS WebSocket error.')); };
    const onClose = () => { cleanup(); reject(new Error('OBS WebSocket closed before the response.')); };
    const cleanup = () => { clearTimeout(timer); timer = 0; socket.removeListener('message', onMessage); socket.removeListener('error', onError); socket.removeListener('close', onClose); };
    socket.once('message', onMessage); socket.once('error', onError); socket.once('close', onClose);
  });
}

function waitForOpen(socket, timeoutMs) {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => { cleanup(); reject(new Error('OBS WebSocket connection timed out.')); }, timeoutMs);
    const onOpen = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error instanceof Error ? error : new Error('OBS WebSocket connection failed.')); };
    const onClose = () => { cleanup(); reject(new Error('OBS WebSocket closed before connecting.')); };
    const cleanup = () => { clearTimeout(timer); timer = 0; socket.removeListener('open', onOpen); socket.removeListener('error', onError); socket.removeListener('close', onClose); };
    socket.once('open', onOpen); socket.once('error', onError); socket.once('close', onClose);
  });
}

async function closeSocket(socket) {
  if (!socket) return;
  try { if (socket.readyState < WebSocket.CLOSING) socket.close(); } catch {}
}

export class ObsClient {
  constructor({ url = '', password = '', timeoutMs = DEFAULT_TIMEOUT_MS, WebSocketClass = WebSocket } = {}) {
    this.url = normalizeObsUrl(url);
    this.password = String(password || '');
    this.timeoutMs = Math.max(500, Math.min(10_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    this.WebSocketClass = WebSocketClass;
    this.cache = null; this.cacheAt = 0; this.pending = null;
  }

  get configured() { return Boolean(this.url); }

  async request(requestType, requestData = {}) {
    if (!this.configured) throw new Error('OBS WebSocket is not configured.');
    const socket = new this.WebSocketClass(this.url);
    try {
      await waitForOpen(socket, this.timeoutMs);
      const hello = await waitForMessage(socket, this.timeoutMs);
      if (hello.op !== 0) throw new Error('OBS did not send its Hello handshake.');
      const identify = { op: 1, d: { rpcVersion: 1, eventSubscriptions: 0 } };
      if (hello.d?.authentication) {
        if (!this.password) throw new Error('OBS requires a WebSocket password.');
        identify.d.authentication = obsAuthentication(this.password, hello.d.authentication.salt, hello.d.authentication.challenge);
      }
      socket.send(JSON.stringify(identify));
      const identified = await waitForMessage(socket, this.timeoutMs);
      if (identified.op !== 2) throw new Error(identified.d?.message || 'OBS authentication failed.');
      const requestId = crypto.randomUUID();
      socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      const reply = await waitForMessage(socket, this.timeoutMs);
      if (reply.op !== 7 || reply.d?.requestId !== requestId) throw new Error('OBS returned an unexpected response.');
      if (!reply.d?.requestStatus?.result) throw new Error(reply.d?.requestStatus?.comment || `OBS rejected ${requestType}.`);
      return reply.d.responseData || {};
    } finally { await closeSocket(socket); }
  }

  async withSession(callback) {
    if (!this.configured) throw new Error('OBS WebSocket is not configured.');
    const socket = new this.WebSocketClass(this.url);
    try {
      await waitForOpen(socket, this.timeoutMs);
      const hello = await waitForMessage(socket, this.timeoutMs);
      if (hello.op !== 0) throw new Error('OBS did not send its Hello handshake.');
      const identify = { op: 1, d: { rpcVersion: 1, eventSubscriptions: 0 } };
      if (hello.d?.authentication) {
        if (!this.password) throw new Error('OBS requires a WebSocket password.');
        identify.d.authentication = obsAuthentication(this.password, hello.d.authentication.salt, hello.d.authentication.challenge);
      }
      socket.send(JSON.stringify(identify));
      const identified = await waitForMessage(socket, this.timeoutMs);
      if (identified.op !== 2) throw new Error(identified.d?.message || 'OBS authentication failed.');
      let sequence = 0;
      const request = async (requestType, requestData = {}) => {
        const requestId = `${Date.now()}-${sequence += 1}`;
        socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
        const reply = await waitForMessage(socket, this.timeoutMs);
        if (reply.op !== 7 || reply.d?.requestId !== requestId) throw new Error('OBS returned an unexpected response.');
        if (!reply.d?.requestStatus?.result) throw new Error(reply.d?.requestStatus?.comment || `OBS rejected ${requestType}.`);
        return reply.d.responseData || {};
      };
      return await callback(request);
    } finally { await closeSocket(socket); }
  }

  async readStatus({ force = false } = {}) {
    if (!this.configured) return normalizeObsSnapshot({ url: '', error: 'OBS WebSocket is not configured.' });
    if (!force && this.cache && Date.now() - this.cacheAt < 5_000) return this.cache;
    if (this.pending) return this.pending;
    this.pending = this.withSession(async (request) => {
      // Keep one in-flight request per v5 session. OBS replies are correlated by
      // requestId, but a naive Promise.all with one-message listeners lets two
      // listeners consume the same frame. Serial requests are still quick on a
      // loopback socket and make the snapshot deterministic across OBS builds.
      const optional = async (requestType, requestData = {}) => {
        try { return await request(requestType, requestData); } catch { return {}; }
      };
      const version = await request('GetVersion');
      const stream = await request('GetStreamStatus');
      const record = await request('GetRecordStatus');
      const scene = await request('GetCurrentProgramScene');
      const preview = await optional('GetCurrentPreviewScene');
      const studio = await optional('GetStudioModeEnabled');
      const replay = await optional('GetReplayBufferStatus');
      const virtualCam = await optional('GetVirtualCamStatus');
      const scenes = await request('GetSceneList');
      const inputs = await request('GetInputList');
      const sceneRows = Array.isArray(scenes?.scenes) ? scenes.scenes : [];
      const inputRows = Array.isArray(inputs?.inputs) ? inputs.inputs : [];
      const sceneItems = [];
      for (const sceneRow of sceneRows) {
        const sceneName = clean(sceneRow?.sceneName, 160);
        if (!sceneName) continue;
        try { sceneItems.push([sceneName, (await request('GetSceneItemList', { sceneName })).sceneItems || []]); }
        catch { sceneItems.push([sceneName, []]); }
      }
      const mixer = [];
      for (const input of inputRows) {
        const inputName = clean(input?.inputName, 160);
        if (!inputName) continue;
        // Avoid a timeout per camera/display source. These are the OBS input
        // kinds that normally expose mixer state; browser sources are included
        // because they may carry media audio.
        if (!/(audio|wasapi|pulse|coreaudio|alsa|jack|browser)/i.test(String(input?.inputKind || ''))) continue;
        let volume = {}, mute = {};
        try { volume = await request('GetInputVolume', { inputName }); } catch {}
        try { mute = await request('GetInputMute', { inputName }); } catch {}
        mixer.push({
          ...input,
          ...volume,
          ...mute
        });
      }
      return normalizeObsSnapshot({ url: this.url, version, stream, record, scene, preview, studio, replay, virtualCam, scenes: sceneRows, inputs: inputRows, sceneItemsByScene: Object.fromEntries(sceneItems), mixer });
    }).catch((error) => normalizeObsSnapshot({ url: this.url, error: error.message }));
    try { this.cache = await this.pending; this.cacheAt = Date.now(); return this.cache; }
    finally { this.pending = null; }
  }

  async action(action, params = {}) {
    const inputName = clean(params.inputName, 160);
    const sceneName = clean(params.sceneName, 160);
    const sourceName = clean(params.sourceName || inputName, 160);
    const filterName = clean(params.filterName, 160);
    const transitionName = clean(params.transitionName, 160);
    const hasEnabled = typeof params.enabled === 'boolean';
    let sceneItemId = Number(params.sceneItemId);
    if (String(action || '') === 'toggle-source' && (!Number.isSafeInteger(sceneItemId) || sceneItemId < 0) && sceneName && sourceName) {
      const snapshot = await this.readStatus({ force: true });
      const item = snapshot.scenes?.sources?.[sceneName]?.find((candidate) => candidate.name.toLowerCase() === sourceName.toLowerCase());
      sceneItemId = Number(item?.id);
    }
    const volumeDb = params.volumeDb === '' || params.volumeDb == null ? NaN : Number(params.volumeDb);
    const volume = Number.isFinite(volumeDb) ? Math.max(-100, Math.min(26, volumeDb)) : null;
    const allowed = {
      'start-stream': ['StartStream', {}], 'stop-stream': ['StopStream', {}],
      'start-record': ['StartRecord', {}], 'stop-record': ['StopRecord', {}],
      'pause-record': ['PauseRecord', {}], 'resume-record': ['ResumeRecord', {}],
      'start-replay': ['StartReplayBuffer', {}], 'stop-replay': ['StopReplayBuffer', {}], 'save-replay': ['SaveReplayBuffer', {}],
      'start-virtualcam': ['StartVirtualCam', {}], 'stop-virtualcam': ['StopVirtualCam', {}],
      'studio-take': ['TriggerStudioModeTransition', {}],
      'enable-studio': ['SetStudioModeEnabled', { studioModeEnabled: true }],
      'disable-studio': ['SetStudioModeEnabled', { studioModeEnabled: false }],
      'refresh-browser-source': ['PressInputPropertiesButton', { inputName, propertyName: 'refreshnocache' }],
      'restart-media-source': ['TriggerMediaInputAction', { inputName, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' }],
      'set-transition': ['SetCurrentSceneTransition', { transitionName }],
      'toggle-filter': ['SetSourceFilterEnabled', { sourceName, filterName, filterEnabled: Boolean(params.enabled) }],
      'switch-scene': ['SetCurrentProgramScene', { sceneName }],
      'mute-source': ['SetInputMute', { inputName, inputMuted: true }],
      'unmute-source': ['SetInputMute', { inputName, inputMuted: false }],
      'set-volume': ['SetInputVolume', { inputName, inputVolumeDb: volume }],
      'toggle-source': ['SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: Boolean(params.enabled) }]
    };
    const request = allowed[String(action || '')];
    const actionName = String(action || '');
    const needsInput = new Set(['mute-source', 'unmute-source', 'set-volume', 'refresh-browser-source', 'restart-media-source']);
    const needsScene = actionName === 'switch-scene';
    const needsTransition = actionName === 'set-transition';
    const needsFilter = actionName === 'toggle-filter';
    const needsToggle = actionName === 'toggle-source';
    if (!request || needsInput.has(actionName) && !inputName || needsScene && !sceneName || needsTransition && !transitionName || needsFilter && (!sourceName || !filterName || !hasEnabled) || needsToggle && (!sceneName || !Number.isSafeInteger(sceneItemId)) || actionName === 'set-volume' && volume === null) throw new Error('Unsupported or incomplete OBS action.');
    const result = await this.request(request[0], request[1]);
    this.cacheAt = 0;
    return { action, requestType: request[0], result };
  }
}
