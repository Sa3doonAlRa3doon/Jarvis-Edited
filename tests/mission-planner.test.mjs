import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMissionPlan } from '../lib/mission-planner.mjs';

test('plans a local multipurpose health request without a mutation approval', () => {
  const plan = buildMissionPlan({
    prompt: 'Give me a concise CPU, RAM, Docker, and service health report.',
    models: { primary: 'llama3.2:1b', MONITOR: 'qwen3.5:2b' },
    openJarvisOnline: true, ollamaOnline: true
  });
  assert.equal(plan.route, 'MONITOR');
  assert.equal(plan.executionMode, 'read-only-local');
  assert.equal(plan.localOnly, true);
  assert.ok(plan.capabilities.some((item) => item.id === 'system-read'));
  assert.ok(plan.capabilities.some((item) => item.id === 'docker-read'));
  assert.equal(plan.approvals.length, 0);
  assert.equal(plan.policy.noSecretEntry, true);
  assert.equal(plan.orchestration.mode, 'single-specialist');
});

test('exposes a clean-room multi-purpose fan-out plan for cross-domain requests', () => {
  const plan = buildMissionPlan({
    prompt: 'Check my printer, get the weather in Dubai, and show my latest Gmail.',
    models: { primary: 'llama3.2:1b' },
    googleConnected: false,
    printerConfigured: true,
    printerOnline: true
  });
  assert.equal(plan.orchestration.mode, 'fan-out-then-synthesize');
  assert.equal(plan.orchestration.specialistCount, 3);
  assert.equal(plan.orchestration.parallelizable, true);
  assert.ok(plan.capabilities.some((item) => item.id === 'orchestrator'));
  assert.ok(plan.steps.some((item) => item.id === 'coordinate'));
  assert.deepEqual(plan.orchestration.domains.map((item) => item.id), ['fabricator', 'google', 'public-data']);
});

test('exposes public social research as a read-only specialist lane', () => {
  const plan = buildMissionPlan({
    prompt: 'Search Instagram and GitHub for public Jarvis dashboard ideas.',
    models: { primary: 'llama3.2:1b', SOCIAL: 'scout-local' }
  });
  assert.equal(plan.executionMode, 'read-only-web');
  assert.ok(plan.capabilities.some((item) => item.id === 'social-research'));
  assert.ok(plan.sources.some((item) => item.id === 'public-social'));
  assert.ok(plan.steps.some((item) => item.id === 'social-read'));
  assert.equal(plan.orchestration.domains.some((item) => item.id === 'social'), true);
  assert.equal(plan.policy.noSilentExternalMutation, true);
});

test('plans browser control as one exact approval and never as silent automation', () => {
  const plan = buildMissionPlan({ prompt: 'Open GitHub and click the issues tab', browserControlEnabled: true, models: { primary: 'llama3.2:1b' } });
  assert.equal(plan.executionMode, 'approval-required');
  assert.equal(plan.localOnly, false);
  assert.equal(plan.approvals[0].confirmation, 'ALLOW BROWSER CONTROL');
  assert.equal(plan.capabilities.find((item) => item.id === 'browser-control').readOnly, false);
  assert.equal(plan.policy.noSilentExternalMutation, true);
});

test('plans natural-language public website opening as isolated read-only navigation', () => {
  const plan = buildMissionPlan({ prompt: 'Open example.com and show me the page', models: { primary: 'llama3.2:1b' } });
  assert.equal(plan.executionMode, 'read-only-web');
  assert.equal(plan.localOnly, false);
  assert.ok(plan.steps.some((item) => item.id === 'browser-open'));
  assert.ok(plan.sources.some((item) => item.id === 'isolated-browser'));
  assert.equal(plan.approvals.length, 0);
});

test('exposes the bounded Architect Critic Debugger pipeline before execution', () => {
  const plan = buildMissionPlan({ prompt: 'Run the full Architect Critic Debugger engineering checks', models: { primary: 'llama3.2:1b' } });
  assert.equal(plan.executionMode, 'read-only-local');
  assert.ok(plan.capabilities.some((item) => item.id === 'engineering-pipeline'));
  assert.deepEqual(plan.steps.slice(-3).map((item) => item.id), ['engineering', 'critic', 'debugger']);
  assert.equal(plan.approvals.length, 0);
});

test('marks restricted external communication as blocked instead of inventing permission', () => {
  const plan = buildMissionPlan({ prompt: 'Use Gmail to send my API key sk-test-1234567890 to a friend', googleConnected: true, models: { primary: 'llama3.2:1b' } });
  assert.equal(plan.executionMode, 'blocked');
  assert.ok(plan.warnings.some((item) => item.code === 'browser-restricted' || item.code === 'external-send-blocked'));
  assert.equal(plan.policy.noSecretEntry, true);
  assert.doesNotMatch(JSON.stringify(plan), /sk-test-1234567890/i);
});

test('reports missing local vision and unavailable Google without exposing credentials', () => {
  const plan = buildMissionPlan({ prompt: 'Explain this screen and show my latest Gmail', visionReady: false, googleConnected: false, models: { primary: 'llama3.2:1b' } });
  assert.ok(plan.warnings.some((item) => item.code === 'vision-not-ready'));
  assert.ok(plan.warnings.some((item) => item.code === 'google-reauthorization'));
  assert.doesNotMatch(JSON.stringify(plan), /token|client_secret|Bearer|password/i);
});

