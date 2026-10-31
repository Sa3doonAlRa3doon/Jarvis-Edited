import dotenv from 'dotenv';
import { Camoufox } from 'camoufox';

dotenv.config({ override: true, quiet: true });

const baseUrl = String(process.env.JARVIS_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8788}`).replace(/\/$/, '');
const headless = process.argv.includes('--headless');
const checkVisionUi = process.argv.includes('--vision-ui');
const fakeMedia = process.argv.includes('--fake-media');
const captureLabel = fakeMedia ? 'Synthetic' : 'Real';
const checks = [];
const observations = {};
const pageErrors = [];

function assert(condition, message) { if (!condition) throw new Error(message); }

// Firefox can briefly invalidate the page's remote object while a camera or
// display track is being stopped. Retry only the read-only test evaluation;
// this does not hide a failed UI assertion and keeps the production page
// untouched.
async function evaluateWithRetry(page, expression, arg, { attempts = 3, delayMs = 250 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try { return await page.evaluate(expression, arg); }
    catch (error) { lastError = error; if (attempt + 1 < attempts) await page.waitForTimeout(delayMs).catch(() => {}); }
  }
  throw lastError || new Error('page evaluation failed');
}

// Camoufox's bundled fake devices can be exclusive even though a normal
// desktop browser usually permits shared capture. Release the dashboard's
// background listeners before an independent hardware probe so this smoke
// test measures the browser media path rather than a fake-device lock.
async function releaseDashboardMedia(page) {
  await evaluateWithRetry(page, 'mw:window.__jarvisReleaseMedia?.()').catch(() => {});
  await evaluateWithRetry(page, () => {
    const voice = document.querySelector('#voice-button');
    if (voice?.getAttribute('aria-pressed') === 'true') voice.click();
    const gesture = document.querySelector('#gesture-button');
    if (gesture?.classList.contains('active')) gesture.click();
  });
  await page.waitForFunction(() => document.querySelector('#voice-button')?.getAttribute('aria-pressed') !== 'true' && !document.querySelector('#gesture-button')?.classList.contains('active'), null, { timeout: 5000 }).catch(() => {});
  // The UI state flips before a Camoufox capture device has fully released
  // its track. Stop any remaining page-owned video streams and give Chromium
  // one short event-loop turn before the next hardware probe.
  await evaluateWithRetry(page, () => {
    document.querySelectorAll('video').forEach((video) => {
      const stream = video.srcObject;
      if (stream?.getTracks) stream.getTracks().forEach((track) => track.stop());
      video.pause?.();
      video.srcObject = null;
    });
  });
  await page.waitForTimeout(250);
}

// Camoufox can occasionally invalidate a page-side media remote object while
// a fake device is being released. Treat that as a harness lifecycle race,
// close the isolated probe page, and retry the same real browser operation in
// a fresh document. Production media behavior is unchanged; a genuine device
// or permission failure still bubbles out on the final bounded attempt.
async function probeBrowserMedia(browser, baseUrl) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Use a fresh context for every attempt. Firefox can invalidate the
    // previous context's media remote object after a fake track is stopped;
    // a new page in that same context is not always enough to recover.
    const mediaContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const mediaPage = await mediaContext.newPage();
    mediaPage.setDefaultTimeout(12_000);
    try {
      await mediaPage.goto(`${baseUrl}/?smoke=1&media-probe=${attempt + 1}`, { waitUntil: 'domcontentloaded' });
      const authDialog = mediaPage.locator('#auth-dialog');
      if (await authDialog.isVisible().catch(() => false)) {
        await authDialog.locator('input').fill(String(process.env.DASHBOARD_ACCESS_PIN || ''));
        await authDialog.locator('button[type="submit"]').click({ force: true });
        await authDialog.waitFor({ state: 'detached' });
      }
      await mediaPage.locator('#brain-canvas').waitFor({ state: 'visible', timeout: 15_000 });
      // This probe owns a fresh context with no dashboard stream yet. Do not
      // run the interactive page's release helper here: stopping a stream that
      // does not exist can invalidate Firefox's media remote object just before
      // getUserMedia resolves. The context is closed in finally, which releases
      // every synthetic track deterministically.
      const media = await evaluateWithRetry(mediaPage, async () => {
        const listed = await navigator.mediaDevices.enumerateDevices();
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          const tracks = stream.getTracks().map((track) => ({ kind: track.kind, readyState: track.readyState, labeled: Boolean(track.label) }));
          return { audioInputs: listed.filter((item) => item.kind === 'audioinput').length, videoInputs: listed.filter((item) => item.kind === 'videoinput').length, tracks };
        } finally { stream?.getTracks().forEach((track) => track.stop()); }
      });
      return media;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await mediaContext.close().catch(() => {});
    }
  }
  throw lastError || new Error('The browser media probe failed.');
}

// Settings sections are intentionally swapped inside a fixed-height workspace.
// A normal Playwright click can occasionally hang while it tries to scroll a
// hidden section back into view after a real sensor stream has just stopped.
// Dispatch the same user-facing button event, then assert that the section was
// actually activated so the smoke test still exercises the real UI path.
async function openSettingsSection(page, name) {
  const target = String(name);
  const selector = `[data-target="${target}"]`;
  let button = page.locator(selector);
  // A real sensor stop can briefly race a settings-page refresh. Recover by
  // reopening the same protected settings route instead of reporting a false
  // failure for a missing navigation control.
  try {
    await button.waitFor({ state: 'attached', timeout: 2500 });
  } catch {
    await page.goto(`${baseUrl}/settings#${encodeURIComponent(target)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#settings-workspace').waitFor({ state: 'attached', timeout: 10_000 });
    button = page.locator(selector);
    await button.waitFor({ state: 'attached', timeout: 10_000 });
  }
  await page.evaluate((section) => document.querySelector(`[data-target="${CSS.escape(section)}"]`)?.click(), target);
  await page.waitForFunction((section) => document.querySelector(`.settings-section[data-section="${CSS.escape(section)}"]`)?.classList.contains('active'), target, { timeout: 5000 });
}

async function check(name, operation) {
  if (process.env.JARVIS_SMOKE_PROGRESS === '1') console.error(`SMOKE START // ${name}`);
  try {
    const detail = await operation();
    checks.push({ name, ok: true, detail: detail ?? undefined });
    if (process.env.JARVIS_SMOKE_PROGRESS === '1') console.error(`SMOKE PASS // ${name}`);
  } catch (error) {
    // Keep enough context to diagnose asynchronous browser-preview races while
    // still bounding the JSON report emitted by the smoke harness.
    checks.push({ name, ok: false, error: String(error?.message || error).replace(/\s+/g, ' ').slice(0, 1200) });
    if (process.env.JARVIS_SMOKE_PROGRESS === '1') console.error(`SMOKE FAIL // ${name} // ${String(error?.message || error).replace(/\s+/g, ' ').slice(0, 240)}`);
  }
}

const browser = await Camoufox({
  headless,
  os: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
  windowsHide: !headless,
  // Camoufox keeps Playwright's page agent isolated by default. Enable the
  // documented main-world bridge only for this smoke harness so assertions
  // can inspect JARVIS-owned globals without mistaking isolation for failure.
  main_world_eval: true,
  // The default path intentionally uses the installed camera and microphone.
  // CI can opt into deterministic devices with --fake-media without changing
  // the production browser path used by the dashboard.
  // Firefox/Camoufox does not expose Chromium's context permission names.
  // The smoke harness grants local media through Firefox's test-only pref;
  // production profiles retain normal user permission prompts.
  // Camoufox's launch options intentionally use the documented snake_case
  // names; passing firefoxUserPrefs here would silently fall through as a
  // Playwright option and leave the supposedly synthetic run on real devices.
  firefox_user_prefs: {
    'media.navigator.permission.disabled': true,
    ...(fakeMedia ? { 'media.navigator.streams.fake': true } : {})
  }
});
let context;
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(12_000);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error.message || error).slice(0, 240)));

  // Keep the deterministic smoke run from racing the production auto-start
  // listener; the explicit gesture test below still opens the real camera path.
  await page.goto(`${baseUrl}/?smoke=1`, { waitUntil: 'domcontentloaded' });
  await check('Camoufox dashboard authentication dialog', async () => {
    const dialog = page.locator('#auth-dialog');
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator('input').fill(String(process.env.DASHBOARD_ACCESS_PIN || ''));
    await dialog.locator('button[type="submit"]').click({ force: true });
    await dialog.waitFor({ state: 'detached' });
    return 'authenticated through the visible Camoufox dialog';
  });

  await check('Command screen core DOM', async () => {
    await page.locator('#brain-canvas').waitFor({ state: 'visible' });
    for (const selector of ['#messages', '#prompt', '#send-button', '#voice-button', '#jarvis-search', '#mission-inspect-core', '#mission-dialog', '#cpu-value', '#ram-value', '#service-list']) await page.locator(selector).waitFor({ state: 'attached' });
    return 'neural field, composer, telemetry, search, and voice controls loaded';
  });

  await check('Mission inspector opens as a compact pre-flight overlay', async () => {
    await page.locator('#mission-inspect-core').click();
    const dialog = page.locator('#mission-dialog');
    await dialog.waitFor({ state: 'visible' });
    const mode = (await page.locator('#mission-dialog-mode').textContent()).trim();
    assert(mode === 'STANDBY', `unexpected initial mission mode ${mode}`);
    await page.locator('#mission-close').click();
    await dialog.waitFor({ state: 'hidden' });
    return { mode, overlay: 'closed' };
  });

  await check('Command screen exposes the local morning briefing shortcut', async () => {
    const button = page.locator('button[data-prompt*="morning briefing"]');
    assert(await button.count() === 1, 'morning briefing shortcut is missing');
    assert((await button.textContent()).trim() === 'MORNING BRIEFING', 'morning briefing shortcut label changed');
    return { label: (await button.textContent()).trim() };
  });
  await check('Command screen exposes the keyless GitHub research shortcut', async () => {
    const button = page.locator('button[data-prompt*="Search GitHub"]');
    assert(await button.count() === 1, 'GitHub research shortcut is missing');
    assert((await button.textContent()).trim() === 'GITHUB RESEARCH', 'GitHub research shortcut label changed');
    return { label: (await button.textContent()).trim() };
  });
  await check('Command screen exposes the deterministic voice status shortcut', async () => {
    const button = page.locator('button[data-prompt="Is my microphone and wake gate ready?"]');
    assert(await button.count() === 1, 'voice status shortcut is missing');
    assert((await button.textContent()).trim() === 'VOICE STATUS', 'voice status shortcut label changed');
    return { label: (await button.textContent()).trim() };
  });

  await check('Dashboard stays single-screen without scroll', async () => {
    const dimensions = await page.evaluate(() => ({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, documentWidth: document.documentElement.clientWidth, documentHeight: document.documentElement.clientHeight, width: document.documentElement.scrollWidth - document.documentElement.clientWidth, height: document.documentElement.scrollHeight - document.documentElement.clientHeight }));
    assert(dimensions.viewportWidth > 0 && dimensions.viewportHeight > 0 && dimensions.width <= 2 && dimensions.height <= 2, `overflow ${JSON.stringify(dimensions)}`);
    return dimensions;
  });

  await check('Live telemetry reached a non-initializing state', async () => {
    await page.waitForFunction(() => document.querySelector('#system-state')?.textContent?.trim() !== 'INITIALIZING', null, { timeout: 15_000 });
    const state = await page.locator('#system-state').textContent();
    assert(Boolean(state?.trim()), 'system state was empty');
    return state.trim();
  });

  await check(`${captureLabel} Camoufox microphone and camera capture`, async () => {
    // The command-screen checks intentionally open and close voice sessions.
    // Probe hardware in a separate authenticated document so a Firefox media
    // object from the interactive page cannot invalidate the next capture.
    const media = await probeBrowserMedia(browser, baseUrl);
    assert(media.audioInputs > 0 && media.videoInputs > 0, `missing device ${JSON.stringify(media)}`);
    assert(media.tracks.every((track) => track.readyState === 'live' && track.labeled), `tracks were not live ${JSON.stringify(media)}`);
    observations.media = media;
    return media;
  });

  await check('JARVIS voice listener state', async () => {
    await page.waitForTimeout(1200);
    const voice = await page.evaluate(() => ({ state: document.body.dataset.voiceState || '', label: document.querySelector('#voice-button')?.getAttribute('aria-label') || '', supported: Boolean(navigator.mediaDevices?.getUserMedia) }));
    const deck = (await page.locator('#voice-deck-state').textContent()).trim();
    assert(voice.supported && !['error', 'unsupported'].includes(voice.state) && /MIC OFF|LISTENING|HEARING|ARMED/i.test(deck), JSON.stringify({ ...voice, deck }));
    observations.voice = { ...voice, deck };
    return { ...voice, deck };
  });

  await check('Fish Audio talkback decodes and plays in Camoufox', async () => {
    const playback = await page.evaluate(async () => {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Yes sir, how can I help you today?', mode: 'fish' })
      });
      const bytes = await response.arrayBuffer();
      if (!response.ok) return { status: response.status, bytes: bytes.byteLength, contentType: response.headers.get('content-type') || '' };
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return { status: response.status, bytes: bytes.byteLength, contentType: response.headers.get('content-type') || '', audioContext: false };
      const context = new AudioContextClass({ latencyHint: 'interactive' });
      try {
        const bounded = (promise, fallback, timeoutMs = 2_000) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]);
        const resumed = await bounded(context.resume().then(() => true).catch(() => false), false);
        const decoded = await bounded(context.decodeAudioData(bytes.slice(0)).catch(() => null), null, 4_000);
        if (!decoded) return { status: response.status, bytes: bytes.byteLength, contentType: response.headers.get('content-type') || '', audioContext: false, resumed, reason: 'decode timeout or failure' };
        const source = context.createBufferSource();
        source.buffer = decoded;
        source.connect(context.destination);
        let ended = false;
        const endedPromise = new Promise((resolve) => { source.onended = () => { ended = true; resolve(); }; });
        source.start();
        source.stop(context.currentTime + Math.min(.04, Math.max(.01, decoded.duration)));
        // Headless Firefox can keep an AudioContext's render thread alive
        // after a very short synthetic clip. Bound the playback assertion so
        // a provider success cannot turn the complete smoke run into a hang.
        await Promise.race([endedPromise, new Promise((resolve) => setTimeout(resolve, 2_000))]);
        return { status: response.status, bytes: bytes.byteLength, contentType: response.headers.get('content-type') || '', audioContext: true, resumed, duration: decoded.duration, ended };
      } finally {
        await Promise.race([context.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2_000))]);
      }
    });
    assert(playback.status === 200 && playback.bytes > 1000 && playback.audioContext === true && Number(playback.duration) > 0, JSON.stringify(playback));
    return playback;
  });

  await check('Thinking cue exposes a bounded state and clears on completion', async () => {
    const cue = await page.evaluate(`mw:(async () => {
      const handle = window.__jarvisThinkingCue;
      if (!handle) throw new Error('smoke thinking cue handle missing');
      await handle.start({ phase: 'thinking' });
      return handle.state();
    })()`);
    assert(cue.thinking === 'true' && cue.phase === 'thinking', JSON.stringify(cue));
    const cleared = await page.evaluate(`mw:(() => {
      window.__jarvisThinkingCue.stop();
      return window.__jarvisThinkingCue.state();
    })()`);
    assert(cleared.thinking !== 'true' && !cleared.phase, JSON.stringify(cleared));
    return { active: cue, cleared };
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

  await check('Dashboard search exposes the multipurpose Dexter-inspired lanes', async () => {
    await page.keyboard.press('Control+k');
    const dialog = page.locator('#jarvis-search');
    await dialog.waitFor({ state: 'visible' });
    await page.locator('#jarvis-search-input').fill('knowledge');
    await page.waitForTimeout(120);
    const labels = await page.locator('#jarvis-search-results [role="option"]').allTextContents();
    assert(labels.some((label) => /local knowledge index/i.test(label)), labels.join(' // ') || 'no knowledge result');
    await page.locator('#jarvis-search-close').click({ force: true });
    return { labels: labels.slice(0, 3) };
  });

  await check('Push-to-talk opens a focused voice session', async () => {
    await page.keyboard.press('Control+Space');
    await page.locator('#jarvis-search').waitFor({ state: 'visible' });
    const voiceCommand = await page.locator('#jarvis-search').getAttribute('data-voice-command');
    const phase = await page.locator('#jarvis-search').getAttribute('data-capture-phase');
    assert(voiceCommand === 'true' && phase === 'acknowledging', `${voiceCommand} / ${phase}`);
    await page.locator('#jarvis-search-close').click({ force: true });
    return { voiceCommand, phase };
  });

  await check('Dexter-compatible Ctrl+Alt+Space opens the same voice session', async () => {
    await page.locator('#jarvis-search-close').click({ force: true }).catch(() => {});
    await page.keyboard.press('Control+Alt+Space');
    await page.locator('#jarvis-search').waitFor({ state: 'visible' });
    const voiceCommand = await page.locator('#jarvis-search').getAttribute('data-voice-command');
    const phase = await page.locator('#jarvis-search').getAttribute('data-capture-phase');
    assert(voiceCommand === 'true' && phase === 'acknowledging', `${voiceCommand} / ${phase}`);
    await page.locator('#jarvis-search-close').click({ force: true });
    return { voiceCommand, phase };
  });

  await check('Keyboard wake opens the same guarded voice session', async () => {
    await page.locator('#jarvis-search-close').click({ force: true }).catch(() => {});
    await page.keyboard.press('Control+Alt+D');
    await page.locator('#jarvis-search').waitFor({ state: 'visible' });
    const voiceCommand = await page.locator('#jarvis-search').getAttribute('data-voice-command');
    const phase = await page.locator('#jarvis-search').getAttribute('data-capture-phase');
    const wakeState = (await page.locator('#wake-state').textContent()).trim();
    assert(voiceCommand === 'true' && phase === 'acknowledging' && wakeState === 'HEARD', `${voiceCommand} / ${phase} / ${wakeState}`);
    await page.locator('#jarvis-search-close').click({ force: true });
    return { voiceCommand, phase, wakeState };
  });

  await check('Host app bridge opens a guarded launch dialog', async () => {
    const catalog = await page.evaluate(async () => (await fetch('/api/desktop/apps', { cache: 'no-store' })).json());
    const app = catalog.apps?.[0];
    if (!app) return { catalog: 0, detail: 'No host app entries were exposed on this platform.' };
    const voiceActive = await page.locator('#voice-button').evaluate((node) => node.getAttribute('aria-pressed') === 'true');
    if (voiceActive) await page.locator('#voice-button').evaluate((node) => node.click());
    await page.waitForFunction(() => !document.querySelector('#send-button')?.disabled, null, { timeout: 15_000 });
    await page.evaluate((value) => { document.querySelector('#prompt').value = value; document.querySelector('#composer').requestSubmit(); }, `open ${app.name}`);
    await page.locator('#operation-dialog').waitFor({ state: 'visible' });
    const title = (await page.locator('#operation-title').textContent()).trim();
    const confirmation = (await page.locator('#confirmation-phrase').textContent()).trim();
    assert(title.includes(app.name) && confirmation === 'LAUNCH APP', `${title} / ${confirmation}`);
    await page.locator('#operation-close').click({ force: true });
    return { catalog: catalog.apps.length, app: app.name, confirmation };
  });

  await check('Gesture camera link starts and stops in Camoufox', async () => {
    // Reopen the dashboard after the isolated media probe. This gives the
    // gesture controller a fresh document and avoids Firefox carrying a
    // stopped fake video track into the interactive camera assertion.
    await page.goto(`${baseUrl}/?smoke=gesture`, { waitUntil: 'domcontentloaded' });
    const gestureAuth = page.locator('#auth-dialog');
    if (await gestureAuth.isVisible().catch(() => false)) {
      await gestureAuth.locator('input').fill(String(process.env.DASHBOARD_ACCESS_PIN || ''));
      await gestureAuth.locator('button[type="submit"]').click({ force: true });
      await gestureAuth.waitFor({ state: 'detached' });
    }
    await page.locator('#brain-canvas').waitFor({ state: 'visible', timeout: 15_000 });
    await releaseDashboardMedia(page);
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
    await releaseDashboardMedia(page);
    return 'camera gesture stream started and stopped';
  });

  // The workspace keeps live telemetry and media state active, so networkidle
  // is not a meaningful readiness signal. DOM readiness plus the explicit
  // element/state checks below is deterministic on Windows and Pi.
  await page.goto(`${baseUrl}/workspace`, { waitUntil: 'domcontentloaded' });
  await check('Private workspace shows the host app bridge', async () => {
    await page.locator('#workspace-service-list').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#workspace-service-list')?.textContent?.includes('HOST APPS'), null, { timeout: 10_000 });
    const services = (await page.locator('#workspace-service-list').textContent()).trim();
    const count = (await page.locator('#workspace-service-count').textContent()).trim();
    assert(/HOST APPS/.test(services) && /MODEL ROUTER/.test(services) && /(?:AUTO SWITCH|no local models)/i.test(services) && /ENGINEERING PIPELINE/.test(services) && /\d+\/\d+/.test(count), `${count} / ${services}`);
    return { count, modelRouter: services.match(/MODEL ROUTER[^\n]*/)?.[0] || 'MODEL ROUTER', engineering: services.match(/ENGINEERING PIPELINE[^\n]*/)?.[0] || 'ENGINEERING PIPELINE', hostApps: services.match(/HOST APPS[^\n]*/)?.[0] || 'HOST APPS' };
  });

  await check('Private workspace exposes the Dexter-inspired live deck', async () => {
    const deck = page.locator('#workspace-live-deck');
    await deck.waitFor({ state: 'visible' });
    const result = await page.evaluate(() => ({
      card: Boolean(document.querySelector('#workspace-live-deck')),
      fields: [...document.querySelectorAll('#workspace-live-deck [id]')].map((node) => node.id),
      state: document.querySelector('#workspace-live-deck-state')?.textContent?.trim(),
      note: document.querySelector('#workspace-live-deck-note')?.textContent?.trim()
    }));
    assert(result.card && result.fields.includes('workspace-live-deck-obs') && result.fields.includes('workspace-live-deck-media') && result.fields.includes('workspace-live-deck-automation') && result.fields.includes('workspace-live-deck-health') && result.fields.includes('workspace-live-deck-dropped') && result.fields.includes('workspace-live-deck-replay') && result.fields.includes('workspace-live-deck-vcam') && result.state, JSON.stringify(result));
    return result;
  });

  await check('Private workspace exposes the multi-purpose capability deck', async () => {
    const deck = page.locator('#workspace-multi-purpose-deck');
    await deck.waitFor({ state: 'visible' });
    const result = await page.evaluate(() => ({
      card: Boolean(document.querySelector('#workspace-multi-purpose-deck')),
      fields: [...document.querySelectorAll('#workspace-multi-purpose-deck [id]')].map((node) => node.id),
      state: document.querySelector('#workspace-multi-deck-state')?.textContent?.trim(),
      note: document.querySelector('#workspace-multi-deck-note')?.textContent?.trim()
    }));
    assert(result.card && result.fields.includes('workspace-multi-deck-obs') && result.fields.includes('workspace-multi-deck-twitch') && result.fields.includes('workspace-multi-deck-jarvis') && result.fields.includes('workspace-multi-deck-desktop') && result.fields.includes('workspace-multi-deck-now-playing') && result.fields.includes('workspace-multi-deck-agents') && result.state, JSON.stringify(result));
    return result;
  });

  await check('Private workspace exposes local screen link', async () => {
    const button = page.locator('#workspace-screen-share-toggle');
    await button.waitFor({ state: 'visible' });
    const state = (await page.locator('#workspace-screen-share-state').textContent()).trim();
    assert((await button.textContent()).includes('SHARE YOUR SCREEN') && state === 'LOCAL SCREEN OFF // NO UPLOAD', `${await button.textContent()} / ${state}`);
    assert(await page.evaluate(() => typeof navigator.mediaDevices?.getDisplayMedia === 'function'), 'display capture API unavailable');
    return { button: (await button.textContent()).trim(), state };
  });

  await check('Private workspace exposes the public website launcher', async () => {
    const form = page.locator('#workspace-website-form');
    const input = page.locator('#workspace-website-input');
    const button = page.locator('#workspace-website-open');
    const refresh = page.locator('#workspace-website-refresh');
    const status = page.locator('#workspace-website-status');
    await form.waitFor({ state: 'visible' });
    const snapshot = await page.evaluate(() => ({
      form: Boolean(document.querySelector('#workspace-website-form')),
      input: Boolean(document.querySelector('#workspace-website-input')),
      button: document.querySelector('#workspace-website-open')?.textContent?.trim(),
      refresh: document.querySelector('#workspace-website-refresh')?.textContent?.trim(),
      refreshDisabled: document.querySelector('#workspace-website-refresh')?.disabled,
      status: document.querySelector('#workspace-website-status')?.textContent?.trim(),
      gridRows: getComputedStyle(document.querySelector('.workspace-screen')).gridTemplateRows
    }));
    // The browser-preview state is intentionally short-lived and can survive
    // a page reload.  A fresh smoke run may therefore see either the idle
    // disabled refresh control or an already-visible preview.  The contract
    // here is the launcher shape and the public read-only guard; the explicit
    // open check below proves the live preview path end-to-end.
    assert(snapshot.form && snapshot.input && snapshot.button === 'OPEN WEBSITE' && snapshot.refresh === 'REFRESH PREVIEW' && typeof snapshot.refreshDisabled === 'boolean' && /public read-only/i.test(snapshot.status || ''), JSON.stringify(snapshot));
    const quickSources = await page.locator('[data-website-alias]').evaluateAll((buttons) => buttons.map((button) => button.dataset.websiteAlias));
    assert(JSON.stringify(quickSources) === JSON.stringify(['Twitch', 'Discord', 'GitHub', 'Reddit', 'Instagram', 'Google News']), JSON.stringify(quickSources));
    return { ...snapshot, quickSources, inputVisible: await input.isVisible(), buttonVisible: await button.isVisible(), refreshVisible: await refresh.isVisible(), statusVisible: await status.isVisible() };
  });

  await check('Explicit public website open produces a bounded private preview', async () => {
    const input = page.locator('#workspace-website-input');
    const form = page.locator('#workspace-website-form');
    await input.fill('https://example.com');
    await form.evaluate((node) => node.requestSubmit());
    // The isolated Camoufox launch may wait behind a just-closed gesture or
    // voice context on Windows. Keep the assertion bounded, but allow the
    // dedicated profile its normal cold-start window.
    await page.waitForFunction(() => /OPENED example\.com/i.test(document.querySelector('#workspace-website-status')?.textContent || ''), null, { timeout: 90_000 });
    await page.waitForFunction(async () => {
      const response = await fetch('/api/agent/live', { cache: 'no-store' });
      if (!response.ok) return false;
      const live = await response.json();
      return live.viewKind === 'browser-preview' && live.frameAvailable === true && /example\.com/i.test(live.previewUrl || '');
    }, null, { timeout: 90_000, polling: 500 });
    await page.waitForFunction(() => {
      const frame = document.querySelector('#workspace-frame');
      return Boolean(frame && !frame.hidden && frame.complete && frame.naturalWidth > 0);
    }, null, { timeout: 90_000, polling: 250 });
    const live = await page.evaluate(async () => (await fetch('/api/agent/live', { cache: 'no-store' })).json());
    const frame = await page.locator('#workspace-frame').evaluate((node) => ({ hidden: node.hidden, complete: node.complete, width: node.naturalWidth, height: node.naturalHeight }));
    assert(live.viewKind === 'browser-preview' && live.frameAvailable && frame.complete && frame.width > 0 && frame.height > 0, JSON.stringify({ live, frame }));
    const beforeVersion = Number(live.frameVersion) || 0;
    const refresh = page.locator('#workspace-website-refresh');
    // The workspace may be finishing one bounded automatic refresh at the
    // exact moment the frame becomes visible. Wait for that short UI handoff
    // instead of turning a valid preview into a timing-only smoke failure.
    if (!await refresh.isEnabled()) {
      await page.waitForFunction(() => {
        const button = document.querySelector('#workspace-website-refresh');
        return Boolean(button && !button.disabled);
      }, null, { timeout: 15_000, polling: 250 });
    }
    assert(await refresh.isEnabled(), 'preview refresh control stayed disabled');
    await refresh.click();
    await page.waitForFunction((version) => Number(document.querySelector('#workspace-frame')?.getAttribute('data-frame-version') || 0) > version || /PREVIEW REFRESHED/i.test(document.querySelector('#workspace-website-status')?.textContent || ''), beforeVersion, { timeout: 30_000, polling: 250 });
    const refreshed = await page.evaluate(async () => (await fetch('/api/agent/live', { cache: 'no-store' })).json());
    assert(refreshed.viewKind === 'browser-preview' && Number(refreshed.frameVersion) > beforeVersion, JSON.stringify({ beforeVersion, refreshed }));
    const beforeAutoVersion = Number(refreshed.frameVersion) || 0;
    await page.waitForFunction((version) => Number(document.querySelector('#workspace-frame')?.getAttribute('data-frame-version') || 0) > version && /PREVIEW AUTO-REFRESHED/i.test(document.querySelector('#workspace-website-status')?.textContent || ''), beforeAutoVersion, { timeout: 90_000, polling: 500 });
    const autoRefreshed = await page.evaluate(async () => ({ live: await (await fetch('/api/agent/live', { cache: 'no-store' })).json(), status: document.querySelector('#workspace-website-status')?.textContent?.trim() }));
    assert(autoRefreshed.live.viewKind === 'browser-preview' && Number(autoRefreshed.live.frameVersion) > beforeAutoVersion && /PREVIEW AUTO-REFRESHED/i.test(autoRefreshed.status || ''), JSON.stringify({ beforeAutoVersion, autoRefreshed }));
    return { viewKind: autoRefreshed.live.viewKind, previewUrl: autoRefreshed.live.previewUrl, previewTitle: autoRefreshed.live.previewTitle, frame: { width: frame.width, height: frame.height }, refreshedVersion: refreshed.frameVersion, autoRefreshedVersion: autoRefreshed.live.frameVersion };
  });

  await check('Private workspace exposes its local directive channel', async () => {
    const form = page.locator('#workspace-directive-form');
    const input = page.locator('#workspace-directive-input');
    const button = page.locator('#workspace-directive-run');
    const talk = page.locator('#workspace-directive-talk');
    const status = page.locator('#workspace-directive-status');
    await form.waitFor({ state: 'visible' });
    const quick = await page.locator('[data-workspace-prompt]').evaluateAll((buttons) => buttons.map((node) => node.textContent?.trim()));
    assert(quick.includes('VOICE') && quick.includes('PIPELINE'), JSON.stringify(quick));
    await page.locator('[data-workspace-prompt="Give me a concise health report for this Pi and its services."]').click();
    const value = await input.inputValue();
    const snapshot = await page.evaluate(() => ({ form: Boolean(document.querySelector('#workspace-directive-form')), input: Boolean(document.querySelector('#workspace-directive-input')), button: document.querySelector('#workspace-directive-run')?.textContent?.trim(), talk: document.querySelector('#workspace-directive-talk')?.textContent?.trim(), talkDisabled: document.querySelector('#workspace-directive-talk')?.disabled, status: document.querySelector('#workspace-directive-status')?.textContent?.trim() }));
    assert(snapshot.form && snapshot.input && snapshot.button === 'ASK JARVIS' && snapshot.talk === 'TALK' && snapshot.talkDisabled && /LOCAL MODEL ROUTER/i.test(snapshot.status || '') && /health report/i.test(value), JSON.stringify({ snapshot, quick, value }));
    assert(await talk.isVisible(), 'workspace talkback control is hidden');
    const planButton = page.locator('#workspace-directive-plan');
    await input.fill('Check my printer, get the weather in Dubai, and show my latest Gmail.');
    await planButton.click();
    await page.waitForFunction(() => !document.querySelector('#workspace-mission-plan')?.hidden && /PLAN READY|PLAN FAILED/i.test(document.querySelector('#workspace-directive-status')?.textContent || ''), null, { timeout: 20_000 });
    const missionPreview = await page.evaluate(() => ({ mode: document.querySelector('#workspace-mission-plan-mode')?.textContent?.trim(), route: document.querySelector('#workspace-mission-plan-route')?.textContent?.trim(), specialists: document.querySelector('#workspace-mission-plan-specialists')?.textContent?.trim(), approvals: document.querySelector('#workspace-mission-plan-approvals')?.textContent?.trim(), steps: document.querySelector('#workspace-mission-plan-steps')?.textContent?.trim(), warnings: document.querySelector('#workspace-mission-plan-warnings')?.textContent?.trim(), status: document.querySelector('#workspace-directive-status')?.textContent?.trim() }));
    assert(missionPreview.mode && missionPreview.route && /LANE/i.test(missionPreview.specialists || '') && missionPreview.steps, JSON.stringify(missionPreview));
    await input.fill('How many local events have happened in the last 24 hours?');
    await form.evaluate((node) => node.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#workspace-directive-talk')?.disabled === false, null, { timeout: 45_000 });
    const answered = await page.evaluate(() => ({ status: document.querySelector('#workspace-directive-status')?.textContent?.trim(), route: document.querySelector('#workspace-route')?.textContent?.trim(), response: document.querySelector('#workspace-task-copy')?.textContent?.trim() }));
    assert(answered.response && answered.route && /DONE|READY/i.test(answered.status || ''), JSON.stringify(answered));
    await talk.click();
    await page.waitForFunction(() => /TALKBACK \/\/ COMPLETE|TALKBACK UNAVAILABLE/i.test(document.querySelector('#workspace-directive-status')?.textContent || ''), null, { timeout: 30_000 });
    const talkback = (await page.locator('#workspace-directive-status').textContent()).trim();
    assert(/^TALKBACK/i.test(talkback), talkback);
    return { ...snapshot, quick, missionPreview, focusedPrompt: value.slice(0, 60), answered: { route: answered.route, status: answered.status, response: answered.response.slice(0, 100) }, talkback };
  });

  await check('Private workspace exposes view intelligence and Pi camera context', async () => {
    const tools = await page.locator('#workspace-screen-explain, #workspace-screen-compact, #workspace-screen-focus').count();
    const cameraState = (await page.locator('#workspace-camera-state').textContent()).trim();
    const cameraSource = (await page.locator('#workspace-camera-source').textContent()).trim();
    assert(tools === 3 && cameraState && /PI CAMERA/i.test(cameraSource), `${tools} / ${cameraState} / ${cameraSource}`);
    const status = await page.evaluate(async () => (await fetch('/api/workspace/status', { cache: 'no-store' })).json());
    assert(status.screenExplain?.available === true && status.websites?.liveView === true && status.websites?.adOrPaywallBypass === false, JSON.stringify(status));
    return { tools, cameraState, screenExplain: status.screenExplain.available, websiteLiveView: status.websites.liveView };
  });

  await check('Private workspace compact view visibly shrinks the protected screen', async () => {
    const compact = page.locator('#workspace-screen-compact');
    await compact.waitFor({ state: 'visible' });
    await compact.click({ force: true });
    const enabled = await page.evaluate(() => ({
      pressed: document.querySelector('#workspace-screen-compact')?.getAttribute('aria-pressed'),
      label: document.querySelector('#workspace-screen-compact')?.textContent?.trim(),
      className: document.querySelector('#workspace-screen-stage')?.classList.contains('compact'),
      renderedBounds: (() => {
        const stage = document.querySelector('#workspace-screen-stage');
        if (!stage) return null;
        const probe = document.createElement('img');
        probe.alt = '';
        probe.dataset.smokeCompactProbe = 'true';
        stage.append(probe);
        const stageRect = stage.getBoundingClientRect();
        const frameRect = probe.getBoundingClientRect();
        probe.remove();
        return { stageWidth: Math.round(stageRect.width), stageHeight: Math.round(stageRect.height), frameWidth: Math.round(frameRect.width), frameHeight: Math.round(frameRect.height) };
      })()
    }));
    assert(enabled.pressed === 'true' && enabled.className && enabled.label === 'FULL VIEW' && enabled.renderedBounds?.frameWidth > 0 && enabled.renderedBounds.frameWidth < enabled.renderedBounds.stageWidth && enabled.renderedBounds.frameHeight < enabled.renderedBounds.stageHeight, JSON.stringify(enabled));
    await compact.click({ force: true });
    const restored = await page.evaluate(() => ({
      pressed: document.querySelector('#workspace-screen-compact')?.getAttribute('aria-pressed'),
      className: document.querySelector('#workspace-screen-stage')?.classList.contains('compact')
    }));
    assert(restored.pressed === 'false' && !restored.className, JSON.stringify(restored));
    return { enabled, restored };
  });

  await check('Private workspace focus view zooms locally without changing the webpage', async () => {
    const compact = page.locator('#workspace-screen-compact');
    const focus = page.locator('#workspace-screen-focus');
    await focus.waitFor({ state: 'visible' });
    await compact.click({ force: true });
    await focus.click({ force: true });
    const enabled = await page.evaluate(() => ({ pressed: document.querySelector('#workspace-screen-focus')?.getAttribute('aria-pressed'), label: document.querySelector('#workspace-screen-focus')?.textContent?.trim(), className: document.querySelector('#workspace-screen-stage')?.classList.contains('focus'), compactPressed: document.querySelector('#workspace-screen-compact')?.getAttribute('aria-pressed'), compactClass: document.querySelector('#workspace-screen-stage')?.classList.contains('compact'), footer: document.querySelector('#workspace-frame-time')?.textContent?.trim() }));
    assert(enabled.pressed === 'true' && enabled.label === 'NORMAL VIEW' && enabled.className && enabled.compactPressed === 'false' && !enabled.compactClass && /PAGE UNCHANGED/i.test(enabled.footer || ''), JSON.stringify(enabled));
    await page.waitForTimeout(1200);
    const held = (await page.locator('#workspace-frame-time').textContent()).trim();
    assert(/LOCAL FOCUS \/\/ PAGE UNCHANGED/i.test(held), `focus footer was overwritten: ${held}`);
    await focus.click({ force: true });
    const restored = await page.evaluate(() => ({ pressed: document.querySelector('#workspace-screen-focus')?.getAttribute('aria-pressed'), className: document.querySelector('#workspace-screen-stage')?.classList.contains('focus') }));
    const restoredFooter = (await page.locator('#workspace-frame-time').textContent()).trim();
    assert(restored.pressed === 'false' && !restored.className && !/LOCAL FOCUS/i.test(restoredFooter), JSON.stringify({ restored, restoredFooter }));
    return { enabled, held, restored, restoredFooter };
  });

  await check('Private workspace offers a true fullscreen own-screen control', async () => {
    const fullscreen = page.locator('#workspace-screen-fullscreen');
    await fullscreen.waitFor({ state: 'visible' });
    const result = await page.evaluate(() => {
      const stage = document.querySelector('#workspace-screen-stage');
      const button = document.querySelector('#workspace-screen-fullscreen');
      return {
        button: Boolean(button),
        stage: Boolean(stage),
        requestSupported: Boolean(stage?.requestFullscreen || stage?.webkitRequestFullscreen),
        initialLabel: button?.textContent?.trim(),
        initialPressed: button?.getAttribute('aria-pressed')
      };
    });
    assert(result.button && result.stage && result.requestSupported && result.initialLabel === 'FULLSCREEN' && result.initialPressed === 'false', JSON.stringify(result));
    return result;
  });

  await check('Private workspace exposes a bounded printer camera lane', async () => {
    const state = (await page.locator('#workspace-printer-camera-state').textContent()).trim();
    const source = (await page.locator('#workspace-printer-camera-source').textContent()).trim();
    const frame = page.locator('#workspace-printer-camera-frame');
    const status = await page.evaluate(async () => (await fetch('/api/workspace/status', { cache: 'no-store' })).json());
    assert(state && /PRINTER CAMERA/i.test(source), `${state} / ${source}`);
    assert(status.printerCamera?.endpoint === '/api/media/printer-camera/frame.jpg' && status.printerCamera?.continuousCapture === false, JSON.stringify(status.printerCamera));
    return { state, source, endpoint: status.printerCamera.endpoint, continuousCapture: status.printerCamera.continuousCapture, frameHidden: await frame.isHidden() };
  });

  if (checkVisionUi) await check('Workspace explains one approved screen snapshot', async () => {
    const vision = await page.evaluate(async () => (await fetch('/api/vision/status', { cache: 'no-store' })).json());
    if (vision.runtime !== 'ready') return { skipped: true, runtime: vision.runtime };
    const started = await page.evaluate(async () => {
      const mediaDevices = navigator.mediaDevices;
      const original = mediaDevices.getDisplayMedia;
      const stream = await mediaDevices.getUserMedia({ video: true, audio: false });
      mediaDevices.getDisplayMedia = async () => stream;
      window.__jarvisSmokeOriginalDisplayMedia = original;
      document.querySelector('#workspace-screen-share-toggle')?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const active = document.querySelector('#workspace-screen-share-state')?.textContent?.trim() === 'LOCAL SCREEN LIVE // NO UPLOAD';
      const explainEnabled = !document.querySelector('#workspace-screen-explain')?.disabled;
      if (!active || !explainEnabled) {
        mediaDevices.getDisplayMedia = original; stream.getTracks().forEach((track) => track.stop());
        return { active, explainEnabled };
      }
      document.querySelector('#workspace-screen-explain')?.click();
      return { active, explainEnabled, originalRestored: false, streamLive: stream.getVideoTracks().some((track) => track.readyState === 'live') };
    });
    assert(started.active && started.explainEnabled, JSON.stringify(started));
    await page.waitForFunction(() => {
      const copy = document.querySelector('#workspace-screen-explanation-copy')?.textContent?.trim() || '';
      return copy && !copy.startsWith('Press EXPLAIN VIEW') && !copy.startsWith('JARVIS is reading');
    }, null, { timeout: 240_000 });
    const explanation = (await page.locator('#workspace-screen-explanation-copy').textContent()).trim();
    assert(explanation.length > 12, 'vision explanation was empty');
    await page.evaluate(() => {
      const mediaDevices = navigator.mediaDevices;
      if (window.__jarvisSmokeOriginalDisplayMedia) mediaDevices.getDisplayMedia = window.__jarvisSmokeOriginalDisplayMedia;
      delete window.__jarvisSmokeOriginalDisplayMedia;
      document.querySelector('#workspace-screen-share-toggle')?.click();
    });
    return { runtime: vision.runtime, model: vision.model, chars: explanation.length };
  });

  await check('Private workspace shows host-local analytics', async () => {
    await page.locator('#workspace-analytics').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#workspace-analytics-events')?.textContent?.trim() || ''), null, { timeout: 10_000 });
    const payload = await page.evaluate(async () => (await fetch('/api/analytics', { cache: 'no-store' })).json());
    const events = (await page.locator('#workspace-analytics-events').textContent()).trim();
    const note = (await page.locator('#workspace-analytics-note').textContent()).trim();
    assert(payload.readOnly === true && payload.broadcast?.externalConnected === false && /^\d+$/.test(events) && /no telemetry upload/i.test(note), `${payload.readOnly} / ${payload.broadcast?.externalConnected} / ${events} / ${note}`);
    return { events, services: payload.services?.online || 0, note };
  });

  await check('Private workspace restores the agent view after local share', async () => {
    // Keep the display-stream probe in a fresh workspace document. Camoufox
    // can invalidate a MediaStream remote object after the preview/analytics
    // page has changed views; the new document still exercises the real UI
    // toggle without inheriting that stale object.
    const screenPage = await context.newPage();
    screenPage.setDefaultTimeout(12_000);
    try {
      await screenPage.goto(`${baseUrl}/workspace?smoke=1&screen-probe=1`, { waitUntil: 'domcontentloaded' });
      const authDialog = screenPage.locator('#auth-dialog');
      if (await authDialog.isVisible().catch(() => false)) {
        await authDialog.locator('input').fill(String(process.env.DASHBOARD_ACCESS_PIN || ''));
        await authDialog.locator('button[type="submit"]').click({ force: true });
        await authDialog.waitFor({ state: 'detached' });
      }
      await screenPage.locator('#workspace-screen-share-toggle').waitFor({ state: 'visible' });
      await releaseDashboardMedia(screenPage);
      await evaluateWithRetry(screenPage, async () => {
        const mediaDevices = navigator.mediaDevices;
        const originalOwnDescriptor = Object.getOwnPropertyDescriptor(mediaDevices, 'getDisplayMedia');
        let stream;
        let lastError;
        for (let attempt = 0; attempt < 3 && !stream; attempt += 1) {
          try { stream = await mediaDevices.getUserMedia({ video: true, audio: false }); }
          catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 220)); }
        }
        if (!stream) throw lastError || new Error('camera stream could not be opened');
        Object.defineProperty(mediaDevices, 'getDisplayMedia', { configurable: true, writable: true, value: async () => stream });
        window.__jarvisScreenSmoke = { stream, originalOwnDescriptor };
        return { ready: true, track: stream.getVideoTracks()[0]?.readyState || 'missing' };
      });
      // Use trusted Playwright clicks for the user-facing button. This keeps
      // the production gesture requirement intact while the page-side mock
      // supplies a deterministic local MediaStream.
      await screenPage.locator('#workspace-screen-share-toggle').click({ force: true });
      await screenPage.waitForFunction(() => document.querySelector('#workspace-screen-share-state')?.textContent?.trim() === 'LOCAL SCREEN LIVE // NO UPLOAD', null, { timeout: 8_000 });
      const started = await screenPage.evaluate(() => ({ state: document.querySelector('#workspace-screen-share-state')?.textContent?.trim(), videoHidden: document.querySelector('#workspace-screen-share-video')?.hidden }));
      await screenPage.locator('#workspace-screen-share-toggle').click({ force: true });
      await screenPage.waitForFunction(() => document.querySelector('#workspace-screen-share-state')?.textContent?.trim() === 'LOCAL SCREEN OFF // NO UPLOAD', null, { timeout: 8_000 });
      const stopped = await screenPage.evaluate(() => ({ state: document.querySelector('#workspace-screen-share-state')?.textContent?.trim(), videoHidden: document.querySelector('#workspace-screen-share-video')?.hidden }));
      const active = await screenPage.evaluate(() => {
        const smoke = window.__jarvisScreenSmoke;
        const active = smoke?.stream?.getVideoTracks?.().some((track) => track.readyState === 'live') || false;
        const mediaDevices = navigator.mediaDevices;
        if (smoke?.originalOwnDescriptor) Object.defineProperty(mediaDevices, 'getDisplayMedia', smoke.originalOwnDescriptor);
        else delete mediaDevices.getDisplayMedia;
        smoke?.stream?.getTracks?.().forEach((track) => track.stop());
        delete window.__jarvisScreenSmoke;
        return active;
      });
      const transition = { started, stopped, active };
      assert(transition.started.state === 'LOCAL SCREEN LIVE // NO UPLOAD' && transition.started.videoHidden === false, JSON.stringify(transition));
      assert(transition.stopped.state === 'LOCAL SCREEN OFF // NO UPLOAD' && transition.stopped.videoHidden === true, JSON.stringify(transition));
      return transition;
    } finally {
      await screenPage.close().catch(() => {});
    }
  });

  await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' });
  await check('Settings screen loads in Camoufox', async () => {
    await page.locator('#settings-status').waitFor({ state: 'visible' });
    // Settings hydrates its local capability cards after the document is
    // loaded. Wait for that explicit state instead of treating the brief
    // LOADING label as a page failure on slower hosts.
    await page.waitForFunction(() => ['READY', 'LOAD ERROR'].includes(document.querySelector('#settings-status')?.textContent?.trim() || ''), null, { timeout: 20_000 });
    const sections = await page.locator('.settings-section').count();
    const status = (await page.locator('#settings-status').textContent()).trim();
    const build = (await page.locator('#settings-version').textContent()).trim();
    const config = await page.evaluate(async () => (await fetch('/api/config', { cache: 'no-store' })).json());
    assert(sections === 7 && status !== 'LOADING' && build === String(config.version), `sections=${sections}, status=${status}, build=${build}, server=${config.version}`);
    return { sections, status, build };
  });

  await check('Settings screen schedules one bounded Escape retry', async () => {
    await openSettingsSection(page, 'screen');
    // Set up a deterministic page-local display stream first. The actual
    // button activation is performed by Playwright below so Firefox sees a
    // genuine transient user gesture instead of a programmatic `.click()`.
    await page.evaluate((useSynthetic) => {
      const mediaDevices = navigator.mediaDevices;
      const originalOwnDescriptor = Object.getOwnPropertyDescriptor(mediaDevices, 'getDisplayMedia');
      let canvas = null;
      // A fake Camoufox camera is deliberately not reused as a display stream:
      // Firefox can hold that device open exclusively and the resulting screen
      // test becomes a false negative. A canvas-backed stream is still a real
      // MediaStream and exercises JARVIS's full preview/retry UI path.
      const stream = useSynthetic
        ? (() => {
          canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = 180;
          const context = canvas.getContext('2d');
          context.fillStyle = '#081a2b'; context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#8ff8e3'; context.font = '20px sans-serif'; context.fillText('JARVIS SMOKE', 24, 96);
          return canvas.captureStream(5);
        })()
        : null;
      window.__jarvisSettingsSmoke = {
        mediaDevices,
        originalOwnDescriptor,
        canvas,
        stream,
        displayCalled: false
      };
      if (!stream) return;
      if (!stream?.getVideoTracks?.().length) throw new Error('No synthetic display track returned.');
      // getDisplayMedia lives on MediaDevices.prototype in Firefox. Define a
      // temporary own method so the page's production code receives the
      // deterministic stream even when the prototype method is not writable
      // through normal assignment in a Camoufox page world.
      Object.defineProperty(mediaDevices, 'getDisplayMedia', { configurable: true, writable: true, value: async () => { window.__jarvisSettingsSmoke.displayCalled = true; return stream; } });
    }, fakeMedia);
    if (!fakeMedia) {
      // Real-profile acceptance uses the browser's native picker and camera
      // path. The synthetic profile above is the deterministic CI path.
      await page.evaluate(async () => {
        const smoke = window.__jarvisSettingsSmoke;
        smoke.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!smoke.stream?.getVideoTracks?.().length) throw new Error('No camera stream returned.');
        Object.defineProperty(smoke.mediaDevices, 'getDisplayMedia', { configurable: true, writable: true, value: async () => { smoke.displayCalled = true; return smoke.stream; } });
      });
    }
    try {
      await page.locator('#start-screen-share').click({ force: true });
      await page.waitForFunction(() => document.querySelector('#screen-state')?.textContent?.trim() === 'LIVE' || document.querySelector('#screen-state')?.textContent?.trim() === 'OFFLINE', null, { timeout: 7000 });
      const transition = await page.evaluate(async () => {
        const smoke = window.__jarvisSettingsSmoke;
        const live = document.querySelector('#screen-state')?.textContent?.trim() === 'LIVE';
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        const retry = document.querySelector('#screen-state')?.textContent?.trim();
        document.querySelector('#stop-screen-share')?.click();
        return { live, retry, retryScheduled: retry === 'RETRY IN 20s', displayCalled: smoke?.displayCalled === true, message: document.querySelector('#settings-message')?.textContent?.trim() || '', trackState: smoke?.stream?.getVideoTracks?.()[0]?.readyState || 'missing' };
      });
      assert(transition.live && transition.retryScheduled, JSON.stringify(transition));
      return transition;
    } finally {
      await page.evaluate(() => {
        const smoke = window.__jarvisSettingsSmoke;
        if (!smoke) return;
        if (smoke.originalOwnDescriptor) Object.defineProperty(smoke.mediaDevices, 'getDisplayMedia', smoke.originalOwnDescriptor);
        else delete smoke.mediaDevices.getDisplayMedia;
        smoke.stream?.getTracks?.().forEach((track) => track.stop());
        delete window.__jarvisSettingsSmoke;
      }).catch(() => {});
    }
  });

  await check('Settings reports local vision readiness', async () => {
    const vision = await page.evaluate(async () => {
      const response = await fetch('/api/vision/status', { cache: 'no-store' });
      return { http: response.status, body: await response.json(), note: document.querySelector('#screen-vision-note')?.textContent?.trim() || '' };
    });
    assert(vision.http === 200 && ['ready', 'missing', 'unsupported', 'unconfigured', 'unknown'].includes(vision.body.runtime), JSON.stringify(vision));
    assert(/VISION/i.test(vision.note), `screen note missing vision state: ${vision.note}`);
    return { runtime: vision.body.runtime, model: vision.body.model || 'none' };
  });

  await check('Settings exposes bounded conversation mode', async () => {
    await openSettingsSection(page, 'voice');
    const toggle = page.locator('#conversation-mode');
    await toggle.waitFor({ state: 'attached' });
    const description = (await toggle.locator('xpath=..').textContent()).trim();
    assert(/follow-up|conversation/i.test(description), description);
    return { checked: await toggle.isChecked?.().catch?.(() => null), description: description.slice(0, 160) };
  });

  await check('Settings exposes the bounded Fish Audio retry policy', async () => {
    await openSettingsSection(page, 'voice');
    const policy = await page.evaluate(async () => {
      const response = await fetch('/api/config', { cache: 'no-store' });
      const body = await response.json();
      return { http: response.status, body, note: document.querySelector('#tts-provider-note')?.textContent?.trim() || '' };
    });
    const retry = policy.body.fishRetryPolicy || {};
    assert(policy.http === 200 && Number(retry.maxAttempts) === 2 && Number(retry.backoffMs) === 350 && Array.isArray(retry.retryableStatusCodes) && retry.retryableStatusCodes.join(',') === '500,502,503,504', JSON.stringify(policy));
    assert(/retry/i.test(policy.note), `Fish Audio retry policy missing from Settings: ${policy.note}`);
    return { maxAttempts: retry.maxAttempts, backoffMs: retry.backoffMs, retryableStatusCodes: retry.retryableStatusCodes, note: policy.note.slice(0, 180) };
  });

  await check('Settings sees the selected browser devices', async () => {
    await releaseDashboardMedia(page);
    await openSettingsSection(page, 'devices');
    await page.locator('#refresh-devices').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#refresh-devices')?.disabled === false, null, { timeout: 10_000 });
    const cameras = await page.locator('#browser-camera option').count();
    const microphones = await page.locator('#browser-microphone option').count();
    // A synthetic Camoufox context may expose one unnamed media option rather
    // than the placeholder-plus-device pair used by a physical browser.
    const minimumOptions = fakeMedia ? 1 : 2;
    assert(cameras >= minimumOptions && microphones >= minimumOptions, `camera options=${cameras}, microphone options=${microphones}`);
    const profile = (await page.locator('#microphone-profile').textContent()).trim();
    assert(/PROFILE|CALIBRATE/.test(profile), `microphone profile indicator missing: ${profile}`);
    return { cameras: Math.max(0, cameras - 1), microphones: Math.max(0, microphones - 1), profile, media: captureLabel };
  });

  await check('Settings refreshes browser devices after a hot-plug event', async () => {
    await openSettingsSection(page, 'devices');
    const supported = await page.evaluate(() => Boolean(navigator.mediaDevices?.dispatchEvent));
    assert(supported, 'MediaDevices devicechange events are unavailable');
    await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
    await page.waitForFunction(() => /Browser camera and microphone list updated automatically\./i.test(document.querySelector('#settings-message')?.textContent || ''), null, { timeout: 8_000 });
    const message = (await page.locator('#settings-message').textContent()).trim();
    assert(/updated automatically/i.test(message), message);
    return { supported, message };
  });

  await check('Settings shows the host app catalog', async () => {
    await page.locator('#desktop-apps-grid').waitFor({ state: 'attached' });
    const status = (await page.locator('#desktop-app-state').textContent()).trim();
    const cards = await page.locator('#desktop-apps-grid .google-item').count();
    assert(status !== 'CHECKING' && cards > 0, `${status} / cards=${cards}`);
    return { status, cards };
  });

  await check('Settings exposes local read-only routines', async () => {
    await openSettingsSection(page, 'integrations');
    await page.locator('#routine-list').waitFor({ state: 'visible' });
    const catalog = await page.locator('#routine-kind option').count();
    const state = (await page.locator('#routines-state').textContent()).trim();
    const payload = await page.evaluate(async () => (await fetch('/api/routines', { cache: 'no-store' })).json());
    assert(catalog === 7 && payload.readOnly === true && Array.isArray(payload.catalog), `${catalog} / ${state}`);
    return { catalog, state, routines: payload.routines?.length || 0 };
  });

  await check('Settings Broadcast Kit controls stay local and work', async () => {
    await openSettingsSection(page, 'integrations');
    await page.locator('#broadcast-start-timer').waitFor({ state: 'visible' });
    const name = `Camoufox smoke broadcast ${Date.now()}`;
    await page.locator('#broadcast-timer-name').fill(name);
    await page.locator('#broadcast-timer-seconds').fill('5');
    await page.locator('#broadcast-start-timer').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#broadcast-action-status')?.textContent?.includes('LOCAL TIMER STARTED'), null, { timeout: 10_000 });
    const payload = await page.evaluate(async () => (await fetch('/api/broadcast/state', { cache: 'no-store' })).json());
    const timer = payload.activities?.timers?.find((item) => item.name === name);
    const removed = timer ? await page.evaluate(async (id) => {
      const response = await fetch('/api/broadcast/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'remove', kind: 'timer', id }) });
      return response.status;
    }, timer.id) : 0;
    const controls = await page.locator('#broadcast-start-timer, #broadcast-create-poll, #broadcast-queue-read-aloud').count();
    assert(payload.mode === 'local-stage' && payload.externalConnected === false && timer && removed === 200 && controls === 3, `${payload.mode} / ${payload.externalConnected} / ${Boolean(timer)} / ${removed} / ${controls}`);
    return { mode: payload.mode, externalConnected: payload.externalConnected, removed, controls };
  });

  await check('Settings Local Media Deck stages and removes a track', async () => {
    await openSettingsSection(page, 'integrations');
    await page.locator('#media-enqueue').waitFor({ state: 'visible' });
    const title = `Camoufox smoke media ${Date.now()}`;
    await page.locator('#media-title').fill(title);
    await page.locator('#media-artist').fill('Camoufox smoke');
    await page.locator('#media-duration').fill('0');
    await page.locator('#media-enqueue').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#media-action-status')?.textContent?.includes('LOCAL MEDIA QUEUED'), null, { timeout: 10_000 });
    const payload = await page.evaluate(async () => (await fetch('/api/media/state', { cache: 'no-store' })).json());
    const item = payload.queue?.find((entry) => entry.title === title);
    const removed = item ? await page.evaluate(async (id) => {
      const response = await fetch('/api/media/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'remove', id }) });
      return response.status;
    }, item.id) : 0;
    assert(payload.mode === 'local-stage' && payload.externalConnected === false && item && removed === 200, `${payload.mode} / ${payload.externalConnected} / ${Boolean(item)} / ${removed}`);
    return { mode: payload.mode, externalConnected: payload.externalConnected, removed };
  });

  await check(`Settings sensor calibration opens ${captureLabel.toLowerCase()} camera and mic`, async () => {
    await openSettingsSection(page, 'sensors');
    await page.locator('#start-sensors').waitFor({ state: 'visible' });
    if (fakeMedia) return { skipped: true, media: 'Synthetic', reason: 'physical sensor acceptance runs in the real Camoufox profile' };
    await releaseDashboardMedia(page);
    await page.locator('#start-sensors').click({ force: true });
    let started = await page.waitForFunction(() => document.querySelector('#sensor-state')?.textContent?.trim() === 'CALIBRATING', null, { timeout: 15_000 }).then(() => true).catch(() => false);
    if (!started) {
      await openSettingsSection(page, 'devices');
      await page.locator('#refresh-devices').click({ force: true });
      await page.waitForFunction(() => document.querySelector('#refresh-devices')?.disabled === false, null, { timeout: 10_000 });
      await openSettingsSection(page, 'sensors');
      await page.locator('#start-sensors').click({ force: true });
      started = await page.waitForFunction(() => document.querySelector('#sensor-state')?.textContent?.trim() === 'CALIBRATING', null, { timeout: 15_000 }).then(() => true).catch(() => false);
    }
    assert(started, `sensor calibration did not start: ${await page.locator('#settings-message').textContent()}`);
    const sensor = await page.evaluate(() => ({ state: document.querySelector('#sensor-state')?.textContent?.trim(), videoWidth: document.querySelector('#camera-video')?.videoWidth || 0, mic: document.querySelector('#mic-readout')?.textContent?.trim() || '', evidence: document.querySelector('#voice-evidence')?.textContent?.trim() || '', snr: document.querySelector('#voice-snr')?.textContent?.trim() || '', spectrum: document.querySelector('#voice-spectrum')?.textContent?.trim() || '', epoch: document.querySelector('#voice-epoch')?.textContent?.trim() || '' }));
    assert(sensor.state === 'CALIBRATING' && sensor.videoWidth > 0, JSON.stringify(sensor));
    assert(sensor.evidence && sensor.snr && sensor.epoch !== '', `voice diagnostics missing ${JSON.stringify(sensor)}`);
    assert(sensor.spectrum && sensor.spectrum !== '--', `spectrum gate diagnostics missing ${JSON.stringify(sensor)}`);
    await page.locator('#stop-sensors').click({ force: true });
    return sensor;
  });

  await check('Settings auto-tunes the voice gate from local diagnostics', async () => {
    await openSettingsSection(page, 'voice');
    await page.locator('#auto-tune-voice').waitFor({ state: 'visible' });
    // Settings loads the protected profile and device list in parallel with
    // the real camera teardown. Wait for the synchronized marker before
    // clicking so a queued tune cannot be mistaken for a lost click.
    await page.waitForFunction(() => document.querySelector('#save-state-title')?.dataset.ready === 'true', null, { timeout: 20_000 });
    const before = await page.evaluate(() => ({
      mic: document.querySelector('#mic-sensitivity')?.value,
      wake: document.querySelector('#wake-sensitivity')?.value,
      clap: document.querySelector('#clap-sensitivity')?.value,
      confidence: document.querySelector('#recognition-confidence')?.value,
      silence: document.querySelector('#command-silence')?.value
    }));
    // Dispatch the same button event without asking Playwright to scroll a
    // fixed-height settings pane; the control can be attached while its
    // parent section is transitioning after a real media teardown.
    await page.evaluate(() => document.querySelector('#auto-tune-voice')?.click());
    const messageHandle = await page.waitForFunction(() => {
      const value = document.querySelector('#settings-message')?.textContent?.trim() || '';
      return value.includes('Voice gate staged') ? value : false;
    }, null, { timeout: 8000 });
    const message = String(await messageHandle.jsonValue());
    const tuned = await page.evaluate(() => ({
      mic: document.querySelector('#mic-sensitivity')?.value,
      wake: document.querySelector('#wake-sensitivity')?.value,
      clap: document.querySelector('#clap-sensitivity')?.value,
      confidence: document.querySelector('#recognition-confidence')?.value,
      silence: document.querySelector('#command-silence')?.value,
      dirty: document.querySelector('#dirty-dot')?.classList.contains('dirty')
    }));
    const changed = [tuned.mic, tuned.wake, tuned.clap, tuned.confidence, tuned.silence]
      .some((value, index) => value !== Object.values(before)[index]);
    assert(tuned.dirty && tuned.confidence && tuned.silence && changed, JSON.stringify({ before, tuned }));
    assert(/last calibration sample|current mic sample|safe defaults/.test(message), `auto-tune did not report its bounded sample source: ${message}`);
    return { before, ...tuned, message };
  });

  await check('Settings Google verification reaches a real result', async () => {
    // Use a fresh tab after the real camera calibration. This keeps a
    // transient media teardown or hash navigation from hiding the settings
    // controls while the external OAuth probe runs.
    const googlePage = await context.newPage();
    googlePage.setDefaultTimeout(12_000);
    try {
      await googlePage.goto(`${baseUrl}/settings#integrations`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const dialog = googlePage.locator('#auth-dialog');
      if (await dialog.isVisible().catch(() => false)) {
        await dialog.locator('input').fill(String(process.env.DASHBOARD_ACCESS_PIN || ''));
        await dialog.locator('button[type="submit"]').click({ force: true });
        await dialog.waitFor({ state: 'detached' });
      }
      await googlePage.locator('#settings-status').waitFor({ state: 'visible', timeout: 10_000 });
      await googlePage.waitForFunction(() => ['READY', 'LOAD ERROR'].includes(document.querySelector('#settings-status')?.textContent?.trim() || ''), null, { timeout: 20_000 });
      await openSettingsSection(googlePage, 'integrations');
      await googlePage.locator('#test-google').waitFor({ state: 'attached', timeout: 10_000 });
      await googlePage.locator('#test-google').click({ force: true });
      await googlePage.waitForFunction(() => !['CHECKING', 'PROBING'].includes(document.querySelector('#google-state')?.textContent?.trim() || ''), null, { timeout: 20_000 });
      const status = (await googlePage.locator('#google-state').textContent()).trim();
      const note = (await googlePage.locator('#google-note').textContent()).trim();
      assert(/(?:LINKED|VERIFIED|OFFLINE|REAUTH)/.test(status) && /OAuth/i.test(note), `${status} / ${note}`);
      observations.googleUi = status;
      return { status, note: note.slice(0, 120) };
    } finally {
      await googlePage.close().catch(() => {});
    }
  });

  await check('Settings exposes the guarded Google reauthorization handoff', async () => {
    await openSettingsSection(page, 'integrations');
    const button = page.locator('#reauthorize-google');
    await button.waitFor({ state: 'visible' });
    const link = page.locator('#google-reauth-link');
    const payload = await page.evaluate(async () => (await fetch('/api/google/reauthorize', { cache: 'no-store' })).json());
    assert(await button.textContent() === 'REAUTHORIZE GOOGLE', 'reauthorization button label changed');
    assert(payload && typeof payload.status === 'string' && typeof payload.running === 'boolean', JSON.stringify(payload));
    assert(await link.count() === 1, 'consent link is missing');
    return { button: true, helperStatus: payload.status, running: payload.running };
  });

  await check('Settings shows the protected Stirling PDF lane', async () => {
    await openSettingsSection(page, 'integrations');
    await page.locator('#test-stirling').click({ force: true });
    await page.waitForFunction(() => !['CHECKING', 'CHECKING…'].includes(document.querySelector('#stirling-state')?.textContent?.trim() || ''), null, { timeout: 20_000 });
    const state = (await page.locator('#stirling-state').textContent()).trim();
    const cards = await page.locator('#stirling-grid .google-item').count();
    const note = (await page.locator('#stirling-note').textContent()).trim();
    const processingButton = await page.locator('#test-stirling-processing').count();
    const payload = await page.evaluate(async () => (await fetch('/api/stirling/status', { cache: 'no-store' })).json());
    const workspaceStirling = await page.evaluate(() => {
      const item = [...document.querySelectorAll('#workspace-grid .google-item')].find((node) => node.textContent?.includes('STIRLING PDF'));
      return item?.textContent?.replace(/\s+/g, ' ').trim() || '';
    });
    const processingState = payload.processing?.state || 'not tested';
    const stateAccepted = ['ONLINE // KEY HIDDEN', 'ONLINE // PROCESSING VERIFIED', 'ONLINE // KEY REQUIRED', 'PROCESSING KEY REJECTED', 'CHECK FAILED', 'CONFIGURED', 'NOT CONFIGURED'].includes(state) || /^PROCESSING KEY REJECTED \/\/ HTTP \d{3}$/.test(state);
    assert(cards === 4 && processingButton === 1 && stateAccepted && payload.operations?.length === 4, `${state} / cards=${cards} / syntheticButton=${processingButton} / ${JSON.stringify(payload)}`);
    if (processingState === 'rejected') assert(/REJECTED|AUTH ERROR/i.test(workspaceStirling), `workspace hid rejected Stirling state: ${workspaceStirling}`);
    return { state, cards, processingButton, online: Boolean(payload.online), configured: Boolean(payload.configured), processingState, workspaceStirling };
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
  const failures = checks.filter((item) => !item.ok).map((item) => ({ name: item.name, error: item.error }));
  console.log(JSON.stringify({ camoufox: true, baseUrl, checks, observations, summary: { passed, failed, pageErrors: pageErrors.length } }, null, 2));
  // Keep a compact verdict after the large JSON payload so the bounded
  // Architect/CRITIC evidence tail always retains the failing check names.
  console.log(`CAMOUFOX SUMMARY // passed=${passed} failed=${failed} pageErrors=${pageErrors.length}`);
  if (failures.length || pageErrors.length) console.error(`CAMOUFOX FAILURES // ${JSON.stringify({ failures, pageErrors })}`);
  process.exitCode = failed || pageErrors.length ? 1 : 0;
} finally {
  // Close the explicit outer context before the browser. On Camoufox/Firefox,
  // relying on browser.close() to discover and tear down a media-heavy context
  // can leave the smoke command appearing hung while tracks and preview pages
  // drain. Both shutdown steps are bounded so a teardown race cannot consume
  // the pipeline's entire retry budget.
  await Promise.race([
    context?.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 3_000))
  ]);
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
}
