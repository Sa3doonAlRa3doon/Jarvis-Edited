import dotenv from 'dotenv';
import fs from 'node:fs';
import { chromium } from 'playwright';

dotenv.config({ override: true, quiet: true });

const baseUrl = String(process.env.JARVIS_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8788}`).replace(/\/$/, '');
const headless = process.argv.includes('--headless');
const chromeCandidates = [
  process.env.JARVIS_BROWSER_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
const checks = [];
const observations = {};
const pageErrors = [];

function assert(condition, message) { if (!condition) throw new Error(message); }

async function check(name, operation) {
  try {
    const detail = await operation();
    checks.push({ name, ok: true, detail: detail ?? undefined });
  } catch (error) {
    checks.push({ name, ok: false, error: String(error?.message || error).replace(/\s+/g, ' ').slice(0, 300) });
  }
}

const browser = await chromium.launch({
  headless,
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-first-run', '--disable-extensions']
});
try {
  const context = await browser.newContext({ permissions: ['microphone', 'camera'], viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(12_000);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error.message || error).slice(0, 240)));

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await check('Chrome dashboard authentication dialog', async () => {
    const dialog = page.locator('#auth-dialog');
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator('input').fill(String(process.env.DASHBOARD_ACCESS_PIN || ''));
    await dialog.locator('button[type="submit"]').click({ force: true });
    await dialog.waitFor({ state: 'detached' });
    return 'authenticated through the visible Chrome dialog';
  });

  await check('Command screen core DOM', async () => {
    await page.locator('#brain-canvas').waitFor({ state: 'visible' });
    for (const selector of ['#messages', '#prompt', '#send-button', '#voice-button', '#jarvis-search', '#cpu-value', '#ram-value', '#service-list']) await page.locator(selector).waitFor({ state: 'attached' });
    return 'neural field, composer, telemetry, search, and voice controls loaded';
  });

  await check('Dashboard stays single-screen without scroll', async () => {
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth - document.documentElement.clientWidth, height: document.documentElement.scrollHeight - document.documentElement.clientHeight }));
    assert(dimensions.width <= 2 && dimensions.height <= 2, `overflow ${JSON.stringify(dimensions)}`);
    return dimensions;
  });

  await check('Live telemetry reached a non-initializing state', async () => {
    await page.waitForFunction(() => document.querySelector('#system-state')?.textContent?.trim() !== 'INITIALIZING', null, { timeout: 15_000 });
    const state = await page.locator('#system-state').textContent();
    assert(Boolean(state?.trim()), 'system state was empty');
    return state.trim();
  });

  await check('Real Chrome microphone and camera capture', async () => {
    const media = await page.evaluate(async () => {
      const listed = await navigator.mediaDevices.enumerateDevices();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        const tracks = stream.getTracks().map((track) => ({ kind: track.kind, readyState: track.readyState, labeled: Boolean(track.label) }));
        return { audioInputs: listed.filter((item) => item.kind === 'audioinput').length, videoInputs: listed.filter((item) => item.kind === 'videoinput').length, tracks };
      } finally { stream?.getTracks().forEach((track) => track.stop()); }
    });
    assert(media.audioInputs > 0 && media.videoInputs > 0, `missing device ${JSON.stringify(media)}`);
    assert(media.tracks.every((track) => track.readyState === 'live' && track.labeled), `tracks were not live ${JSON.stringify(media)}`);
    observations.media = media;
    return media;
  });

  await check('JARVIS voice listener state', async () => {
    await page.waitForTimeout(1200);
    const voice = await page.evaluate(() => ({ state: document.body.dataset.voiceState || '', label: document.querySelector('#voice-button')?.getAttribute('aria-label') || '', supported: Boolean(navigator.mediaDevices?.getUserMedia) }));
    assert(voice.supported && !['error', 'unsupported'].includes(voice.state), JSON.stringify(voice));
    observations.voice = voice;
    return voice;
  });

  await check('All six neural core modes are interactive', async () => {
    const modes = ['system', 'docker', 'printer', 'agents', 'research', 'memory'];
    assert(await page.locator('button[data-core-mode]').count() === modes.length, 'core mode button count mismatch');
    for (const mode of modes) {
      const button = page.locator(`button[data-core-mode="${mode}"]`);
      await button.evaluate((node) => node.click());
      assert(await button.evaluate((node) => node.classList.contains('active')), `${mode} did not activate`);
    }
    return modes;
  });

  await check('Dashboard search opens and returns results', async () => {
    await page.keyboard.press('Control+k');
    const dialog = page.locator('#jarvis-search');
    await dialog.waitFor({ state: 'visible' });
    await page.locator('#jarvis-search-input').fill('microphone');
    await page.waitForTimeout(120);
    const count = await page.locator('#jarvis-search-results [role="option"]').count();
    assert(count > 0, 'search returned no microphone result');
    await page.locator('#jarvis-search-close').click({ force: true });
    return { resultCount: count };
  });

  await check('Gesture camera link starts and stops in Chrome', async () => {
    const button = page.locator('#gesture-button');
    await page.waitForFunction(() => !document.querySelector('#gesture-button')?.disabled, null, { timeout: 30_000 });
    if (!await button.evaluate((node) => node.classList.contains('active'))) await button.evaluate((node) => node.click());
    await page.waitForFunction(() => document.querySelector('#gesture-button')?.classList.contains('active') && !document.querySelector('#gesture-button')?.disabled, null, { timeout: 30_000 });
    await page.waitForTimeout(5000);
    assert(await button.evaluate((node) => node.classList.contains('active')), 'gesture link did not become active');
    await page.waitForFunction(() => document.querySelector('#gesture-button')?.classList.contains('active') && !document.querySelector('#gesture-button')?.disabled, null, { timeout: 30_000 });
    await button.evaluate((node) => node.click());
    await page.waitForTimeout(250);
    assert(!await button.evaluate((node) => node.classList.contains('active')), 'gesture link did not stop');
    return 'camera gesture stream started and stopped';
  });

  await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
  await check('Settings screen loads in Chrome', async () => {
    await page.locator('#settings-status').waitFor({ state: 'visible' });
    const sections = await page.locator('.settings-section').count();
    const status = (await page.locator('#settings-status').textContent()).trim();
    assert(sections === 7 && status !== 'LOADING', `sections=${sections}, status=${status}`);
    return { sections, status };
  });

  await check('Settings sees the selected browser devices', async () => {
    const cameras = await page.locator('#browser-camera option').count();
    const microphones = await page.locator('#browser-microphone option').count();
    assert(cameras >= 2 && microphones >= 2, `camera options=${cameras}, microphone options=${microphones}`);
    return { cameras: cameras - 1, microphones: microphones - 1 };
  });

  await check('Settings sensor calibration opens real camera and mic', async () => {
    await page.locator('[data-target="sensors"]').click({ force: true });
    await page.locator('#start-sensors').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#sensor-state')?.textContent?.trim() === 'CALIBRATING', null, { timeout: 15_000 });
    const sensor = await page.evaluate(() => ({ state: document.querySelector('#sensor-state')?.textContent?.trim(), videoWidth: document.querySelector('#camera-video')?.videoWidth || 0, mic: document.querySelector('#mic-readout')?.textContent?.trim() || '' }));
    assert(sensor.state === 'CALIBRATING' && sensor.videoWidth > 0, JSON.stringify(sensor));
    await page.locator('#stop-sensors').click({ force: true });
    return sensor;
  });

  await check('Settings Google verification reaches a real result', async () => {
    await page.locator('[data-target="integrations"]').click({ force: true });
    await page.locator('#test-google').click({ force: true });
    await page.waitForFunction(() => !['CHECKING', 'PROBING'].includes(document.querySelector('#google-state')?.textContent?.trim() || ''), null, { timeout: 20_000 });
    const status = (await page.locator('#google-state').textContent()).trim();
    const note = (await page.locator('#google-note').textContent()).trim();
    assert(/(?:LINKED|VERIFIED|OFFLINE)/.test(status) && /OAuth/i.test(note), `${status} / ${note}`);
    observations.googleUi = status;
    return { status, note: note.slice(0, 120) };
  });

  await check('Settings search filters microphone controls', async () => {
    await page.locator('#settings-search').fill('microphone');
    await page.waitForTimeout(150);
    const visible = await page.locator('.setting:not([hidden]), .switch:not([hidden])').count();
    assert(visible > 0, 'settings search hid every microphone control');
    return { visible }; 
  });

  observations.pageErrors = pageErrors;
  const passed = checks.filter((item) => item.ok).length;
  const failed = checks.length - passed;
  console.log(JSON.stringify({ chrome: executablePath || 'playwright-default', baseUrl, checks, observations, summary: { passed, failed, pageErrors: pageErrors.length } }, null, 2));
  process.exitCode = failed || pageErrors.length ? 1 : 0;
} finally {
  await browser.close();
}
