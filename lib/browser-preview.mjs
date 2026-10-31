import dns from 'node:dns/promises';
import { camoufoxHeadless, launchCamoufox } from './camoufox-browser.mjs';
import { validatePublicUrl } from './web-tools.mjs';

const MAX_FRAME_BYTES = 6 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 12_000;

function clean(value, limit = 300) {
  return String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

/**
 * Capture one public page in a fresh, cookie-free browser context (Camoufox).
 *
 * This is deliberately a preview, not a control channel: no persistent
 * profile, storage state, clicks, typing, uploads, or form submissions are
 * enabled. Every HTTP(S) sub-request is revalidated to prevent DNS rebinding
 * from turning a public URL into a private-network request.
 */
export async function capturePublicBrowserPreview(targetUrl, {
  lookup = dns.lookup,
  launcher = launchCamoufox,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  waitMs = 350,
  headless = camoufoxHeadless(),
  windowsHide = true,
  viewport = { width: 1440, height: 900 }
} = {}) {
  const safe = await validatePublicUrl(targetUrl, { lookup });
  // A Pi service normally has no DISPLAY/WAYLAND session. Let Camoufox choose
  // headless mode there, while Windows desktop launches remain hidden but
  // visible-capable for the dedicated own-screen/browser workflow.
  const browser = await launcher({ headless, windowsHide, persistent: false });
  try {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', storageState: undefined });
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      let parsed;
      try { parsed = new URL(requestUrl); } catch { await route.abort('blockedbyclient'); return; }
      if (!['http:', 'https:'].includes(parsed.protocol)) { await route.continue(); return; }
      try {
        await validatePublicUrl(requestUrl, { lookup });
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
    });
    const page = await context.newPage();
    await page.goto(safe.href, { waitUntil: 'domcontentloaded', timeout: Math.max(2_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS) });
    if (waitMs > 0) await page.waitForTimeout(Math.min(1_500, Math.max(0, Number(waitMs) || 0)));
    const bytes = await page.screenshot({ type: 'png', animations: 'disabled' });
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_FRAME_BYTES) throw new Error('The browser preview was empty or too large.');
    return {
      bytes,
      mime: 'image/png',
      url: clean(page.url(), 1000),
      title: clean(await page.title().catch(() => ''), 180),
      capturedAt: new Date().toISOString(),
      width: viewport.width,
      height: viewport.height,
      isolated: true,
      readOnly: true,
      engine: 'camoufox'
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

export const browserPreviewDefaults = Object.freeze({ timeoutMs: DEFAULT_TIMEOUT_MS, maxFrameBytes: MAX_FRAME_BYTES, engine: 'camoufox' });
