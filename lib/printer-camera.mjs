import { URL } from 'node:url';

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;

function clean(value, limit = 800) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, limit);
}

function hostOf(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

export function printerCameraCandidates(printerBaseUrl) {
  let printer;
  try { printer = new URL(String(printerBaseUrl || '')); }
  catch { return []; }
  if (!['http:', 'https:'].includes(printer.protocol) || !printer.hostname) return [];
  const ports = [printer.port || (printer.protocol === 'https:' ? '443' : '80')];
  // Creality/Fluidd helper installs commonly expose the first and second
  // camera on 4408, while Mainsail deployments may use the adjacent 4409.
  if (printer.port === '4408') ports.push('4409');
  const paths = ['/webcam/', '/webcam2/'];
  const candidates = [];
  for (const port of ports) {
    for (const pathname of paths) {
      const camera = new URL(printer.href);
      camera.port = port;
      camera.pathname = pathname;
      camera.search = '?action=snapshot';
      camera.hash = '';
      const value = camera.toString();
      if (!candidates.includes(value)) candidates.push(value);
    }
  }
  return candidates;
}

/**
 * Accept only a user-configured snapshot URL on the same host as PRINTER_URL.
 * The camera route is intentionally not a generic URL fetcher or stream proxy.
 */
export function normalizePrinterCameraUrl(value, printerBaseUrl) {
  const raw = clean(value);
  if (!raw) return '';
  let camera;
  let printer;
  try { camera = new URL(raw); } catch { throw new Error('PRINTER_CAMERA_URL must be a valid http or https URL.'); }
  try { printer = new URL(String(printerBaseUrl || '')); } catch { throw new Error('PRINTER_CAMERA_URL requires a configured PRINTER_URL.'); }
  if (!['http:', 'https:'].includes(camera.protocol) || camera.username || camera.password || camera.hash) throw new Error('PRINTER_CAMERA_URL must be credential-free http or https.');
  if (camera.hostname.toLowerCase() !== printer.hostname.toLowerCase()) throw new Error('PRINTER_CAMERA_URL must use the same host as PRINTER_URL.');
  camera.hash = '';
  return camera.toString();
}

function imageContentType(value) {
  const contentType = clean(value, 120).split(';')[0].toLowerCase();
  return /^image\/(?:jpeg|png|webp|gif)$/.test(contentType) ? contentType : '';
}

async function readBoundedBody(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('Printer camera snapshot exceeds the configured size limit.');
    return buffer;
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('Printer camera snapshot exceeds the configured size limit.');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, total);
}

export class PrinterCameraClient {
  constructor({
    url = process.env.PRINTER_CAMERA_URL || '',
    printerBaseUrl = process.env.PRINTER_URL || '',
    apiKey = process.env.PRINTER_API_KEY || '',
    timeoutMs = process.env.PRINTER_CAMERA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
    discoveryTimeoutMs = process.env.PRINTER_CAMERA_DISCOVERY_TIMEOUT_MS || 1_800,
    maxBytes = process.env.PRINTER_CAMERA_MAX_BYTES || DEFAULT_MAX_BYTES,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.configError = '';
    this.printerBaseUrl = clean(printerBaseUrl, 800);
    try { this.url = normalizePrinterCameraUrl(url, printerBaseUrl); }
    catch (error) { this.url = ''; this.configError = clean(error?.message || 'Printer camera URL is invalid.', 220); }
    this.apiKey = clean(apiKey, 600);
    this.timeoutMs = Math.max(1_000, Math.min(30_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    this.discoveryTimeoutMs = Math.max(500, Math.min(5_000, Number(discoveryTimeoutMs) || 1_800));
    this.maxBytes = Math.max(64 * 1024, Math.min(32 * 1024 * 1024, Number(maxBytes) || DEFAULT_MAX_BYTES));
    this.fetchImpl = fetchImpl;
    this.candidates = printerCameraCandidates(printerBaseUrl);
    this.discoveryAttempted = Boolean(this.url || this.configError);
    this.discoveryError = '';
    this.prefetchedFrame = null;
  }

  get configured() { return Boolean(this.url); }

  snapshot() {
    return {
      configured: this.configured,
      host: hostOf(this.url),
      endpoint: '/api/media/printer-camera/frame.jpg',
      continuousCapture: false,
      configError: this.configError || this.discoveryError || null,
      autoDiscovery: !this.configured && this.candidates.length > 0,
      discovery: this.discoveryAttempted ? (this.configured ? 'found' : 'not-found') : 'pending'
    };
  }

  requestOptions(timeoutMs = this.timeoutMs) {
    const headers = { Accept: 'image/jpeg,image/png,image/webp,image/gif' };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;
    return { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) };
  }

  async fetchFrame(url, { timeoutMs = this.timeoutMs } = {}) {
    let response;
    try { response = await this.fetchImpl(url, this.requestOptions(timeoutMs)); }
    catch (error) {
      throw new Error(clean(error?.name === 'TimeoutError' ? 'Printer camera snapshot timed out.' : error?.message || 'Printer camera is unreachable.', 240));
    }
    if (!response.ok) throw new Error(`Printer camera returned HTTP ${response.status}.`);
    const contentType = imageContentType(response.headers?.get?.('content-type'));
    if (!contentType) throw new Error('Printer camera endpoint did not return a JPEG, PNG, WebP, or GIF snapshot.');
    const advertised = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(advertised) && advertised > this.maxBytes) throw new Error('Printer camera snapshot exceeds the configured size limit.');
    const buffer = await readBoundedBody(response, this.maxBytes);
    if (!buffer.length) throw new Error('Printer camera returned an empty snapshot.');
    if (buffer.length > this.maxBytes) throw new Error('Printer camera snapshot exceeds the configured size limit.');
    return { buffer, contentType };
  }

  async discover({ retry = false } = {}) {
    if (this.configured) return { configured: true, discovered: false };
    // A printer may be powered on after JARVIS starts. Allow the dashboard's
    // slow, bounded retry loop to clear a previous offline result without
    // turning this client into a generic network scanner.
    if (retry && !this.configError) {
      this.discoveryAttempted = false;
      this.discoveryError = '';
    }
    if (this.discoveryAttempted) return { configured: false, discovered: false, error: this.discoveryError || this.configError || 'No printer camera endpoint was found.' };
    this.discoveryAttempted = true;
    if (!this.candidates.length) {
      this.discoveryError = this.configError || 'Set PRINTER_URL before discovering a printer camera.';
      return { configured: false, discovered: false, error: this.discoveryError };
    }
    const failures = [];
    for (const candidate of this.candidates) {
      try {
        const frame = await this.fetchFrame(candidate, { timeoutMs: this.discoveryTimeoutMs });
        this.url = candidate;
        this.prefetchedFrame = frame;
        return { configured: true, discovered: true };
      } catch (error) { failures.push(clean(error.message, 120)); }
    }
    this.discoveryError = 'No same-host printer camera snapshot endpoint responded.';
    return { configured: false, discovered: false, error: this.discoveryError, attempts: failures.length };
  }

  async frame() {
    if (!this.configured) {
      await this.discover();
      if (!this.configured) throw new Error(this.discoveryError || this.configError || 'No same-host printer camera snapshot endpoint responded.');
    }
    if (this.prefetchedFrame) {
      const frame = this.prefetchedFrame;
      this.prefetchedFrame = null;
      return frame;
    }
    return this.fetchFrame(this.url);
  }
}

export { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS };
