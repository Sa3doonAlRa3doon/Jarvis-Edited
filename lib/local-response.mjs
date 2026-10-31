const READ_REQUEST = /\b(?:status|health|ready|working|online|current|show|tell|what|how|check|report|list|progress|remaining|eta|time\s+left|temperature|percent)\b/i;
const MUTATION_REQUEST = /\b(?:start|stop|pause|resume|cancel|abort|end|restart|shutdown|reboot|turn\s+(?:on|off)|set|change|delete|remove|repair|maintenance|print\s+(?:this|it)|launch|open|send|post|upload)\b/i;
const EXTERNAL_REQUEST = /\b(?:weather|map|google|gmail|calendar|drive|tasks?|contacts?|email|news|web|website|browser|reddit|instagram|github|youtube|twitch|discord|screen|camera|vision|obs|stream|music)\b/i;
const PRINTER_REQUEST = /\b(?:3d\s*printer|printer|moonraker|klipper|nozzle|g-?code|bed\s+(?:temperature|level)|print(?:ing)?\s+(?:status|progress|time|eta|job))\b/i;
const DOCKER_REQUEST = /\b(?:docker|container(?:s)?|compose)\b/i;
const HOST_REQUEST = /\b(?:cpu|ram|memory|storage|disk|gpu|temperature|uptime|system|host|service(?:s)?|health)\b/i;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percent(value) {
  const number = finite(value);
  return number == null ? 'N/A' : `${Math.round(Math.max(0, Math.min(100, number)))}%`;
}

function duration(seconds) {
  const value = finite(seconds);
  if (value == null || value < 0) return '--';
  const minutes = Math.round(value / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

/**
 * Detect a single read-only local status request. This intentionally refuses
 * mixed or mutating prompts so a fast path can never swallow an approved
 * printer/service action or a cross-domain request.
 */
export function localStatusIntent(prompt) {
  const text = String(prompt || '').trim();
  if (!text || !READ_REQUEST.test(text) || MUTATION_REQUEST.test(text) || EXTERNAL_REQUEST.test(text)) return null;
  const matches = [
    ['printer', PRINTER_REQUEST.test(text)],
    ['docker', DOCKER_REQUEST.test(text)],
    ['host', HOST_REQUEST.test(text) && !DOCKER_REQUEST.test(text) && !PRINTER_REQUEST.test(text)]
  ].filter(([, matched]) => matched).map(([kind]) => kind);
  return matches.length === 1 ? matches[0] : null;
}

export function localStatusRoute(kind) {
  return kind === 'printer' ? 'FABRICATOR' : 'MONITOR';
}

export function summarizeLocalStatus(kind, data = {}) {
  if (kind === 'printer') {
    const printer = data.printer || {};
    if (!printer.online) return 'Printer update: Moonraker is offline or the printer is powered down.';
    const progress = finite(printer.progress);
    const progressText = progress == null ? 'progress unavailable' : `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    return `Printer update: ${String(printer.state || 'ready').toUpperCase()}, ${progressText}, ETA ${duration(printer.remaining)}, ${String(printer.filename || 'no active file').slice(0, 160)}.`;
  }
  if (kind === 'docker') {
    const docker = data.docker || {};
    const containers = Array.isArray(docker.containers) ? docker.containers : [];
    const running = containers.filter((item) => /running|up/i.test(`${item?.state || ''} ${item?.status || ''}`)).length;
    const unhealthy = containers.filter((item) => /unhealthy|exited|dead|failed/i.test(`${item?.state || ''} ${item?.status || ''}`)).length;
    return docker.available
      ? `Docker update: ${running}/${containers.length} containers running, ${unhealthy} unhealthy or stopped.`
      : 'Docker update: the Docker engine is unavailable on this host.';
  }
  const metrics = data.metrics || {};
  const services = data.services || {};
  const serviceEntries = Object.entries(services);
  const online = serviceEntries.filter(([, value]) => value?.online).length;
  const total = serviceEntries.length;
  const gpu = metrics.gpu?.available ? `${percent(metrics.gpu.percent)} ${String(metrics.gpu.name || 'GPU')}` : 'counter unavailable';
  const temperatureValue = typeof metrics.temperature === 'number' ? metrics.temperature : metrics.temperature?.celsius ?? metrics.temperature?.value;
  const temperature = finite(temperatureValue);
  const temperatureText = temperature == null ? 'N/A' : `${temperature.toFixed(1)}°C`;
  return `Host update: CPU ${percent(metrics.cpu?.percent)}, RAM ${percent(metrics.memory?.percent)}, disk ${percent(metrics.disk?.percent)}, GPU ${gpu}, temperature ${temperatureText}, services ${online}/${total} online.`;
}

