import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deviceIdConstraint, friendlyMediaError, getUserMediaWithFallback, normalizeDeviceId
} from '../public/media-utils.js';

test('removes invalid serialized device sentinels', () => {
  assert.equal(normalizeDeviceId('undefined'), '');
  assert.equal(normalizeDeviceId(' null '), '');
  assert.equal(normalizeDeviceId(undefined), '');
  assert.equal(normalizeDeviceId('camera-123'), 'camera-123');
  assert.deepEqual(deviceIdConstraint('camera-123'), { exact: 'camera-123' });
  assert.equal(deviceIdConstraint('undefined'), undefined);
});

test('retries once with browser defaults when a saved device is stale', async () => {
  const calls = [];
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length === 1) throw Object.assign(new Error('stale device'), { name: 'OverconstrainedError' });
      return { id: 'default-stream' };
    }
  };
  const result = await getUserMediaWithFallback(mediaDevices, {
    video: { deviceId: { exact: 'missing-camera' }, width: { ideal: 960 } },
    audio: { deviceId: { exact: 'missing-mic' }, echoCancellation: true }
  });
  assert.equal(result.stream.id, 'default-stream');
  assert.equal(result.fallbackUsed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].video.deviceId, undefined);
  assert.equal(calls[1].audio.deviceId, undefined);
});

test('does not retry denied permissions and provides actionable text', async () => {
  const error = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  await assert.rejects(() => getUserMediaWithFallback({ getUserMedia: async () => { throw error; } }, {
    video: { deviceId: { exact: 'camera' } }, audio: false
  }), error);
  assert.match(friendlyMediaError(error), /permission is blocked/i);
});
