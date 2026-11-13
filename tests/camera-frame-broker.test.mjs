import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraFrameBroker, cameraCaptureMessage } from '../lib/camera-frame-broker.mjs';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('coalesces simultaneous frame requests for the same Pi camera', async () => {
  const gate = deferred();
  let captures = 0;
  const broker = new CameraFrameBroker({ capture: async () => { captures += 1; return gate.promise; } });
  const first = broker.frame('/dev/video2');
  const second = broker.frame('/dev/video2');
  assert.equal(captures, 1);
  gate.resolve(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const [left, right] = await Promise.all([first, second]);
  assert.equal(captures, 1);
  assert.deepEqual(left, right);
});

test('uses a short healthy cache but never serves it after expiry', async () => {
  let now = 1000;
  let captures = 0;
  const broker = new CameraFrameBroker({ now: () => now, cacheMs: 500, capture: async () => Buffer.from(`frame-${++captures}`) });
  assert.equal((await broker.frame('/dev/video2')).toString(), 'frame-1');
  now = 1499;
  assert.equal((await broker.frame('/dev/video2')).toString(), 'frame-1');
  now = 1500;
  assert.equal((await broker.frame('/dev/video2')).toString(), 'frame-2');
  assert.equal(captures, 2);
});

test('normalizes camera-busy errors and applies a bounded retry backoff', async () => {
  let now = 1000;
  let captures = 0;
  const broker = new CameraFrameBroker({
    now: () => now,
    busyBackoffMs: 1000,
    capture: async () => { captures += 1; throw new Error('ioctl: Device or resource busy / private/path'); }
  });
  await assert.rejects(broker.frame('/dev/video0'), /busy in another local application/);
  await assert.rejects(broker.frame('/dev/video0'), /busy in another local application/);
  assert.equal(captures, 1);
  now = 2000;
  await assert.rejects(broker.frame('/dev/video0'), /busy in another local application/);
  assert.equal(captures, 2);
});

test('allows at most two independent camera captures at once', async () => {
  const gates = new Map();
  const broker = new CameraFrameBroker({ capture: async (device) => {
    const gate = deferred();
    gates.set(device, gate);
    return gate.promise;
  } });
  const first = broker.frame('/dev/video0');
  const second = broker.frame('/dev/video2');
  await assert.rejects(broker.frame('/dev/video4'), /capture limit reached/);
  gates.get('/dev/video0').resolve(Buffer.from('one'));
  gates.get('/dev/video2').resolve(Buffer.from('two'));
  await Promise.all([first, second]);
});

test('does not expose raw FFmpeg or device diagnostics', () => {
  assert.equal(cameraCaptureMessage(new Error('permission denied at /home/pi5/private')), 'Pi camera capture failed. Check the selected camera and FFmpeg.');
  assert.equal(cameraCaptureMessage(new Error('Cannot open video device')), 'The selected Pi camera is busy in another local application.');
});

