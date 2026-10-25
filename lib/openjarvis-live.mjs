import WebSocket from 'ws';

const CONTROL_TOOLS = /^(?:browser_|shell_exec$|docker_shell_exec$|file_write$|apply_patch$|code_interpreter|repl$|git_(?:commit|checkout|merge|push|pull|reset|restore)|agent_)/i;
const FRAME_LIMIT_BYTES = 6 * 1024 * 1024;
const FRAME_VISIBLE_GRACE_MS = 900;

function clean(value, limit = 180) {
  return String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function isControlTool(value) {
  return CONTROL_TOOLS.test(clean(value, 100));
}

function frameMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

export function decodeScreenshotFrame(value) {
  const source = String(value || '').replace(/^data:image\/(?:png|jpeg|webp);base64,/i, '');
  if (source.length < 32 || source.length > Math.ceil(FRAME_LIMIT_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(source)) return null;
  const bytes = Buffer.from(source, 'base64');
  if (!bytes.length || bytes.length > FRAME_LIMIT_BYTES) return null;
  const mime = frameMime(bytes);
  return mime ? { bytes, mime } : null;
}

export function screenshotFromEvent(value, depth = 0, seen = new Set()) {
  if (value == null || depth > 5) return null;
  if (typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (String(value.type || '').toLowerCase() === 'image' && /^image\/(?:png|jpeg|webp)$/i.test(String(value.mimeType || value.mime_type || ''))) {
    const frame = decodeScreenshotFrame(value.data || value.base64 || value.image);
    if (frame) return frame;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/screenshot(?:_base64|Base64)$/i.test(key)) {
      const frame = decodeScreenshotFrame(child);
      if (frame) return frame;
    }
  }
  for (const child of Object.values(value)) {
    const frame = screenshotFromEvent(child, depth + 1, seen);
    if (frame) return frame;
  }
  return null;
}

function websocketUrl(baseUrl) {
  const value = new URL(baseUrl);
  value.protocol = value.protocol === 'https:' ? 'wss:' : 'ws:';
  value.pathname = `${value.pathname.replace(/\/$/, '')}/v1/agents/events`;
  value.search = '';
  value.hash = '';
  return value.href;
}

export class OpenJarvisLiveBridge {
  constructor({ baseUrl, apiKey = '', onActivity = () => {}, WebSocketClass = WebSocket } = {}) {
    this.url = websocketUrl(baseUrl || 'http://127.0.0.1:8000');
    this.apiKey = String(apiKey || '');
    this.onActivity = onActivity;
    this.WebSocketClass = WebSocketClass;
    this.socket = null;
    this.reconnectTimer = 0;
    this.closed = false;
    this.connected = false;
    this.requestActive = false;
    this.controlActive = false;
    this.visibleUntil = 0;
    this.tool = '';
    this.phase = 'standby';
    this.startedAt = '';
    this.updatedAt = '';
    this.frame = null;
    this.frameVersion = 0;
  }

  start() {
    this.closed = false;
    this.connect();
  }

  connect() {
    if (this.closed || this.socket && [this.WebSocketClass.OPEN, this.WebSocketClass.CONNECTING].includes(this.socket.readyState)) return;
    const options = this.apiKey ? { headers: { Authorization: `Bearer ${this.apiKey}` } } : undefined;
    try { this.socket = new this.WebSocketClass(this.url, options); }
    catch { this.scheduleReconnect(); return; }
    this.socket.on('open', () => { this.connected = true; });
    this.socket.on('message', (raw) => {
      try { this.applyEvent(JSON.parse(String(raw))); } catch {}
    });
    this.socket.on('error', () => {});
    this.socket.on('close', () => { this.connected = false; this.socket = null; this.scheduleReconnect(); });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.closed) return;
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    this.reconnectTimer.unref?.();
  }

  noteRequestStart() {
    this.requestActive = true;
    this.phase = 'thinking';
    this.startedAt = new Date().toISOString();
    this.updatedAt = this.startedAt;
  }

  noteRequestEnd(success = true) {
    this.requestActive = false;
    this.phase = success ? 'complete' : 'error';
    this.updatedAt = new Date().toISOString();
    if (this.controlActive) this.visibleUntil = Date.now() + FRAME_VISIBLE_GRACE_MS;
    setTimeout(() => {
      if (!this.requestActive && Date.now() >= this.visibleUntil) {
        this.controlActive = false;
        this.tool = '';
        this.frame = null;
      }
    }, FRAME_VISIBLE_GRACE_MS + 20).unref?.();
  }

  noteLocalControl(tool) {
    this.requestActive = true;
    this.controlActive = true;
    this.tool = clean(tool, 100);
    this.phase = 'controlling';
    this.startedAt = new Date().toISOString();
    this.updatedAt = this.startedAt;
  }

  applyEvent(payload = {}) {
    const type = clean(payload.type, 100).toLowerCase();
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const tool = clean(data.tool || data.tool_name || data.name || payload.tool || payload.tool_name || payload.name, 100);
    const now = new Date().toISOString();
    if (type.includes('agent_turn_start') || type.includes('tick_start')) {
      this.requestActive = true;
      this.phase = 'thinking';
      this.startedAt ||= now;
    }
    if (type.includes('tool_call_start')) {
      this.tool = tool;
      this.phase = 'tool';
      if (isControlTool(tool)) {
        this.controlActive = true;
        this.visibleUntil = 0;
        this.onActivity({ type: 'control', phase: 'start', tool });
      }
    }
    const frame = screenshotFromEvent(payload);
    if (frame && (isControlTool(tool) || this.controlActive)) {
      this.frame = frame;
      this.frameVersion += 1;
      this.controlActive = true;
      this.phase = 'live-frame';
    }
    if (type.includes('tool_call_end') && this.controlActive) {
      this.phase = data.success === false ? 'tool-error' : 'tool-complete';
      this.onActivity({ type: 'control', phase: this.phase, tool: tool || this.tool });
    }
    if (type.includes('agent_turn_end') || type.includes('tick_end')) this.noteRequestEnd(data.success !== false);
    this.updatedAt = now;
  }

  status(now = Date.now()) {
    const visible = this.controlActive && (this.requestActive || now < this.visibleUntil);
    return {
      connected: this.connected,
      visible,
      active: this.requestActive,
      phase: this.phase,
      tool: visible ? this.tool : '',
      startedAt: visible ? this.startedAt : '',
      updatedAt: this.updatedAt,
      frameAvailable: Boolean(visible && this.frame),
      frameVersion: visible && this.frame ? this.frameVersion : 0
    };
  }

  currentFrame() {
    return this.status().visible ? this.frame : null;
  }

  async stop() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < this.WebSocketClass.CLOSING) socket.close();
  }
}
