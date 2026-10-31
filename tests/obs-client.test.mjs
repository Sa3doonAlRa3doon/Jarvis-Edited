import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { ObsClient, normalizeObsSnapshot, normalizeObsUrl, obsAuthentication } from '../lib/obs-client.mjs';

test('accepts only loopback OBS WebSocket endpoints', () => {
  assert.equal(normalizeObsUrl('ws://127.0.0.1:4455'), 'ws://127.0.0.1:4455/');
  assert.equal(normalizeObsUrl('ws://localhost:4455/obs'), 'ws://localhost:4455/obs');
  assert.equal(normalizeObsUrl('wss://[::1]:4455/?token=secret'), 'wss://[::1]:4455/');
  assert.equal(normalizeObsUrl('http://127.0.0.1:4455'), '');
  assert.equal(normalizeObsUrl('ws://192.168.4.74:4455'), '');
});

test('matches the OBS v5 salted challenge response shape', () => {
  const first = obsAuthentication('password', 'salt', 'challenge');
  const same = obsAuthentication('password', 'salt', 'challenge');
  assert.equal(first, same);
  assert.notEqual(first, obsAuthentication('wrong', 'salt', 'challenge'));
  assert.match(first, /^[A-Za-z0-9+/]+=*$/);
});

test('normalizes OBS state without exposing connection secrets', () => {
  const snapshot = normalizeObsSnapshot({
    url: 'ws://127.0.0.1:4455/',
    version: { obsVersion: '30.1.2', obsWebSocketVersion: '5.0.0' },
    stream: { outputActive: true, outputBytes: 42, outputCongestion: .012, outputSkippedFrames: 10, outputTotalFrames: 1000 },
    record: { outputActive: false },
    scene: { currentProgramSceneName: 'Starting Soon' },
    preview: { currentPreviewSceneName: 'Live' },
    studio: { studioModeEnabled: true },
    replay: { outputActive: true },
    virtualCam: { outputActive: false },
    scenes: [{ sceneName: 'Starting Soon', sceneUuid: 'scene-start', index: 0 }, { sceneName: 'Live', sceneUuid: 'scene-live', index: 1 }],
    inputs: [{ inputName: 'Mic/Aux', inputUuid: 'input-mic', inputKind: 'wasapi_input_capture' }],
    sceneItemsByScene: { Live: [{ sceneItemId: 7, sourceName: 'Camera', sourceUuid: 'camera-uuid', inputKind: 'dshow_input', sceneItemEnabled: false }] },
    mixer: [{ inputName: 'Mic/Aux', inputUuid: 'input-mic', inputKind: 'wasapi_input_capture', inputMuted: true, inputVolumeDb: -6.5, inputVolumeMul: 0.47 }]
  });
  assert.equal(snapshot.online, true);
  assert.equal(snapshot.scenes.current, 'Starting Soon');
  assert.deepEqual(snapshot.scenes.list, ['Starting Soon', 'Live']);
  assert.equal(snapshot.streaming.active, true);
  assert.equal(snapshot.streaming.health.status, 'warning');
  assert.equal(snapshot.streaming.health.skippedFrames, 10);
  assert.equal(snapshot.streaming.health.totalFrames, 1000);
  assert.equal(Math.round(snapshot.streaming.health.droppedPercent * 1000), 10);
  assert.equal(snapshot.replayBuffer.active, true);
  assert.equal(snapshot.virtualCamera.active, false);
  assert.equal(snapshot.studioMode.enabled, true);
  assert.equal(snapshot.studioMode.preview, 'Live');
  assert.equal(snapshot.scenes.preview, 'Live');
  assert.equal(snapshot.inputs[0].name, 'Mic/Aux');
  assert.equal(snapshot.inputs[0].uuid, 'input-mic');
  assert.equal(snapshot.scenes.details[1].uuid, 'scene-live');
  assert.equal(snapshot.scenes.sources.Live[0].id, 7);
  assert.equal(snapshot.scenes.sources.Live[0].enabled, false);
  assert.equal(snapshot.audioMixer[0].muted, true);
  assert.equal(snapshot.audioMixer[0].volumeDb, -6.5);
  assert.equal(JSON.stringify(snapshot).includes('password'), false);
});

test('rejects incomplete guarded mixer actions before opening a socket', async () => {
  const client = new ObsClient({ url: '' });
  await assert.rejects(() => client.action('set-volume', { inputName: 'Mic/Aux', volumeDb: '' }), /Unsupported or incomplete OBS action/);
  await assert.rejects(() => client.action('toggle-source', { sceneName: 'Live', sourceName: 'Camera', enabled: true }), /Unsupported or incomplete OBS action/);
});

test('maps Dexter-inspired OBS source and studio actions to bounded v5 requests', async () => {
  class FakeSocket extends EventEmitter {
    static sent = [];
    constructor() {
      super(); this.readyState = 0;
      queueMicrotask(() => { this.readyState = 1; this.emit('open'); queueMicrotask(() => this.emit('message', JSON.stringify({ op: 0, d: {} }))); });
    }
    send(raw) {
      const message = JSON.parse(raw); FakeSocket.sent.push(message);
      if (message.op === 1) queueMicrotask(() => this.emit('message', JSON.stringify({ op: 2, d: {} })));
      if (message.op === 6) queueMicrotask(() => this.emit('message', JSON.stringify({ op: 7, d: { requestId: message.d.requestId, requestStatus: { result: true }, responseData: {} } })));
    }
    close() { this.readyState = 2; queueMicrotask(() => this.emit('close')); }
  }
  const client = new ObsClient({ url: 'ws://127.0.0.1:4455', WebSocketClass: FakeSocket });
  const cases = [
    ['refresh-browser-source', { inputName: 'Browser' }, 'PressInputPropertiesButton', { inputName: 'Browser', propertyName: 'refreshnocache' }],
    ['restart-media-source', { inputName: 'Video' }, 'TriggerMediaInputAction', { inputName: 'Video', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' }],
    ['set-transition', { transitionName: 'Fade' }, 'SetCurrentSceneTransition', { transitionName: 'Fade' }],
    ['toggle-filter', { sourceName: 'Camera', filterName: 'Chroma Key', enabled: true }, 'SetSourceFilterEnabled', { sourceName: 'Camera', filterName: 'Chroma Key', filterEnabled: true }]
  ];
  for (const [action, params, requestType, requestData] of cases) {
    FakeSocket.sent.length = 0;
    const result = await client.action(action, params);
    const request = FakeSocket.sent.find((message) => message.op === 6);
    assert.equal(result.requestType, requestType);
    assert.equal(request.d.requestType, requestType);
    assert.deepEqual(request.d.requestData, requestData);
  }
  await assert.rejects(() => client.action('toggle-filter', { sourceName: 'Camera', enabled: true }), /Unsupported or incomplete OBS action/);
});
