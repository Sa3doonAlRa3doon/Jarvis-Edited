import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCapabilitySnapshot, capabilityCatalog } from '../lib/capability-registry.mjs';

test('builds a redacted multipurpose capability snapshot', () => {
  const snapshot = buildCapabilitySnapshot({
    services: { openjarvis: { online: true }, ollama: { online: true } },
    google: { connected: true, connectors: { gmail: true } },
    printer: { online: true, state: 'printing' },
    operations: { available: true },
    settings: { source: 'browser' },
    browserControlEnabled: true,
    googleEmailSendEnabled: false,
    models: { primary: 'llama3.2:1b', CODEACT: 'coder-local' },
    installedModels: ['llama3.2:1b', 'coder-local']
  });
  assert.equal(snapshot.capabilities.length, capabilityCatalog.length);
  assert.equal(snapshot.capabilities.find((item) => item.id === 'browser-control').status.available, true);
  assert.equal(snapshot.capabilities.find((item) => item.id === 'email-send').status.available, false);
  assert.equal(snapshot.specialistRoles.CODEACT.model, 'coder-local');
  assert.equal(snapshot.specialistRoles.CODEACT.installed, true);
  assert.deepEqual(snapshot.modelInventory, ['llama3.2:1b', 'coder-local']);
  assert.equal(JSON.stringify(snapshot).includes('token'), false);
  for (const id of ['knowledge-index', 'engineering-pipeline', 'analytics', 'morning-briefing', 'maps-weather', 'social-research']) {
    assert.equal(snapshot.capabilities.find((item) => item.id === id)?.status.available, true, id);
  }
});

test('shows the installed primary fallback when a specialist model is missing', () => {
  const snapshot = buildCapabilitySnapshot({
    models: { primary: 'llama3.2:1b', RESEARCH: 'qwen3.5:9b' },
    installedModels: ['llama3.2:1b']
  });
  assert.equal(snapshot.specialistRoles.RESEARCH.installed, false);
  assert.equal(snapshot.specialistRoles.RESEARCH.runtimeModel, 'llama3.2:1b');
  assert.match(snapshot.specialistRoles.RESEARCH.fallback, /until qwen3\.5:9b is installed/);
});

test('keeps model installation unknown when Ollama inventory is unavailable', () => {
  const snapshot = buildCapabilitySnapshot({ models: { primary: 'llama3.2:1b' }, installedModels: null });
  assert.equal(snapshot.modelInventory, null);
  assert.equal(snapshot.specialistRoles.GENERAL.installed, null);
  assert.equal(snapshot.specialistRoles.GENERAL.runtimeModel, '');
});

test('reports the local vision tag separately from the screen-share capability', () => {
  const snapshot = buildCapabilitySnapshot({ services: { ollama: { online: true, vision: { configured: true, installed: true, model: 'qwen2.5vl:3b' } } } });
  const vision = snapshot.capabilities.find((item) => item.id === 'vision');
  const screen = snapshot.capabilities.find((item) => item.id === 'screen');
  assert.equal(vision.status.available, true);
  assert.equal(vision.status.runtime, 'ready');
  assert.equal(screen.status.available, true);
});

test('surfaces a safe Google reauthorization state without copying OAuth errors', () => {
  const snapshot = buildCapabilitySnapshot({ google: { connected: false, errors: { gmail: 'Google OAuth refresh was rejected. Run the authorize flow.' } } });
  const google = snapshot.capabilities.find((item) => item.id === 'google');
  assert.equal(google.status.available, false);
  assert.equal(google.status.detail, 'OAuth reauthorization required');
  assert.equal(google.status.needsReauthorization, true);
  assert.equal(JSON.stringify(google).includes('refresh was rejected'), false);
});
