import test from 'node:test';
import assert from 'node:assert/strict';
import { abortCameraCaptures, captureCameraFrame } from '../lib/camera-capture.mjs';

test('camera capture passes a private abort signal and unregisters after success', async () => {
  const controllers = new Set();
  let received;
  const frame = await captureCameraFrame('/dev/video2', {
    controllers,
    runner: async (command, args, options) => {
      received = { command, args, options };
      assert.equal(controllers.size, 1);
      return Buffer.from('jpeg');
    }
  });
  assert.equal(frame.toString(), 'jpeg');
  assert.equal(received.command, 'ffmpeg');
  assert.ok(received.args.includes('-nostdin'));
  assert.equal(received.args[received.args.indexOf('-i') + 1], '/dev/video2');
  assert.equal(received.options.signal instanceof AbortSignal, true);
  assert.equal(controllers.size, 0);
});

test('camera shutdown aborts every active capture and releases the registry', async () => {
  const controllers = new Set();
  const capture = captureCameraFrame('/dev/video3', {
    controllers,
    runner: async (_command, _args, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('capture aborted'), { name: 'AbortError' })), { once: true });
    })
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controllers.size, 1);
  assert.equal(abortCameraCaptures(controllers), 1);
  await assert.rejects(() => capture, { name: 'AbortError' });
  assert.equal(controllers.size, 0);
  assert.equal(abortCameraCaptures(controllers), 0);
});
