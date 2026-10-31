import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { OpenJarvisLiveBridge, decodeScreenshotFrame, isControlTool, screenshotFromEvent } from '../lib/openjarvis-live.mjs';

const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('classifies browser and host mutation tools as live controls', () => {
  assert.equal(isControlTool('browser_navigate'), true);
  assert.equal(isControlTool('jarvis_browser_navigate'), true);
  assert.equal(isControlTool('browser_screenshot'), true);
  assert.equal(isControlTool('shell_exec'), true);
  assert.equal(isControlTool('file_write'), true);
  assert.equal(isControlTool('web_search'), false);
  assert.equal(isControlTool('think'), false);
});

test('accepts bounded real image frames and ignores random base64', () => {
  const frame = decodeScreenshotFrame(tinyPng);
  assert.equal(frame.mime, 'image/png');
  assert.ok(frame.bytes.length > 20);
  assert.equal(decodeScreenshotFrame(Buffer.from('not an image').toString('base64')), null);
});

test('extracts a screenshot only from nested event metadata', () => {
  const frame = screenshotFromEvent({ result: { metadata: { screenshot_base64: tinyPng } } });
  assert.equal(frame.mime, 'image/png');
  assert.equal(screenshotFromEvent({ metadata: { unrelated: tinyPng } }), null);
});

test('shows frames only during an active controlling tool event', () => {
  const bridge = new OpenJarvisLiveBridge({ baseUrl: 'http://127.0.0.1:8000' });
  bridge.noteRequestStart({ route: 'CODEACT', agent: 'CODEX', model: 'qwen2.5-coder:7b', requestedModel: 'qwen2.5-coder:7b' });
  assert.equal(bridge.status().route, 'CODEACT');
  assert.equal(bridge.status().agent, 'CODEX');
  assert.equal(bridge.status().model, 'qwen2.5-coder:7b');
  assert.equal(bridge.status().visible, false);
  bridge.applyEvent({ type: 'tool_call_start', data: { tool: 'browser_navigate' } });
  assert.equal(bridge.status().visible, true);
  assert.equal(bridge.status().frameAvailable, false);
  bridge.applyEvent({ type: 'tool_call_end', data: { tool: 'browser_screenshot', success: true, metadata: { screenshot_base64: tinyPng } } });
  assert.equal(bridge.status().frameAvailable, true);
  assert.equal(bridge.currentFrame().mime, 'image/png');
});

test('updates the live workspace with the model that actually answered', () => {
  const bridge = new OpenJarvisLiveBridge({ baseUrl: 'http://127.0.0.1:8000' });
  bridge.noteRequestStart({ route: 'GENERAL', agent: 'JARVIS', model: 'missing-specialist', requestedModel: 'missing-specialist' });
  bridge.noteModelResolved('qwen2.5:1.5b', 'The routed model failed at runtime; JARVIS used qwen2.5:1.5b instead.');
  const status = bridge.status();
  assert.equal(status.model, 'qwen2.5:1.5b');
  assert.match(status.modelFallback, /failed at runtime/);
});

test('loads the protected automatic browser frame only during control', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-live-frame-'));
  const frameFile = path.join(directory, 'jarvis-live.png');
  const bridge = new OpenJarvisLiveBridge({ baseUrl: 'http://127.0.0.1:8000', frameFile });
  try {
    fs.writeFileSync(frameFile, Buffer.from(tinyPng, 'base64'));
    assert.equal(bridge.status().frameAvailable, false);
    bridge.noteRequestStart();
    bridge.applyEvent({ type: 'tool_call_start', data: { tool: 'jarvis_browser_navigate' } });
    fs.writeFileSync(frameFile, Buffer.from(tinyPng, 'base64'));
    const status = bridge.status();
    assert.equal(status.visible, true);
    assert.equal(status.frameAvailable, true);
    assert.equal(bridge.currentFrame().mime, 'image/png');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('shows an explicit public browser preview briefly without treating it as control', () => {
  const bridge = new OpenJarvisLiveBridge({ baseUrl: 'http://127.0.0.1:8000' });
  bridge.noteBrowserPreview({ bytes: Buffer.from(tinyPng, 'base64'), mime: 'image/png' }, { url: 'https://example.com/', title: 'Example Domain', visibleMs: 5_000 });
  const status = bridge.status();
  assert.equal(status.visible, true);
  assert.equal(status.viewKind, 'browser-preview');
  assert.equal(status.previewUrl, 'https://example.com/');
  assert.equal(status.previewTitle, 'Example Domain');
  assert.equal(status.frameAvailable, true);
  assert.equal(bridge.currentFrame().mime, 'image/png');
  assert.equal(status.tool, '');
});

test('clears a stale public preview when a new browser navigation starts', () => {
  const bridge = new OpenJarvisLiveBridge({ baseUrl: 'http://127.0.0.1:8000' });
  bridge.noteBrowserPreview({ bytes: Buffer.from(tinyPng, 'base64'), mime: 'image/png' }, { url: 'https://old.example/', title: 'Old page', visibleMs: 60_000 });
  assert.equal(bridge.status().viewKind, 'browser-preview');
  bridge.noteLocalControl('browser_navigate');
  const status = bridge.status();
  assert.equal(status.viewKind, 'agent-control');
  assert.equal(status.frameAvailable, false);
  assert.equal(status.previewUrl, '');
});

test('public preview completion wins over a lingering browser-control state', () => {
  const bridge = new OpenJarvisLiveBridge({ baseUrl: 'http://127.0.0.1:8000' });
  bridge.noteLocalControl('browser_navigate');
  bridge.noteBrowserPreview({ bytes: Buffer.from(tinyPng, 'base64'), mime: 'image/png' }, { url: 'https://example.com/', title: 'Example Domain', visibleMs: 5_000 });
  const status = bridge.status();
  assert.equal(status.viewKind, 'browser-preview');
  assert.equal(status.active, false);
  assert.equal(status.tool, '');
  assert.equal(status.frameAvailable, true);
});

test('reports dedicated browser startup and completion without accepting stale opens', () => {
  const bridge = new OpenJarvisLiveBridge({ baseUrl: 'http://127.0.0.1:8000' });
  const first = bridge.noteHostBrowserOpening('https://example.com/');
  assert.equal(bridge.status().hostBrowser.state, 'starting');
  assert.equal(bridge.status().hostBrowser.host, 'example.com');
  const second = bridge.noteHostBrowserOpening('https://example.org/');
  assert.equal(bridge.noteHostBrowserOpened(first, { url: 'https://example.com/', pageTitle: 'Stale' }), false);
  assert.equal(bridge.noteHostBrowserOpened(second, { url: 'https://example.org/', pageTitle: 'Example Org' }), true);
  assert.deepEqual(bridge.status().hostBrowser, {
    requestId: second, state: 'open', host: 'example.org', title: 'Example Org', error: '', updatedAt: bridge.status().hostBrowser.updatedAt
  });
  assert.equal(bridge.noteHostBrowserFailed(second, 'late failure'), false);
});
