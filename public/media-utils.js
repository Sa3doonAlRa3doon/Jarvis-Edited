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

/**
 * Report whether saved browser selections still exist in the current device
 * inventory. A blank selection means the browser may choose a default device,
 * so it remains available even when the list is temporarily empty.
 */
export function deviceSelectionAvailability({ selectedCamera = '', selectedMicrophone = '', cameras = [], microphones = [] } = {}) {
  const camera = normalizeDeviceId(selectedCamera);
  const microphone = normalizeDeviceId(selectedMicrophone);
  const cameraIds = new Set((Array.isArray(cameras) ? cameras : []).map((item) => normalizeDeviceId(item?.deviceId || item?.id || item)).filter(Boolean));
  const microphoneIds = new Set((Array.isArray(microphones) ? microphones : []).map((item) => normalizeDeviceId(item?.deviceId || item?.id || item)).filter(Boolean));
  return {
    cameraAvailable: !camera || cameraIds.has(camera),
    microphoneAvailable: !microphone || microphoneIds.has(microphone),
    cameraCount: cameraIds.size,
    microphoneCount: microphoneIds.size
  };
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

async function retryDeviceOpen(mediaDevices, constraints, attempts = 3) {
  let lastError;
  const totalAttempts = Math.max(1, Math.min(3, Number(attempts) || 3));
  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try { return await mediaDevices.getUserMedia(constraints); }
    catch (error) {
      lastError = error;
      if (!isRecoverableDeviceError(error) || attempt + 1 >= totalAttempts) throw error;
      // Device release races are common after a camera preview closes. Keep
      // the retry short and bounded; permission failures never enter here.
      await new Promise((resolve) => setTimeout(resolve, 120 + attempt * 120));
    }
  }
  throw lastError || new Error('The browser could not open the selected media devices.');
}

export async function getUserMediaWithFallback(mediaDevices, constraints) {
  if (!mediaDevices?.getUserMedia) throw new Error('Camera and microphone access is unavailable in this browser.');
  const hasSelectedDevice = Boolean(
    constraints?.audio && typeof constraints.audio === 'object' && constraints.audio.deviceId
    || constraints?.video && typeof constraints.video === 'object' && constraints.video.deviceId
  );
  try {
    // A saved device can be in the same short release race as the browser
    // default (for example after switching the Settings preview). Give the
    // selected device the same bounded retry window before treating it as
    // genuinely stale and falling back without its exact id.
    return { stream: await retryDeviceOpen(mediaDevices, constraints), fallbackUsed: false, originalError: null };
  } catch (error) {
    if (!isRecoverableDeviceError(error)) throw error;
    if (!hasSelectedDevice) {
      // retryDeviceOpen already made the bounded default-device attempts; a
      // real missing device still returns the final actionable error.
      throw error;
    }
    const fallback = {
      audio: withoutExactDevice(constraints.audio),
      video: withoutExactDevice(constraints.video)
    };
    return { stream: await retryDeviceOpen(mediaDevices, fallback), fallbackUsed: true, originalError: error };
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
