import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactStudio } from '../lib/artifact-studio.mjs';
import { buildSyntheticPdf, documentSignature } from '../lib/stirling-fixture.mjs';
import { StirlingPdfClient, normalizeStirlingOperation, parseStirlingPrompt, safeStirlingInputPath, stirlingCatalog } from '../lib/stirling-pdf.mjs';

function response({ status = 200, json = {}, bytes = Buffer.from('%PDF-processed'), contentType = 'application/pdf' } = {}) {
  return {
    ok: status >= 200 && status < 300, status,
    headers: new Headers({ 'content-type': contentType }),
    json: async () => json,
    arrayBuffer: async () => bytes
  };
}

test('normalizes the bounded Stirling PDF operation catalog and prompts', () => {
  assert.equal(normalizeStirlingOperation('compress-pdf'), 'compress');
  assert.equal(normalizeStirlingOperation('OCR PDF'), 'ocr');
  assert.equal(normalizeStirlingOperation('fix pdf'), 'repair');
  assert.equal(normalizeStirlingOperation('pdf to docx'), 'pdf-to-word');
  assert.equal(normalizeStirlingOperation('shell command'), '');
  assert.deepEqual(parseStirlingPrompt('Please OCR "C:\\Jarvis\\artifacts\\scan.pdf"'), { operation: 'ocr', inputPath: 'C:\\Jarvis\\artifacts\\scan.pdf', prompt: 'Please OCR "C:\\Jarvis\\artifacts\\scan.pdf"' });
  assert.equal(parseStirlingPrompt('compress report.pdf').inputPath, 'report.pdf');
  assert.deepEqual(parseStirlingPrompt('repair this broken report.pdf').operation, 'repair');
  assert.deepEqual(stirlingCatalog().map((item) => item.operation), ['compress', 'ocr', 'repair', 'pdf-to-word']);
});

test('builds a bounded synthetic PDF fixture without reading user files', () => {
  const fixture = buildSyntheticPdf();
  assert.equal(documentSignature(fixture), 'pdf');
  assert.ok(fixture.length < 2_000);
});

test('accepts only PDF files inside configured roots and rejects sensitive paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-stirling-root-'));
  try {
    const pdf = path.join(root, 'report.pdf');
    const secret = path.join(root, 'credentials.pdf');
    await fs.writeFile(pdf, '%PDF-test'); await fs.writeFile(secret, '%PDF-secret');
    assert.equal(safeStirlingInputPath(pdf, [root]), pdf);
    assert.equal(safeStirlingInputPath('report.pdf', [root]), pdf);
    assert.throws(() => safeStirlingInputPath(path.join(root, '..', 'outside.pdf'), [root]), /inside a configured/);
    assert.throws(() => safeStirlingInputPath(secret, [root]), /Secret/);
    assert.throws(() => safeStirlingInputPath(path.join(root, 'report.docx'), [root]), /PDF files only/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('checks Stirling health without exposing the key and sends X-API-KEY only to processing', async () => {
  const calls = [];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-stirling-client-'));
  try {
    const pdf = path.join(root, 'report.pdf'); await fs.writeFile(pdf, '%PDF-test');
    const client = new StirlingPdfClient({ baseUrl: 'https://api.stirling.com', apiKey: 'unit-test-secret', inputRoots: [root], fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return url.endsWith('/info/status') ? response({ json: { status: 'ok' } }) : response({ bytes: Buffer.from('%PDF-output') });
    } });
    const health = await client.status();
    assert.equal(health.online, true); assert.equal(health.apiKeyConfigured, true); assert.equal(health.processing.state, 'unverified'); assert.equal(health.apiKey, undefined); assert.equal(JSON.stringify(health).includes('unit-test-secret'), false);
    const result = await client.processFile('compress', pdf, { optimizeLevel: 4 });
    assert.equal(result.fileName, 'report.stirling-compress.pdf'); assert.equal(result.buffer.toString(), '%PDF-output'); assert.equal(client.snapshot().processing.state, 'verified'); assert.equal(client.snapshot().processing.providerStatus, 200);
    const processCall = calls.find((item) => item.url.endsWith('/compress-pdf'));
    assert.equal(processCall.options.headers['X-API-KEY'], 'unit-test-secret');
    assert.equal(processCall.options.body instanceof FormData, true);
    const repaired = await client.processFile('repair', pdf);
    assert.equal(repaired.fileName, 'report.stirling-repair.pdf');
    assert.ok(calls.some((item) => item.url.endsWith('/misc/repair')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('reports safe provider errors and blocks cloud processing without a key', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-stirling-error-'));
  try {
    const pdf = path.join(root, 'report.pdf'); await fs.writeFile(pdf, '%PDF-test');
    const unauthorized = new StirlingPdfClient({ baseUrl: 'https://api.stirling.com', apiKey: 'secret', inputRoots: [root], fetchImpl: async () => response({ status: 401 }) });
    await assert.rejects(() => unauthorized.processFile('ocr', pdf), /rejected the API key/); assert.equal(unauthorized.snapshot().processing.state, 'rejected'); assert.equal(unauthorized.snapshot().processing.providerStatus, 401);
    const noKey = new StirlingPdfClient({ baseUrl: 'https://api.stirling.com', inputRoots: [root], fetchImpl: async () => { throw new Error('network should not be called'); } });
    await assert.rejects(() => noKey.processFile('compress', pdf), /STIRLING_API_KEY is required/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('stores a processed PDF as a private downloadable artifact', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-stirling-artifact-'));
  try {
    const studio = new ArtifactStudio(directory);
    const artifact = await studio.storeBinary({ type: 'pdf', fileName: 'report.stirling-compress.pdf', buffer: Buffer.from('%PDF-output'), title: 'Processed report' });
    assert.equal(artifact.type, 'pdf'); assert.equal(artifact.bytes, Buffer.byteLength('%PDF-output')); assert.match(artifact.downloadUrl, new RegExp(artifact.id));
    const resolved = await studio.resolve(artifact.id); assert.ok(resolved); assert.equal((await fs.readFile(resolved.path)).toString(), '%PDF-output');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
