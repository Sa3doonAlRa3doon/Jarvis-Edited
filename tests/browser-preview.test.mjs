import assert from 'node:assert/strict';
import test from 'node:test';
import { browserPreviewDefaults, capturePublicBrowserPreview } from '../lib/browser-preview.mjs';

test('browser preview stays bounded and is pinned to Camoufox', () => {
  assert.equal(browserPreviewDefaults.engine, 'camoufox');
  assert.equal(browserPreviewDefaults.maxFrameBytes, 6 * 1024 * 1024);
  assert.equal(browserPreviewDefaults.timeoutMs, 12_000);
  assert.equal(browserPreviewDefaults.launchTimeoutMs, 12_000);
  assert.equal(browserPreviewDefaults.headless, true);
});

test('fails a stuck Camoufox preview startup on deadline and closes a late browser', async () => {
  let resolveLaunch;
  let closed = 0;
  const pending = capturePublicBrowserPreview('https://example.com/', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    launcher: () => new Promise((resolve) => { resolveLaunch = resolve; }),
    launchTimeoutMs: 100,
    waitMs: 0
  });
  await assert.rejects(pending, /preview startup timed out/i);
  resolveLaunch({ async close() { closed += 1; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, 1);
});

test('browser preview passes the selected headless mode to Camoufox', async () => {
  const calls = [];
  let contextClosed = 0;
  let browserClosed = 0;
  const page = {
    async goto() {},
    async waitForTimeout() {},
    async screenshot() { return Buffer.from('89504e470d0a1a0a', 'hex'); },
    url() { return 'https://example.com/'; },
    async title() { return 'Example Domain'; }
  };
  const launcher = async (options) => {
    calls.push(options);
    return {
      async newContext() {
        return {
          async route() {},
          async newPage() { return page; },
          async close() { contextClosed += 1; }
        };
      },
      async close() { browserClosed += 1; }
    };
  };
  const preview = await capturePublicBrowserPreview('https://example.com/', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    launcher,
    headless: true,
    waitMs: 0
  });
  assert.equal(calls[0].headless, true);
  assert.equal(calls[0].windowsHide, true);
  assert.equal(preview.engine, 'camoufox');
  assert.equal(preview.title, 'Example Domain');
  assert.equal(contextClosed, 1);
  assert.equal(browserClosed, 1);
});
