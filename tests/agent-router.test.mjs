import assert from 'node:assert/strict';
import test from 'node:test';
import { agentRoles, resolvePrimaryModel, routePrompt } from '../lib/agent-router.mjs';

test('selects one primary model for every specialist role', () => {
  const model = resolvePrimaryModel({ JARVIS_MODEL: 'local-one-model' });
  const cases = [
    ['Write a Python function and debug this API', 'CODEACT', 'CODEX'],
    ['Research and compare these sources', 'RESEARCH', 'PROSPECTOR'],
    ['Check Docker CPU RAM and system health', 'MONITOR', 'SENTINEL'],
    ['Remember these notes in my archive', 'MEMORY', 'ARCHIVIST'],
    ['How much time is left on my 3D print?', 'FABRICATOR', 'FABRICATOR'],
    ['Add an event to Google Calendar', 'CONNECTOR', 'LINK'],
    ['Good morning', 'GENERAL', 'JARVIS']
  ];
  for (const [prompt, route, agent] of cases) {
    const selected = routePrompt(prompt, model);
    assert.deepEqual(selected, { model, route, agent });
  }
  assert.equal(new Set(cases.map(([prompt]) => routePrompt(prompt, model).model)).size, 1);
  assert.equal(Object.keys(agentRoles).length, 7);
});

test('keeps legacy model settings only as fallbacks', () => {
  assert.equal(resolvePrimaryModel({ JARVIS_MODEL: 'preferred', GENERAL_MODEL: 'legacy' }), 'preferred');
  assert.equal(resolvePrimaryModel({ GENERAL_MODEL: 'legacy-general', CODING_MODEL: 'legacy-code' }), 'legacy-general');
  assert.equal(resolvePrimaryModel({}), 'llama3.2:1b');
});
