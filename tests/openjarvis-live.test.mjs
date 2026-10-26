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
  bridge.noteRequestStart();
  assert.equal(bridge.status().visible, false);
  bridge.applyEvent({ type: 'tool_call_start', data: { tool: 'browser_navigate' } });
  assert.equal(bridge.status().visible, true);
  assert.equal(bridge.status().frameAvailable, false);
  bridge.applyEvent({ type: 'tool_call_end', data: { tool: 'browser_screenshot', success: true, metadata: { screenshot_base64: tinyPng } } });
  assert.equal(bridge.status().frameAvailable, true);
  assert.equal(bridge.currentFrame().mime, 'image/png');
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
