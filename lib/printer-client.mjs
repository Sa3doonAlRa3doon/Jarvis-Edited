const DEFAULT_TIMEOUT_MS = 2800;

function cleanBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('PRINTER_URL must use http or https.');
  if (parsed.username || parsed.password) throw new Error('PRINTER_URL must not contain embedded credentials. Use PRINTER_API_KEY instead.');
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/$/, '');
  return parsed.href.replace(/\/$/, '');
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function remainingSeconds({ state, progress, printDuration, estimatedTime }) {
  if (['complete', 'cancelled', 'standby'].includes(String(state).toLowerCase())) return 0;
  if (estimatedTime > printDuration) return Math.max(0, estimatedTime - printDuration);
  if (progress > 0.003 && printDuration > 1) return Math.max(0, (printDuration / progress) - printDuration);
  return null;
}

export function normalizeMoonrakerStatus(payload = {}, metadata = {}, configured = true) {
  const status = payload?.result?.status || payload?.status || {};
  const stats = status.print_stats || {};
  const virtualSd = status.virtual_sdcard || {};
  const display = status.display_status || {};
  const extruder = status.extruder || {};
  const bed = status.heater_bed || {};
  const toolhead = status.toolhead || {};
  const meta = metadata?.result || metadata || {};
  const state = String(stats.state || 'standby').toLowerCase();
  const progress = Math.max(0, Math.min(1, number(virtualSd.progress, number(display.progress, 0))));
  const printDuration = Math.max(0, number(stats.print_duration, stats.total_duration));
  const estimatedTime = Math.max(0, number(meta.estimated_time, 0));
  return {
    configured,
    online: true,
    ready: true,
    state,
    message: String(stats.message || ''),
    filename: String(stats.filename || ''),
    progress,
    printDuration,
    totalDuration: estimatedTime || (progress > 0.003 ? printDuration / progress : null),
    remaining: remainingSeconds({ state, progress, printDuration, estimatedTime }),
    temperatures: {
      nozzle: number(extruder.temperature), nozzleTarget: number(extruder.target),
      bed: number(bed.temperature), bedTarget: number(bed.target)
    },
    position: Array.isArray(toolhead.position) ? toolhead.position.slice(0, 3).map((item) => number(item)) : [],
    metadata: {
      size: number(meta.size), objectHeight: number(meta.object_height),
      layerCount: number(meta.layer_count), slicer: String(meta.slicer || '')
    },
    checkedAt: new Date().toISOString()
  };
}

export class PrinterClient {
  constructor({ baseUrl = '', apiKey = '', timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
    this.baseUrl = cleanBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '').trim();
    this.timeoutMs = Math.max(500, Math.min(15_000, number(timeoutMs, DEFAULT_TIMEOUT_MS)));
    this.fetchImpl = fetchImpl;
    this.statusInFlight = null;
  }

  get configured() { return Boolean(this.baseUrl); }

  headers(extra = {}) {
    return this.apiKey ? { ...extra, 'X-Api-Key': this.apiKey } : extra;
  }

  async request(pathname, options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      ...options,
      headers: this.headers(options.headers),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) throw new Error(`Printer returned HTTP ${response.status}`);
    return response.json();
  }

  async collectStatus() {
    if (!this.configured) return { configured: false, online: false, ready: false, state: 'unconfigured', message: 'Set PRINTER_URL on the Pi.', checkedAt: new Date().toISOString() };
    try {
      const payload = await this.request('/printer/objects/query?print_stats&virtual_sdcard&display_status&extruder&heater_bed&toolhead');
      const filename = String(payload?.result?.status?.print_stats?.filename || '');
      let metadata = {};
      if (filename) {
        try { metadata = await this.request(`/server/files/metadata?filename=${encodeURIComponent(filename)}`); }
        catch { metadata = {}; }
      }
      return normalizeMoonrakerStatus(payload, metadata, true);
    } catch (error) {
      return {
        configured: true, online: false, ready: false, state: 'offline',
        message: 'Printer is offline or Moonraker is not reachable.',
        error: String(error?.message || 'Connection failed').slice(0, 180),
        checkedAt: new Date().toISOString()
      };
    }
  }

  async status({ fresh = false } = {}) {
    if (fresh && this.statusInFlight) await this.statusInFlight.catch(() => {});
    if (!fresh && this.statusInFlight) return this.statusInFlight;
    const pending = this.collectStatus();
    this.statusInFlight = pending;
    try { return await pending; }
    finally { if (this.statusInFlight === pending) this.statusInFlight = null; }
  }

  async action(action) {
    const endpoints = {
      pause: '/printer/print/pause',
      resume: '/printer/print/resume',
      cancel: '/printer/print/cancel'
    };
    if (!endpoints[action]) throw new Error('Unsupported printer action.');
    if (!this.configured) throw new Error('Printer is not configured.');
    await this.request(endpoints[action], { method: 'POST' });
    return this.status({ fresh: true });
  }
}
