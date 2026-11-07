import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDoctorProbes, doctorBaseUrl, doctorRequirements, evaluateDoctorSnapshot } from '../scripts/doctor.mjs';

test('doctor targets the dashboard front end by default and honors explicit locations', () => {
  assert.equal(doctorBaseUrl({}), 'http://127.0.0.1:8787');
  assert.equal(doctorBaseUrl({ PORT: '9450' }), 'http://127.0.0.1:9450');
  assert.equal(doctorBaseUrl({ JARVIS_BASE_URL: 'http://127.0.0.1:9550/' }), 'http://127.0.0.1:9550');
});

test('doctor requirements keeps optional probes optional by default', () => {
  assert.deepEqual(doctorRequirements([]), { strict: false, auth: false, openJarvis: false, ollama: false, vision: false, google: false, stirling: false, printer: false, printerCamera: false, camera: false, microphone: false });
  assert.equal(doctorRequirements(['--require-auth']).auth, true);
  assert.equal(doctorRequirements(['--require-mic']).microphone, true);
  assert.equal(doctorRequirements(['--require-microphone']).microphone, true);
  assert.equal(doctorRequirements(['--require-stirling']).stirling, true);
  assert.equal(doctorRequirements(['--require-printer']).printer, true);
  assert.equal(doctorRequirements(['--require-printer-camera']).printerCamera, true);
});

test('doctor warns about an unprotected dashboard and can require its PIN gate', () => {
  const snapshot = {
    frontend: { ok: true },
    dashboard: { ok: true }, auth: { ok: false, detail: 'dashboard PIN is not enabled' },
    config: { browserEngine: 'camoufox' }
  };
  const optional = evaluateDoctorSnapshot(snapshot);
  assert.equal(optional.fail, 0);
  assert.equal(optional.checks.find((item) => item.id === 'auth')?.required, false);
  assert.equal(optional.checks.find((item) => item.id === 'auth')?.ok, false);

  const required = evaluateDoctorSnapshot(snapshot, { auth: true });
  assert.equal(required.fail, 1);
  assert.equal(required.checks.find((item) => item.id === 'auth')?.required, true);
});

test('doctor distinguishes local readiness from optional external connectors', () => {
  const snapshot = {
    platform: 'linux',
    frontend: { ok: true },
    dashboard: { ok: true, detail: 'dashboard healthy' },
    auth: { ok: true, detail: 'session established' },
    config: { browserEngine: 'camoufox' },
    services: { openjarvis: { online: true }, ollama: { online: true } },
    vision: { runtime: 'ready', capabilityVerified: true },
    capabilities: { capabilities: [{ id: 'google', status: { available: false } }] },
    printer: { configured: false, online: false, ready: false },
    integrations: { stirling: { configured: false, online: false }, printerCamera: { configured: false, autoDiscovery: false, discovery: 'not-found' } },
    media: { cameras: [{ id: '/dev/video0' }], microphones: [{ id: 'plughw:0,0' }] }
  };
  const report = evaluateDoctorSnapshot(snapshot, { google: false, camera: true, microphone: true });
  assert.equal(report.fail, 0);
  assert.equal(report.warn, 4);
  assert.equal(report.checks.find((item) => item.id === 'google')?.required, false);
});

test('doctor promotes requested dependencies to failures without exposing secrets', () => {
  const report = evaluateDoctorSnapshot({
    platform: 'linux', frontend: { ok: true }, dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox' },
    services: { openjarvis: { online: false }, ollama: { online: false } },
    vision: { runtime: 'unsupported', capabilityVerified: false },
    capabilities: { capabilities: [{ id: 'google', status: { available: false } }] },
    integrations: { stirling: { configured: false, online: false } },
    printer: { configured: false, online: false, ready: false },
    media: { cameras: [], microphones: [] }
  }, { openJarvis: true, ollama: true, vision: true, google: true, stirling: true, printer: true, camera: true, microphone: true });
  assert.equal(report.fail, 8);
  assert.ok(report.checks.every((item) => !String(item.detail).includes('PIN')));
});

test('doctor reports configured Stirling and printer readiness without leaking credentials', () => {
  const report = evaluateDoctorSnapshot({
    platform: 'linux', frontend: { ok: true }, dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox' },
    services: { openJarvis: { online: true }, ollama: { online: true } },
    vision: { runtime: 'ready', capabilityVerified: true },
    capabilities: { capabilities: [{ id: 'google', status: { available: true } }] },
    integrations: { stirling: { configured: true, online: true, processing: { state: 'verified' }, apiKeyConfigured: true }, printerCamera: { configured: true, discovery: 'found', host: '192.168.4.74' } },
    printer: { configured: true, online: true, ready: true, state: 'printing' },
    media: { cameras: [], microphones: [] }
  }, { stirling: true, printer: true, printerCamera: true });
  assert.equal(report.fail, 0);
  assert.equal(report.checks.find((item) => item.id === 'stirling')?.detail, 'Stirling online // processing verified');
  assert.equal(report.checks.find((item) => item.id === 'printer')?.detail, 'printer online // printing');
  assert.equal(report.checks.find((item) => item.id === 'printer-camera')?.detail, 'printer camera snapshot found');
  assert.ok(report.checks.every((item) => !String(item.detail).includes('apiKey')));
});

test('doctor accepts a verified Pi printer-camera frame when Moonraker discovery has no webcam', () => {
  const report = evaluateDoctorSnapshot({
    platform: 'linux', frontend: { ok: true }, dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox', printerCameraConfigured: true },
    services: { openJarvis: { online: true }, ollama: { online: true } },
    vision: { runtime: 'ready', capabilityVerified: true },
    integrations: { printerCamera: { configured: false, discovery: 'not-found', configError: 'Moonraker has no webcams configured.' } },
    printerCameraFrame: { ok: true, status: 200, bytes: 13471, contentType: 'image/jpeg' },
    printer: { configured: true, online: true, ready: true }, media: { cameras: [], microphones: [] }
  }, { printerCamera: true });
  assert.equal(report.checks.find((item) => item.id === 'printer-camera')?.ok, true);
  assert.equal(report.checks.find((item) => item.id === 'printer-camera')?.detail, 'printer camera frame captured (13471 bytes)');

  const failedFrame = evaluateDoctorSnapshot({
    platform: 'linux', frontend: { ok: true }, dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox', printerCameraConfigured: true },
    integrations: { printerCamera: { configured: false } },
    printerCameraFrame: { ok: false, status: 503, bytes: 0 }
  }, { printerCamera: true });
  assert.equal(failedFrame.checks.find((item) => item.id === 'printer-camera')?.ok, false);
  assert.equal(failedFrame.checks.find((item) => item.id === 'printer-camera')?.detail, 'printer camera frame unavailable (HTTP 503)');
});

test('doctor does not treat a healthy Stirling status endpoint as verified PDF processing', () => {
  const base = {
    frontend: { ok: true }, dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox' },
    services: { openJarvis: { online: true }, ollama: { online: true } },
    vision: { runtime: 'ready', capabilityVerified: true },
    integrations: { stirling: { configured: true, online: true, processing: { state: 'unverified' } } }
  };
  const unverified = evaluateDoctorSnapshot(base, { stirling: true });
  assert.equal(unverified.checks.find((item) => item.id === 'stirling')?.ok, false);
  assert.equal(unverified.checks.find((item) => item.id === 'stirling')?.detail, 'Stirling health online // PDF processing not verified');

  const rejected = evaluateDoctorSnapshot({
    ...base,
    integrations: { stirling: { configured: true, online: true, processing: { state: 'rejected', providerStatus: 401 } } }
  }, { stirling: true });
  assert.equal(rejected.checks.find((item) => item.id === 'stirling')?.ok, false);
  assert.equal(rejected.checks.find((item) => item.id === 'stirling')?.detail, 'Stirling online // processing rejected (HTTP 401)');
});

test('a healthy API cannot hide a failed front end or split backend', () => {
  const report = evaluateDoctorSnapshot({
    frontend: { ok: false }, dashboard: { ok: true },
    backends: { settings: { status: 'ok' }, camera: { status: 'ok' }, microphone: { status: 'error' } },
    config: { browserEngine: 'camoufox' }
  });
  assert.deepEqual(report.checks.filter((item) => !item.ok && item.required).map((item) => item.id), ['frontend', 'microphone-backend']);
});

test('a discovered microphone cannot hide a stopped listener or stale audio stream', () => {
  const now = Date.parse('2026-11-04T10:00:00Z');
  const snapshot = {
    platform: 'linux', frontend: { ok: true }, dashboard: { ok: true }, config: { browserEngine: 'camoufox' },
    media: { microphones: [{ id: 'plughw:2,0' }] },
    settings: { source: 'pi', wakeWord: true, doubleClap: true },
    wake: { running: false, ready: false, model: false, sttModel: true }
  };
  const stopped = evaluateDoctorSnapshot(snapshot, { microphone: true, now });
  assert.equal(stopped.checks.find((item) => item.id === 'microphone')?.ok, true);
  assert.equal(stopped.checks.find((item) => item.id === 'wake-listener')?.ok, false);
  assert.equal(stopped.checks.find((item) => item.id === 'mic-stream')?.ok, false);
  const diagnostics = { source: 'pi', at: new Date(now - 20_000).toISOString(), micLevel: 0.01, noiseFloor: 0.005, signalToNoiseDb: 6 };
  const ready = { ...snapshot, wake: { ...snapshot.wake, running: true, ready: true, model: true, captureBackend: 'pipewire', diagnostics } };
  const stale = evaluateDoctorSnapshot(ready, { microphone: true, now });
  assert.equal(stale.checks.find((item) => item.id === 'wake-listener')?.ok, true);
  assert.equal(stale.checks.find((item) => item.id === 'mic-stream')?.ok, false);
  ready.wake.diagnostics.at = new Date(now - 500).toISOString();
  assert.equal(evaluateDoctorSnapshot(ready, { microphone: true, now }).checks.find((item) => item.id === 'mic-stream')?.ok, true);
});

test('an optional endpoint timeout preserves healthy Google, model, and mic evidence', async () => {
  const probes = await collectDoctorProbes(async (route) => {
    if (route === '/api/vision/status') throw new Error('provider timeout with private detail');
    if (route === '/api/status') return { status: 200, body: { services: { ollama: { online: true } }, wake: { ready: true } } };
    if (route === '/api/wake/status') return { status: 200, body: { ready: true } };
    if (route === '/api/capabilities') return { status: 200, body: { capabilities: [{ id: 'google', status: { available: true } }] } };
    if (route === '/api/google/status?probe=1') return { status: 200, body: { connected: true, liveVerified: true } };
    if (route === '/api/media/devices') return { status: 200, body: { microphones: [{ id: 'plughw:2,0' }] } };
    if (route === '/api/settings') return { status: 200, body: { source: 'pi', wakeWord: true } };
    return { status: 503, body: { error: 'private failure detail', services: { ollama: { online: false } } } };
  }, { platform: 'linux' });
  assert.equal(probes.services.ollama.online, true);
  assert.equal(probes.wake.ready, true);
  assert.equal(probes.capabilities.capabilities[0].status.available, true);
  assert.equal(probes.google.liveVerified, true);
  assert.equal(probes.media.microphones[0].id, 'plughw:2,0');
  assert.equal(probes.settings.source, 'pi');
  assert.deepEqual(probes.vision, {});
  assert.ok(probes.probeErrors.includes('vision: request failed or timed out'));
  assert.ok(!JSON.stringify(probes).includes('private'));
});

test('unauthorized protected responses never count as healthy diagnostic results', async () => {
  const probes = await collectDoctorProbes(async () => ({ status: 401, body: { services: { ollama: { online: true } }, source: 'pi', capabilities: [{ id: 'google', status: { available: true } }] } }), { platform: 'win32' });
  assert.deepEqual(probes.services, {});
  assert.deepEqual(probes.settings, {});
  assert.deepEqual(probes.capabilities, {});
  assert.equal(probes.probeErrors.length, 11);
});

test('a slow optional probe does not age out audio sampled during the same inspection', async () => {
  let time = Date.parse('2026-11-04T10:00:00Z');
  const observed = time;
  const probes = await collectDoctorProbes(async (route) => {
    if (route === '/api/wake/status') return { status: 200, body: { running: true, ready: true, model: true, sttModel: true, diagnostics: { source: 'pi', at: new Date(observed).toISOString(), micLevel: 0.01, noiseFloor: 0.005, signalToNoiseDb: 6 } } };
    if (route === '/api/settings') return { status: 200, body: { source: 'pi', wakeWord: true } };
    if (route === '/api/vision/status') {
      await new Promise((resolve) => setImmediate(resolve));
      time += 12_000;
      throw new Error('optional endpoint stalled');
    }
    return { status: 200, body: {} };
  }, { platform: 'linux', now: () => time });
  assert.equal(probes.wakeObservedAt, observed);
  const report = evaluateDoctorSnapshot({ ...probes, platform: 'linux', frontend: { ok: true }, dashboard: { ok: true }, config: { browserEngine: 'camoufox' } });
  assert.equal(report.checks.find((item) => item.id === 'mic-stream')?.ok, true);
});
