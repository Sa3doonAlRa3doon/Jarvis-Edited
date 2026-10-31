import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deviceIdConstraint, deviceSelectionAvailability, friendlyMediaError, getUserMediaWithFallback, normalizeDeviceId
} from '../public/media-utils.js';

test('removes invalid serialized device sentinels', () => {
  assert.equal(normalizeDeviceId('undefined'), '');
  assert.equal(normalizeDeviceId(' null '), '');
  assert.equal(normalizeDeviceId(undefined), '');
  assert.equal(normalizeDeviceId('camera-123'), 'camera-123');
  assert.deepEqual(deviceIdConstraint('camera-123'), { exact: 'camera-123' });
  assert.equal(deviceIdConstraint('undefined'), undefined);
});

test('detects a disconnected saved camera or microphone without exposing raw inventory', () => {
  const available = deviceSelectionAvailability({
    selectedCamera: 'cam-1', selectedMicrophone: 'mic-2',
    cameras: [{ deviceId: 'cam-1' }, { deviceId: 'cam-3' }],
    microphones: [{ id: 'mic-2' }, { id: 'mic-4' }]
  });
  assert.deepEqual(available, {
    cameraAvailable: true, microphoneAvailable: true, cameraCount: 2, microphoneCount: 2
  });
  const missing = deviceSelectionAvailability({ selectedCamera: 'cam-gone', selectedMicrophone: 'mic-gone', cameras: [{ deviceId: 'cam-1' }], microphones: [{ deviceId: 'mic-1' }] });
  assert.equal(missing.cameraAvailable, false);
  assert.equal(missing.microphoneAvailable, false);
  assert.doesNotMatch(JSON.stringify(missing), /cam-gone|mic-gone/);
  const defaulted = deviceSelectionAvailability({ cameras: [], microphones: [] });
  assert.equal(defaulted.cameraAvailable, true);
  assert.equal(defaulted.microphoneAvailable, true);
});

test('retries once with browser defaults when a saved device is stale', async () => {
  const calls = [];
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length < 4) throw Object.assign(new Error('stale device'), { name: 'OverconstrainedError' });
      return { id: 'default-stream' };
    }
  };
  const result = await getUserMediaWithFallback(mediaDevices, {
    video: { deviceId: { exact: 'missing-camera' }, width: { ideal: 960 } },
    audio: { deviceId: { exact: 'missing-mic' }, echoCancellation: true }
  });
  assert.equal(result.stream.id, 'default-stream');
  assert.equal(result.fallbackUsed, true);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].video.deviceId, undefined);
  assert.equal(calls[3].audio.deviceId, undefined);
});

test('recovers a selected device during a short release race without falling back', async () => {
  const calls = [];
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length === 1) throw Object.assign(new Error('selected device is still releasing'), { name: 'NotReadableError' });
      return { id: 'selected-recovered-stream' };
    }
  };
  const result = await getUserMediaWithFallback(mediaDevices, {
    video: { deviceId: { exact: 'selected-camera' } }, audio: false
  });
  assert.equal(result.stream.id, 'selected-recovered-stream');
  assert.equal(result.fallbackUsed, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].video.deviceId, { exact: 'selected-camera' });
});

test('retries a transient default-device race once', async () => {
  const calls = [];
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length === 1) throw Object.assign(new Error('device is briefly busy'), { name: 'NotFoundError' });
      return { id: 'recovered-default-stream' };
    }
  };
  const result = await getUserMediaWithFallback(mediaDevices, { video: true, audio: true });
  assert.equal(result.stream.id, 'recovered-default-stream');
  assert.equal(result.fallbackUsed, false);
  assert.equal(calls.length, 2);
});

test('bounds repeated default-device release races at three attempts', async () => {
  const calls = [];
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length < 3) throw Object.assign(new Error('device is still releasing'), { name: 'NotReadableError' });
      return { id: 'recovered-after-release' };
    }
  };
  const result = await getUserMediaWithFallback(mediaDevices, { video: true, audio: true });
  assert.equal(result.stream.id, 'recovered-after-release');
  assert.equal(calls.length, 3);
});

test('retries the browser-default fallback after a stale selected device', async () => {
  const calls = [];
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length < 4) throw Object.assign(new Error('saved camera disappeared'), { name: 'NotFoundError' });
      if (calls.length === 4) throw Object.assign(new Error('camera is still releasing'), { name: 'NotReadableError' });
      return { id: 'fallback-after-release' };
    }
  };
  const result = await getUserMediaWithFallback(mediaDevices, { video: { deviceId: { exact: 'stale-camera' } }, audio: false });
  assert.equal(result.stream.id, 'fallback-after-release');
  assert.equal(result.fallbackUsed, true);
  assert.equal(calls.length, 5);
  assert.equal(calls[3].video.deviceId, undefined);
});

test('does not retry denied permissions and provides actionable text', async () => {
  const error = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  await assert.rejects(() => getUserMediaWithFallback({ getUserMedia: async () => { throw error; } }, {
    video: { deviceId: { exact: 'camera' } }, audio: false
  }), error);
  assert.match(friendlyMediaError(error), /permission is blocked/i);
});
