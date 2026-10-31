import assert from 'node:assert/strict';
import test from 'node:test';
import { doctorRequirements, evaluateDoctorSnapshot } from '../scripts/doctor.mjs';

test('doctor requirements keeps optional probes optional by default', () => {
  assert.deepEqual(doctorRequirements([]), { strict: false, openJarvis: false, ollama: false, vision: false, google: false, stirling: false, printer: false, printerCamera: false, camera: false, microphone: false });
  assert.equal(doctorRequirements(['--require-mic']).microphone, true);
  assert.equal(doctorRequirements(['--require-microphone']).microphone, true);
  assert.equal(doctorRequirements(['--require-stirling']).stirling, true);
  assert.equal(doctorRequirements(['--require-printer']).printer, true);
  assert.equal(doctorRequirements(['--require-printer-camera']).printerCamera, true);
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
