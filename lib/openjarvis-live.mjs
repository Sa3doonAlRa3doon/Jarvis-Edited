import fs from 'node:fs';
import WebSocket from 'ws';

const CONTROL_TOOLS = /^(?:(?:jarvis_)?browser_|shell_exec$|docker_shell_exec$|file_write$|apply_patch$|code_interpreter|repl$|git_(?:commit|checkout|merge|push|pull|reset|restore)|agent_)/i;
const FRAME_LIMIT_BYTES = 6 * 1024 * 1024;
const FRAME_VISIBLE_GRACE_MS = 900;
const PREVIEW_VISIBLE_MS = 90_000;

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
  constructor({ baseUrl, apiKey = '', frameFile = '', onActivity = () => {}, WebSocketClass = WebSocket } = {}) {
    this.url = websocketUrl(baseUrl || 'http://127.0.0.1:8000');
    this.apiKey = String(apiKey || '');
    this.frameFile = String(frameFile || '');
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
    this.route = '';
    this.agent = '';
    this.model = '';
    this.requestedModel = '';
    this.modelFallback = '';
    this.startedAt = '';
    this.updatedAt = '';
    this.frame = null;
    this.frameVersion = 0;
    this.fileFrameMtime = 0;
    this.preview = null;
    this.previewUntil = 0;
    this.previewUrl = '';
    this.previewTitle = '';
    this.previewVersion = 0;
    this.previewLockUntil = 0;
    this.hostBrowserSequence = 0;
    this.hostBrowser = { requestId: 0, state: 'standby', host: '', title: '', error: '', updatedAt: '' };
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

  noteRequestStart(context = {}) {
    // A new request owns the live view. Do not let a previous read-only
    // preview reappear after this request completes.
    this.clearBrowserPreview();
    this.previewLockUntil = 0;
    this.requestActive = true;
    this.phase = 'thinking';
    this.route = clean(context.route, 40);
    this.agent = clean(context.agent, 60);
    this.model = clean(context.model, 120);
    this.requestedModel = clean(context.requestedModel, 120);
    this.modelFallback = clean(context.modelFallback, 180);
    this.startedAt = new Date().toISOString();
    this.updatedAt = this.startedAt;
    this.frame = null;
    this.fileFrameMtime = 0;
  }

  noteRequestEnd(success = true) {
    // A late OpenJarvis websocket event can arrive after the isolated
    // Camoufox preview has been captured. Keep that stale control event from
    // replacing the preview that belongs to the most recent browser request.
    if (this.preview && Date.now() < this.previewUntil) {
      this.requestActive = false;
      this.controlActive = false;
      this.visibleUntil = 0;
      this.tool = '';
      this.phase = 'browser-preview';
      this.updatedAt = new Date().toISOString();
      return;
    }
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

  noteBrowserPreview(frame, { url = '', title = '', visibleMs = PREVIEW_VISIBLE_MS } = {}) {
    if (!frame?.bytes || !frame?.mime || frame.bytes.length > FRAME_LIMIT_BYTES) return false;
    // A public preview is the terminal result of the local browser-open lane.
    // Clear any lingering control state before exposing it so a late websocket
    // tool event cannot keep an empty agent frame in front of the new preview.
    this.requestActive = false;
    this.controlActive = false;
    this.visibleUntil = 0;
    this.tool = '';
    this.preview = frame;
    this.previewUrl = clean(url, 1000);
    this.previewTitle = clean(title, 180);
    this.previewVersion += 1;
    this.previewUntil = Date.now() + Math.max(5_000, Number(visibleMs) || PREVIEW_VISIBLE_MS);
    this.previewLockUntil = this.previewUntil;
    this.startedAt = new Date().toISOString();
    this.phase = 'browser-preview';
    this.updatedAt = new Date().toISOString();
    return true;
  }

  clearBrowserPreview() {
    this.preview = null;
    this.previewUntil = 0;
    this.previewLockUntil = 0;
    this.previewUrl = '';
    this.previewTitle = '';
  }

  noteHostBrowserOpening(url) {
    let host = '';
    try { host = new URL(String(url)).hostname; } catch {}
    const requestId = ++this.hostBrowserSequence;
    this.hostBrowser = { requestId, state: 'starting', host: clean(host, 180), title: '', error: '', updatedAt: new Date().toISOString() };
    return requestId;
  }

  noteHostBrowserOpened(requestId, opened = {}) {
    if (!requestId || requestId !== this.hostBrowser.requestId || this.hostBrowser.state !== 'starting') return false;
    let host = this.hostBrowser.host;
    try { host = new URL(String(opened.url || '')).hostname || host; } catch {}
    this.hostBrowser = { requestId, state: 'open', host: clean(host, 180), title: clean(opened.pageTitle, 180), error: '', updatedAt: new Date().toISOString() };
    return true;
  }

  noteHostBrowserFailed(requestId, error) {
    if (!requestId || requestId !== this.hostBrowser.requestId || this.hostBrowser.state !== 'starting') return false;
    this.hostBrowser = { ...this.hostBrowser, state: 'error', error: clean(error, 220), updatedAt: new Date().toISOString() };
    return true;
  }

  noteModelResolved(model, fallback = '') {
    this.model = clean(model, 120);
    this.modelFallback = clean(fallback, 180);
    this.updatedAt = new Date().toISOString();
  }

  noteLocalControl(tool, context = {}) {
    this.previewLockUntil = 0;
    this.requestActive = true;
    this.controlActive = true;
    this.tool = clean(tool, 100);
    // A new browser navigation must not leave the previous public preview
    // visible while its replacement is still being captured.  Keeping the
    // stale frame here makes the UI and smoke checks report the old page as
    // the result of the new request, especially when a preview auto-refresh
    // timer is still settling.
    if (/browser_navigate/i.test(this.tool)) this.clearBrowserPreview();
    this.route = clean(context.route, 40);
    this.agent = clean(context.agent, 60);
    this.model = clean(context.model, 120);
    this.requestedModel = clean(context.requestedModel, 120);
    this.modelFallback = clean(context.modelFallback, 180);
    this.phase = 'controlling';
    this.startedAt = new Date().toISOString();
    this.updatedAt = this.startedAt;
  }

  applyEvent(payload = {}) {
    // The browser preview is the terminal, read-only result of an explicit
    // website-open request. Ignore late bridge events until a new local
    // request explicitly takes ownership of the live view.
    if (this.preview && Date.now() < this.previewLockUntil && !this.requestActive && !this.controlActive) return;
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

  refreshFrameFile() {
    if (!this.frameFile || !this.controlActive) return;
    try {
      const stat = fs.statSync(this.frameFile);
      const started = Date.parse(this.startedAt) || 0;
      if (!stat.isFile() || !stat.size || stat.size > FRAME_LIMIT_BYTES || stat.mtimeMs + 1000 < started || stat.mtimeMs <= this.fileFrameMtime) return;
      const bytes = fs.readFileSync(this.frameFile);
      const mime = frameMime(bytes);
      if (!mime) return;
      this.frame = { bytes, mime };
      this.fileFrameMtime = stat.mtimeMs;
      this.frameVersion += 1;
      this.phase = 'live-frame';
    } catch {}
  }

  status(now = Date.now()) {
    this.refreshFrameFile();
    if (this.preview && now >= this.previewUntil) this.clearBrowserPreview();
    const controlVisible = this.controlActive && (this.requestActive || now < this.visibleUntil);
    const previewVisible = Boolean(this.preview && now < this.previewUntil && !this.requestActive && !controlVisible);
    const visible = controlVisible || previewVisible;
    const current = controlVisible ? this.frame : previewVisible ? this.preview : null;
    return {
      connected: this.connected,
      visible,
      active: this.requestActive,
      phase: this.phase,
      tool: visible ? this.tool : '',
      route: this.route,
      agent: this.agent,
      model: this.model,
      requestedModel: this.requestedModel,
      modelFallback: this.modelFallback,
      startedAt: visible ? this.startedAt : '',
      updatedAt: this.updatedAt,
      frameAvailable: Boolean(visible && current),
      frameVersion: controlVisible && this.frame ? this.frameVersion : previewVisible && this.preview ? this.previewVersion : 0,
      viewKind: controlVisible ? 'agent-control' : previewVisible ? 'browser-preview' : 'standby',
      previewUrl: previewVisible ? this.previewUrl : '',
      previewTitle: previewVisible ? this.previewTitle : '',
      hostBrowser: { ...this.hostBrowser }
    };
  }

  currentFrame() {
    const status = this.status();
    if (!status.visible) return null;
    return status.viewKind === 'browser-preview' ? this.preview : this.frame;
  }

  async stop() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < this.WebSocketClass.CLOSING) socket.close();
  }
}
