const CAMERA_CAPTURE_TIMEOUT_MS = 9000;

export async function captureCameraFrame(device, { runner, controllers, timeoutMs = CAMERA_CAPTURE_TIMEOUT_MS } = {}) {
  if (typeof runner !== 'function') throw new Error('Camera capture runner is unavailable.');
  if (!(controllers instanceof Set)) throw new Error('Camera capture registry is unavailable.');
  const controller = new AbortController();
  controllers.add(controller);
  try {
    return await runner('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'v4l2', '-i', device,
      '-frames:v', '1', '-vf', 'scale=960:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'
    ], { encoding: 'buffer', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, signal: controller.signal });
  } finally {
    controllers.delete(controller);
  }
}

export function abortCameraCaptures(controllers) {
  if (!(controllers instanceof Set)) return 0;
  let aborted = 0;
  for (const controller of controllers) {
    if (controller?.signal?.aborted) continue;
    controller.abort();
    aborted += 1;
  }
  return aborted;
}

export { CAMERA_CAPTURE_TIMEOUT_MS };
