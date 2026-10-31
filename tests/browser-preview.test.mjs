import assert from 'node:assert/strict';
import test from 'node:test';
import { browserPreviewDefaults, capturePublicBrowserPreview } from '../lib/browser-preview.mjs';

test('browser preview stays bounded and is pinned to Camoufox', () => {
  assert.equal(browserPreviewDefaults.engine, 'camoufox');
  assert.equal(browserPreviewDefaults.maxFrameBytes, 6 * 1024 * 1024);
  assert.equal(browserPreviewDefaults.timeoutMs, 12_000);
});

test('browser preview passes the selected headless mode to Camoufox', async () => {
  const calls = [];
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
          async newPage() { return page; }
        };
      },
      async close() {}
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
});
