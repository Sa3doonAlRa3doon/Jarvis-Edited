import assert from 'node:assert/strict';
import test from 'node:test';
import { agentRoles, isMultiPurposePrompt, modelAttemptOrder, requestDomains, resolveModelMap, resolvePrimaryModel, routePrompt, selectInstalledModel, specialistAssignments } from '../lib/agent-router.mjs';

test('selects one primary model for every specialist role', () => {
  const model = resolvePrimaryModel({ JARVIS_MODEL: 'local-one-model' });
  const cases = [
    ['Write a Python function and debug this API', 'CODEACT', 'CODEX'],
    ['Research and compare these sources', 'RESEARCH', 'PROSPECTOR'],
    ['Check Docker CPU RAM and system health', 'MONITOR', 'SENTINEL'],
    ['Remember these notes in my archive', 'MEMORY', 'ARCHIVIST'],
    ['How much time is left on my 3D print?', 'FABRICATOR', 'FABRICATOR'],
    ['Add an event to Google Calendar', 'CONNECTOR', 'LINK'],
    ['Switch OBS scene and tell me if recording is active', 'BROADCAST', 'PRODUCER'],
    ['Queue a lo-fi music track', 'MEDIA', 'CURATOR'],
    ['Search Instagram and Reddit for public Jarvis dashboard ideas', 'SOCIAL', 'SCOUT'],
    ['Good morning', 'GENERAL', 'JARVIS']
  ];
  for (const [prompt, route, agent] of cases) {
    const selected = routePrompt(prompt, model);
    assert.deepEqual(selected, { model, route, agent });
  }
  assert.equal(new Set(cases.map(([prompt]) => routePrompt(prompt, model).model)).size, 1);
  assert.equal(Object.keys(agentRoles).length, 10);
});

test('keeps legacy model settings only as fallbacks', () => {
  assert.equal(resolvePrimaryModel({ JARVIS_MODEL: 'preferred', GENERAL_MODEL: 'legacy' }), 'preferred');
  assert.equal(resolvePrimaryModel({ GENERAL_MODEL: 'legacy-general', CODING_MODEL: 'legacy-code' }), 'legacy-general');
  assert.equal(resolvePrimaryModel({}), 'llama3.2:1b');
});

test('auto-switches to optional specialist models while preserving the primary fallback', () => {
  const models = resolveModelMap({
    JARVIS_MODEL: 'general-local',
    CODING_MODEL: 'coder-local',
    REASONING_MODEL: 'reasoner-local',
    FABRICATOR_MODEL: 'printer-local',
    BROADCAST_MODEL: 'broadcast-local',
    MEDIA_MODEL: 'media-local',
    SOCIAL_MODEL: 'social-local'
  });
  assert.equal(routePrompt('Fix this TypeScript bug', models).model, 'coder-local');
  assert.equal(routePrompt('Compare these research sources', models).model, 'reasoner-local');
  assert.equal(routePrompt('How long is my print?', models).model, 'printer-local');
  assert.equal(routePrompt('Start a local broadcast recording', models).model, 'broadcast-local');
  assert.equal(routePrompt('Play ambient music', models).model, 'media-local');
  assert.equal(routePrompt('Research public Instagram trends', models).model, 'social-local');
  assert.equal(routePrompt('Hello Jarvis', models).model, 'general-local');
  assert.equal(resolveModelMap({ JARVIS_MODEL: 'one-model' }).CODEACT, 'one-model');
});

test('keeps the requested specialist when it is installed locally', () => {
  assert.deepEqual(selectInstalledModel({ requested: 'coder-local', primary: 'jarvis-local', installed: ['jarvis-local', 'coder-local'] }), { model: 'coder-local', fallback: '' });
});

test('falls back to the primary model when a specialist is missing', () => {
  assert.deepEqual(selectInstalledModel({ requested: 'coder-local', primary: 'jarvis-local', installed: ['jarvis-local'] }), { model: 'jarvis-local', fallback: 'requested specialist model is not installed' });
});

test('chooses an installed role-specific fallback before the primary model', () => {
  assert.deepEqual(selectInstalledModel({
    route: 'GENERAL', requested: 'qwen3.5:4b', primary: 'qwen2.5:1.5b', installed: ['qwen3.5:2b', 'qwen2.5:1.5b']
  }), {
    model: 'qwen3.5:2b', fallback: 'configured specialist model is not installed; using an available role-compatible local model'
  });
  assert.equal(selectInstalledModel({
    route: 'CODEACT', requested: 'missing-coder', primary: 'qwen2.5:1.5b', installed: ['qwen2.5-coder:7b', 'qwen2.5:1.5b']
  }).model, 'qwen2.5-coder:7b');
});

test('uses a Pi-friendly installed model when both configured models are absent', () => {
  assert.deepEqual(selectInstalledModel({ requested: 'coder-local', primary: 'jarvis-local', installed: ['qwen3.5:2b', 'large-cloud-model'] }), { model: 'qwen3.5:2b', fallback: 'configured models are not installed; using an available Pi-friendly local model' });
});

test('builds a bounded installed-only runtime cascade for automatic model recovery', () => {
  assert.deepEqual(modelAttemptOrder({
    requested: 'coder-local', primary: 'jarvis-local',
    installed: ['jarvis-local', 'qwen3.5:2b', 'qwen2.5:1.5b', 'large-model'], limit: 3
  }), ['jarvis-local', 'qwen2.5:1.5b', 'qwen3.5:2b']);
  assert.deepEqual(modelAttemptOrder({ requested: 'coder-local', primary: 'jarvis-local', installed: ['coder-local', 'jarvis-local'] }), ['coder-local', 'jarvis-local']);
});

test('orders installed reasoning fallbacks by specialist role', () => {
  assert.deepEqual(modelAttemptOrder({ route: 'RESEARCH', requested: 'qwen3.5:9b', primary: 'qwen2.5:1.5b', installed: ['qwen3:8b', 'qwen2.5:1.5b'], limit: 3 }), ['qwen3:8b', 'qwen2.5:1.5b']);
});

test('detects cross-domain requests without treating Docker and host health as separate lanes', () => {
  assert.equal(isMultiPurposePrompt('Give me CPU, RAM, Docker, and service health.'), false);
  assert.equal(isMultiPurposePrompt('Check the printer and tell me the weather in Dubai.'), true);
  assert.deepEqual(requestDomains('Check the printer and tell me the weather in Dubai.').map((item) => item.id), ['fabricator', 'public-data']);
  assert.ok(requestDomains('Search GitHub for public Jarvis projects.').some((item) => item.id === 'social'));
});

test('preserves the configured model when the local inventory probe is unavailable', () => {
  assert.deepEqual(modelAttemptOrder({ requested: 'specialist-local', primary: 'primary-local', installed: null, limit: 3 }), ['specialist-local', 'primary-local', 'qwen2.5:1.5b']);
});

test('assigns cross-domain requests to bounded local specialist lanes', () => {
  const assignments = specialistAssignments('Check my printer, weather in Dubai, and latest Gmail.', {
    primary: 'jarvis-local', FABRICATOR: 'printer-local', RESEARCH: 'research-local', CONNECTOR: 'google-local'
  }, ['jarvis-local', 'printer-local', 'research-local']);
  assert.deepEqual(assignments.map((item) => item.domain), ['fabricator', 'google', 'public-data']);
  assert.deepEqual(assignments.map((item) => item.route), ['FABRICATOR', 'CONNECTOR', 'RESEARCH']);
  assert.deepEqual(assignments.map((item) => item.model), ['printer-local', 'jarvis-local', 'research-local']);
  assert.equal(assignments[1].fallback, 'requested specialist model is not installed');
});
