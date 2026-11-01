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

test('clean view hides common ad containers and blocks known ad networks only in the preview', async () => {
  let routeHandler;
  let style = '';
  const page = {
    async goto() {},
    async addStyleTag({ content }) { style = content; },
    async waitForTimeout() {},
    async screenshot() { return Buffer.from('89504e470d0a1a0a', 'hex'); },
    url() { return 'https://example.com/'; },
    async title() { return 'Example Domain'; }
  };
  const launcher = async () => ({
    async newContext() {
      return {
        async route(_pattern, handler) { routeHandler = handler; },
        async newPage() { return page; },
        async close() {}
      };
    },
    async close() {}
  });
  const preview = await capturePublicBrowserPreview('https://example.com/', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }], launcher, waitMs: 0
  });
  assert.equal(preview.cleanView, true);
  assert.equal(preview.blockedAdRequests, 0);
  assert.equal(preview.cosmeticFilterApplied, true);
  assert.match(style, /data-ad-slot/);
  assert.match(style, /display:none!important/);

  const blocked = { aborted: false, continued: false, request() { return { url: () => 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js' }; }, async abort() { this.aborted = true; }, async continue() { this.continued = true; } };
  await routeHandler(blocked);
  assert.equal(blocked.aborted, true);
  assert.equal(blocked.continued, false);

  const site = { continued: false, request() { return { url: () => 'https://cdn.example.com/app.js' }; }, async abort() {}, async continue() { this.continued = true; } };
  await routeHandler(site);
  assert.equal(site.continued, true);
});

test('clean view can be turned off without injecting styles or blocking ad hosts', async () => {
  let routeHandler;
  let styled = false;
  const page = {
    async goto() {},
    async addStyleTag() { styled = true; },
    async waitForTimeout() {},
    async screenshot() { return Buffer.from('89504e470d0a1a0a', 'hex'); },
    url() { return 'https://example.com/'; },
    async title() { return 'Example Domain'; }
  };
  const launcher = async () => ({
    async newContext() { return { async route(_pattern, handler) { routeHandler = handler; }, async newPage() { return page; }, async close() {} }; },
    async close() {}
  });
  const preview = await capturePublicBrowserPreview('https://example.com/', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }], launcher, waitMs: 0, cleanView: false
  });
  assert.equal(preview.cleanView, false);
  assert.equal(styled, false);
  const ad = { continued: false, request() { return { url: () => 'https://ads.example.com/ad.js' }; }, async abort() {}, async continue() { this.continued = true; } };
  await routeHandler(ad);
  assert.equal(ad.continued, true);
});
