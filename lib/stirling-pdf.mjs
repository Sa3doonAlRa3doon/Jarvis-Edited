import fs from 'node:fs/promises';
import path from 'node:path';

const OPERATIONS = Object.freeze({
  compress: { label: 'Compress PDF', endpoint: '/api/v1/misc/compress-pdf', method: 'POST', output: 'pdf' },
  ocr: { label: 'OCR PDF', endpoint: '/api/v1/misc/ocr-pdf', method: 'POST', output: 'pdf' },
  repair: { label: 'Repair PDF', endpoint: '/api/v1/misc/repair', method: 'POST', output: 'pdf' },
  'pdf-to-word': { label: 'PDF to Word', endpoint: '/api/v1/convert/pdf/word', method: 'POST', output: 'docx' }
});
const DEFAULT_BASE_URL = 'https://api.stirling.com';
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const SECRET_PATH = /(?:^|[._-])(?:env|credentials?|tokens?|secrets?|private|keys?)(?:$|[._-])/i;
const SECRET_SEGMENT = /(?:^|[\\/])(?:\.git|node_modules|\.ssh|\.openjarvis|credentials?|tokens?|secrets?)(?:[\\/]|$)/i;

function clean(value, limit = 500) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, limit);
}

function normalizeBaseUrl(value) {
  const raw = clean(value || DEFAULT_BASE_URL, 300).replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('STIRLING_URL must be a valid http or https URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('STIRLING_URL must use a credential-free http or https URL.');
  return parsed.toString().replace(/\/+$/, '');
}

export function normalizeStirlingOperation(value) {
  const raw = clean(value, 80).toLowerCase().replace(/[ _]+/g, '-');
  if (raw === 'compress-pdf' || raw === 'shrink' || raw === 'reduce-size') return 'compress';
  if (raw === 'ocr-pdf' || raw === 'text-recognition' || raw === 'recognize-text') return 'ocr';
  if (raw === 'repair-pdf' || raw === 'fix-pdf' || raw === 'recover' || raw === 'fix') return 'repair';
  if (raw === 'pdf-to-docx' || raw === 'pdf-to-word' || raw === 'convert-to-word' || raw === 'word') return 'pdf-to-word';
  return Object.hasOwn(OPERATIONS, raw) ? raw : '';
}

export function stirlingCatalog() {
  return Object.entries(OPERATIONS).map(([operation, item]) => ({ operation, label: item.label, endpoint: item.endpoint, output: item.output }));
}

function pathRoots(value) {
  const roots = Array.isArray(value) ? value : String(value || '').split(path.delimiter);
  return roots.map((item) => clean(item, 500)).filter(Boolean).map((item) => path.resolve(item));
}

function isInside(candidate, root) {
  const left = path.resolve(candidate);
  const right = path.resolve(root);
  const normalizedLeft = process.platform === 'win32' ? left.toLowerCase() : left;
  const normalizedRight = process.platform === 'win32' ? right.toLowerCase() : right;
  return normalizedLeft === normalizedRight || normalizedLeft.startsWith(`${normalizedRight}${path.sep}`);
}

export function safeStirlingInputPath(inputPath, roots = []) {
  const value = clean(inputPath, 1200);
  if (!value || value.includes('\0')) throw new Error('Choose one local PDF file.');
  const allowed = pathRoots(roots);
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(allowed[0] || process.cwd(), value);
  const normalized = resolved.toLowerCase();
  if (!normalized.endsWith('.pdf')) throw new Error('Stirling PDF tools accept PDF files only.');
  const base = path.basename(resolved);
  if (SECRET_PATH.test(base) || SECRET_SEGMENT.test(resolved)) throw new Error('Secret, credential, token, and private paths are not allowed.');
  if (!allowed.length || !allowed.some((root) => isInside(resolved, root))) throw new Error('The PDF must be inside a configured private Stirling input root.');
  return resolved;
}

function extractPdfPath(text) {
  const source = String(text || '');
  const quoted = source.match(/["']([^"']+\.pdf)["']/i);
  if (quoted) return quoted[1];
  const windows = source.match(/(?:[A-Za-z]:\\|\\\\)[^<>|\r\n]*?\.pdf/i);
  if (windows) return windows[0].trim().replace(/[),.;]+$/, '');
  const posix = source.match(/(?:^|\s)(\/[^<>|\r\n]*?\.pdf)(?=\s|$|[),.;])/i);
  if (posix) return posix[1].trim();
  const relative = source.match(/(?:^|\s)([^\s"'<>|]+\.pdf)(?=\s|$|[),.;])/i);
  return relative ? relative[1].trim() : '';
}

export function parseStirlingPrompt(prompt) {
  const text = clean(prompt, 6000);
  const hasPdf = /(?:\.pdf\b|\bpdf\b)/i.test(text);
  const operation = hasPdf && /\b(?:compress|shrink|reduce|optimize)\b/i.test(text)
    ? 'compress'
    : hasPdf && /\b(?:ocr|recognize|extract text|make searchable)\b/i.test(text)
      ? 'ocr'
      : hasPdf && /\b(?:repair|fix|recover|restore)\b/i.test(text)
        ? 'repair'
        : hasPdf && ( /\b(?:convert|turn|export)\b/i.test(text) && /\b(?:word|docx)\b/i.test(text) || /\bpdf\s*(?:to|as)\s*(?:word|docx)\b/i.test(text) )
          ? 'pdf-to-word'
          : '';
  if (!operation) return null;
  return { operation, inputPath: extractPdfPath(text), prompt: text };
}

function safeOutputName(inputName, operation, outputType) {
  const stem = path.basename(inputName, path.extname(inputName)).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  return `${stem}.stirling-${operation}.${outputType}`;
}

function contentTypeFor(type) {
  return type === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
}

function boundedProviderStatus(status) {
  const value = Number(status);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function redactProviderError(status) {
  if (status === 401) return 'Stirling rejected the API key (HTTP 401). Check STIRLING_API_KEY on the JARVIS host.';
  if (status === 403) return 'Stirling denied this operation (HTTP 403). Check the API key scope and account permissions on the JARVIS host.';
  if (status === 402) return 'Stirling reported that the account has no available processing credits.';
  if (status === 413) return 'Stirling rejected the PDF because it is too large.';
  if (status >= 400 && status < 500) return `Stirling rejected the request (HTTP ${status}). Check the PDF and operation settings.`;
  if (status >= 500) return `Stirling is unavailable (HTTP ${status}). Try again later.`;
  return `Stirling returned HTTP ${status}.`;
}

export class StirlingPdfClient {
  constructor({
    baseUrl = process.env.STIRLING_URL || process.env.STIRLING_BASE_URL || DEFAULT_BASE_URL,
    apiKey = process.env.STIRLING_API_KEY || '',
    inputRoots = process.env.STIRLING_INPUT_ROOTS || process.env.JARVIS_ARTIFACT_DIR || path.join(process.cwd(), 'data', 'artifacts'),
    outputDirectory = process.env.JARVIS_ARTIFACT_DIR || path.join(process.cwd(), 'data', 'artifacts'),
    timeoutMs = process.env.STIRLING_TIMEOUT_MS || 60_000,
    maxBytes = process.env.STIRLING_MAX_INPUT_BYTES || DEFAULT_MAX_BYTES,
    fetchImpl = globalThis.fetch,
    reader = fs.readFile,
    stat = fs.stat
  } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = clean(apiKey, 600);
    this.inputRoots = pathRoots(inputRoots);
    this.outputDirectory = path.resolve(outputDirectory);
    this.timeoutMs = Math.max(3_000, Math.min(300_000, Number(timeoutMs) || 60_000));
    this.maxBytes = Math.max(1_024, Math.min(100 * 1024 * 1024, Number(maxBytes) || DEFAULT_MAX_BYTES));
    this.fetchImpl = fetchImpl;
    this.reader = reader;
    this.stat = stat;
    this.lastProcess = null;
  }

  get configured() {
    try { return new URL(this.baseUrl).hostname !== 'api.stirling.com' || Boolean(this.apiKey); } catch { return false; }
  }

  snapshot() {
    const parsed = new URL(this.baseUrl);
    return {
      configured: this.configured,
      online: false,
      baseHost: parsed.host,
      cloud: parsed.hostname === 'api.stirling.com',
      apiKeyConfigured: Boolean(this.apiKey),
      processing: this.lastProcess ? { ...this.lastProcess } : { state: this.configured ? 'unverified' : 'not-configured', checkedAt: null, error: null, providerStatus: null },
      operations: stirlingCatalog()
    };
  }

  async status() {
    const url = `${this.baseUrl}/api/v1/info/status`;
    try {
      const response = await this.fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) return { ...this.snapshot(), error: redactProviderError(response.status), providerStatus: boundedProviderStatus(response.status), checkedAt: new Date().toISOString() };
      const payload = await response.json().catch(() => ({}));
      return { ...this.snapshot(), online: true, service: payload?.status || payload?.message || 'ready', checkedAt: new Date().toISOString() };
    } catch (error) {
      return { ...this.snapshot(), error: clean(error?.name === 'TimeoutError' ? 'Stirling health check timed out.' : error?.message || 'Stirling health check failed.', 220), checkedAt: new Date().toISOString() };
    }
  }

  async processFile(operationValue, inputPath, options = {}) {
    const operation = normalizeStirlingOperation(operationValue);
    const item = OPERATIONS[operation];
    if (!item) throw new Error('Choose compress, OCR, repair, or PDF to Word.');
    const resolved = safeStirlingInputPath(inputPath, options.inputRoots || this.inputRoots);
    const info = await this.stat(resolved);
    if (!info.isFile()) throw new Error('The selected Stirling input is not a regular file.');
    if (info.size > this.maxBytes) throw new Error(`The PDF is larger than the ${Math.round(this.maxBytes / 1024 / 1024)} MB Stirling limit.`);
    if (new URL(this.baseUrl).hostname === 'api.stirling.com' && !this.apiKey) throw new Error('STIRLING_API_KEY is required for Stirling Cloud. Keep it only in the private JARVIS .env.');
    const bytes = await this.reader(resolved);
    const form = new FormData();
    form.append('fileInput', new Blob([bytes], { type: 'application/pdf' }), path.basename(resolved));
    if (operation === 'compress') form.append('optimizeLevel', String(Math.max(1, Math.min(5, Number(options.optimizeLevel) || 3))));
    if (operation === 'ocr') {
      const languages = Array.isArray(options.languages) ? options.languages : [options.languages || 'eng'];
      for (const language of languages.map((value) => clean(value, 20).toLowerCase()).filter((value) => /^[a-z]{3}(?:\+[a-z]{3})?$/.test(value)).slice(0, 6)) form.append('languages', language);
      form.append('ocrType', options.ocrType === 'force' ? 'force' : 'skip-text');
      form.append('ocrRenderType', ['hocr', 'sandwich'].includes(options.ocrRenderType) ? options.ocrRenderType : 'hocr');
    }
    if (operation === 'pdf-to-word') form.append('outputFormat', 'docx');
    const headers = { Accept: contentTypeFor(item.output) };
    if (this.apiKey) headers['X-API-KEY'] = this.apiKey;
    this.lastProcess = { state: 'checking', operation, checkedAt: new Date().toISOString(), error: null, providerStatus: null };
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${item.endpoint}`, { method: item.method, headers, body: form, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const message = clean(error?.name === 'TimeoutError' ? 'Stirling processing timed out.' : error?.message || 'Stirling processing failed.', 240);
      this.lastProcess = { state: 'error', operation, checkedAt: new Date().toISOString(), error: message, providerStatus: null };
      throw new Error(message);
    }
    if (!response.ok) {
      const message = redactProviderError(response.status);
      this.lastProcess = { state: response.status === 401 || response.status === 403 ? 'rejected' : 'error', operation, checkedAt: new Date().toISOString(), error: message, providerStatus: boundedProviderStatus(response.status) };
      throw new Error(message);
    }
    const output = Buffer.from(await response.arrayBuffer());
    if (!output.length) {
      const message = 'Stirling returned an empty processed file.';
      this.lastProcess = { state: 'error', operation, checkedAt: new Date().toISOString(), error: message, providerStatus: null };
      throw new Error(message);
    }
    this.lastProcess = { state: 'verified', operation, checkedAt: new Date().toISOString(), error: null, providerStatus: 200 };
    return { operation, inputName: path.basename(resolved), fileName: safeOutputName(resolved, operation, item.output), contentType: response.headers?.get?.('content-type')?.split(';')[0] || contentTypeFor(item.output), buffer: output };
  }
}

export { DEFAULT_BASE_URL, OPERATIONS };
