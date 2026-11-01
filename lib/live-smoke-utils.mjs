// Keep the base64 data URL below the dashboard's 3.5 MB image limit.
const MAX_CAMERA_FRAME_BYTES = 2_500_000;

export function assertLoopbackBaseUrl(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw new Error('--real-camera requires a valid localhost JARVIS_BASE_URL.'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('--real-camera requires JARVIS_BASE_URL to use localhost; camera frames must stay on the Pi.');
  }
}

export function validCameraSmokeFrame({ status, contentType, byteLength, maxBytes = MAX_CAMERA_FRAME_BYTES } = {}) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  const bytes = Number(byteLength);
  const limit = Math.min(MAX_CAMERA_FRAME_BYTES, Math.max(128, Number(maxBytes) || MAX_CAMERA_FRAME_BYTES));
  return Number(status) === 200
    && /^image\/(?:jpeg|png|webp)$/.test(mime)
    && Number.isFinite(bytes)
    && bytes >= 128
    && bytes <= limit;
}
