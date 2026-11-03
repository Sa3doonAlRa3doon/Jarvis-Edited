import assert from 'node:assert/strict';
import test from 'node:test';
import { doctorRequirements, evaluateDoctorSnapshot } from '../scripts/doctor.mjs';

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
    platform: 'linux', dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox' },
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
    platform: 'linux', dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox' },
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
    platform: 'linux', dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox', printerCameraConfigured: true },
    services: { openJarvis: { online: true }, ollama: { online: true } },
    vision: { runtime: 'ready', capabilityVerified: true },
    integrations: { printerCamera: { configured: false, discovery: 'not-found', configError: 'Moonraker has no webcams configured.' } },
    printerCameraFrame: { ok: true, status: 200, bytes: 13471, contentType: 'image/jpeg' },
    printer: { configured: true, online: true, ready: true }, media: { cameras: [], microphones: [] }
  }, { printerCamera: true });
  assert.equal(report.checks.find((item) => item.id === 'printer-camera')?.ok, true);
  assert.equal(report.checks.find((item) => item.id === 'printer-camera')?.detail, 'printer camera frame captured (13471 bytes)');

  const failedFrame = evaluateDoctorSnapshot({
    platform: 'linux', dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox', printerCameraConfigured: true },
    integrations: { printerCamera: { configured: false } },
    printerCameraFrame: { ok: false, status: 503, bytes: 0 }
  }, { printerCamera: true });
  assert.equal(failedFrame.checks.find((item) => item.id === 'printer-camera')?.ok, false);
  assert.equal(failedFrame.checks.find((item) => item.id === 'printer-camera')?.detail, 'printer camera frame unavailable (HTTP 503)');
});

test('doctor does not treat a healthy Stirling status endpoint as verified PDF processing', () => {
  const base = {
    dashboard: { ok: true }, auth: { ok: true }, config: { browserEngine: 'camoufox' },
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
