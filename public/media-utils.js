const INVALID_DEVICE_IDS = new Set(['undefined', 'null', 'false', 'nan', '[object object]']);

export function normalizeDeviceId(value) {
  if (typeof value !== 'string') return '';
  const deviceId = value.trim();
  return !deviceId || INVALID_DEVICE_IDS.has(deviceId.toLowerCase()) ? '' : deviceId;
}

export function deviceIdConstraint(value) {
  const deviceId = normalizeDeviceId(value);
  return deviceId ? { exact: deviceId } : undefined;
}

function withoutExactDevice(track) {
  if (!track || track === true || typeof track !== 'object') return track;
  const { deviceId: _deviceId, ...fallback } = track;
  return fallback;
}

export function isRecoverableDeviceError(error) {
  return ['OverconstrainedError', 'ConstraintNotSatisfiedError', 'NotFoundError', 'DevicesNotFoundError', 'NotReadableError', 'TrackStartError']
    .includes(error?.name);
}

export async function getUserMediaWithFallback(mediaDevices, constraints) {
  if (!mediaDevices?.getUserMedia) throw new Error('Camera and microphone access is unavailable in this browser.');
  try {
    return { stream: await mediaDevices.getUserMedia(constraints), fallbackUsed: false, originalError: null };
  } catch (error) {
    const hasSelectedDevice = Boolean(
      constraints?.audio && typeof constraints.audio === 'object' && constraints.audio.deviceId
      || constraints?.video && typeof constraints.video === 'object' && constraints.video.deviceId
    );
    if (!hasSelectedDevice || !isRecoverableDeviceError(error)) throw error;
    const fallback = {
      audio: withoutExactDevice(constraints.audio),
      video: withoutExactDevice(constraints.video)
    };
    return { stream: await mediaDevices.getUserMedia(fallback), fallbackUsed: true, originalError: error };
  }
}

export function friendlyMediaError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera or microphone permission is blocked. Allow both for this site, then retry.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No matching camera or microphone is connected.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The camera or microphone is busy in another app. Close that app, then retry.';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return 'The saved device is no longer available. Rescan devices and retry.';
  return error?.message || 'The browser could not start the camera or microphone.';
}
