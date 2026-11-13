const FRIENDLY_BUSY = 'The selected Pi camera is busy in another local application.';
const FRIENDLY_CAPTURE = 'Pi camera capture failed. Check the selected camera and FFmpeg.';
const FRIENDLY_LIMIT = 'Pi camera capture limit reached. Retry shortly.';

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? Math.round(numeric) : fallback));
}

export function cameraCaptureMessage(error) {
  const detail = String(error?.message || error || '');
  return /\b(?:device or resource busy|resource temporarily unavailable|camera is busy|cannot open (?:video )?device)\b/i.test(detail)
    ? FRIENDLY_BUSY
    : FRIENDLY_CAPTURE;
}

export class CameraFrameBroker {
  constructor({ capture, now = () => Date.now(), cacheMs = 750, busyBackoffMs = 1200, maxConcurrent = 2 } = {}) {
    if (typeof capture !== 'function') throw new TypeError('CameraFrameBroker requires a capture function.');
    this.capture = capture;
    this.now = now;
    this.cacheMs = boundedInteger(cacheMs, 750, 0, 2000);
    this.busyBackoffMs = boundedInteger(busyBackoffMs, 1200, 100, 5000);
    this.maxConcurrent = boundedInteger(maxConcurrent, 2, 1, 2);
    this.inFlight = new Map();
    this.cache = new Map();
    this.failures = new Map();
    this.activeCaptures = 0;
  }

  async frame(device) {
    const key = String(device || '');
    const now = Number(this.now());
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.frame;
    if (cached) this.cache.delete(key);

    const failure = this.failures.get(key);
    if (failure && failure.retryAt > now) throw new Error(failure.message);
    if (failure) this.failures.delete(key);

    const existing = this.inFlight.get(key);
    if (existing) return existing;
    if (this.activeCaptures >= this.maxConcurrent) throw new Error(FRIENDLY_LIMIT);

    this.activeCaptures += 1;
    const pending = (async () => {
      try {
        const frame = await this.capture(key);
        if (!Buffer.isBuffer(frame) || frame.length === 0) throw new Error('empty camera frame');
        this.failures.delete(key);
        this.cache.set(key, { frame, expiresAt: Number(this.now()) + this.cacheMs });
        return frame;
      } catch (error) {
        const message = cameraCaptureMessage(error);
        this.failures.set(key, { message, retryAt: Number(this.now()) + this.busyBackoffMs });
        throw new Error(message);
      } finally {
        this.activeCaptures = Math.max(0, this.activeCaptures - 1);
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, pending);
    return pending;
  }
}

