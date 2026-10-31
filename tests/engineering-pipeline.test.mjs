import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {
  ENGINEERING_PROFILES, architectPlan, classifyFailure, createPipelineRun, critiqueCommand,
  finishPipelineRun, normalizePipelineRequest, profileCommands, redactSecrets, safeWorkspacePath,
  validatePatch
} from '../lib/engineering-pipeline.mjs';
import { runEngineeringPipeline, runFixedCommand } from '../scripts/engineering-pipeline.mjs';

const projectRoot = path.resolve(process.cwd());

test('normalizes bounded pipeline requests and fixed profiles', () => {
  const request = normalizePipelineRequest({ task: '  inspect voice and vision  ', profile: 'full', files: ['lib/engineering-pipeline.mjs'], maxAttempts: 99 }, projectRoot);
  assert.deepEqual(request, { task: 'inspect voice and vision', profile: 'full', files: ['lib/engineering-pipeline.mjs'], maxAttempts: 3 });
  assert.deepEqual(ENGINEERING_PROFILES, ['unit', 'check', 'camoufox', 'live', 'full']);
  assert.equal(profileCommands('unit')[0].command, 'npm');
  assert.deepEqual(profileCommands('camoufox')[0].args, ['run', 'smoke:camoufox', '--', '--headless']);
});

test('gives concurrent pipeline runs unique identifiers', () => {
  const request = { task: 'run checks', profile: 'unit', files: [], maxAttempts: 1 };
  const first = createPipelineRun(request);
  const second = createPipelineRun(request);
  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^eng-[a-z0-9]+-[a-f0-9]{8}$/);
});

test('rejects traversal, secret, dependency, and unallow-listed paths', () => {
  for (const candidate of ['../.env', '.env', 'data/memory.json', 'node_modules/x.js', 'server.mjs', 'C:\\Windows\\system32']) {
    assert.throws(() => safeWorkspacePath(projectRoot, candidate));
  }
  assert.throws(() => validatePatch(projectRoot, { path: 'lib/x.mjs', content: 'x'.repeat(120_001) }));
  assert.throws(() => validatePatch(projectRoot, { files: Array.from({ length: 25 }, () => ({ path: 'lib/x.mjs', content: '' })) }));
});

test('redacts common credentials before evidence is persisted', () => {
  const redacted = redactSecrets('Authorization: Bearer abcdefghijklmnop API_KEY=sk-test-1234567890123456 GOCSPX-1234567890123456');
  assert.doesNotMatch(redacted, /abcdefghijklmnop|sk-test|GOCSPX-123/);
  assert.match(redacted, /REDACTED/);
});

test('architect and critic accept a clean fixed command', () => {
  const run = createPipelineRun({ task: 'run checks', profile: 'unit', files: [], maxAttempts: 1 }, 'eng-test');
  assert.equal(architectPlan(run).role, 'ARCHITECT');
  const critic = critiqueCommand({ exitCode: 0, output: '125 tests passed' });
  assert.equal(critic.status, 'accept');
  assert.deepEqual(critic.findings, []);
  assert.equal(finishPipelineRun(run, [{ name: 'unit', exitCode: 0, output: 'ok' }]).status, 'passed');
});

test('critic rejects a failure and debugger receives the exact bounded location', () => {
  const run = createPipelineRun({ task: 'debug checks', profile: 'check', files: [], maxAttempts: 1 }, 'eng-fail');
  const result = finishPipelineRun(run, [{ name: 'check', exitCode: 1, output: 'AssertionError: expected true\n at tests/example.test.mjs:42:7' }]);
  assert.equal(result.status, 'needs-fix');
  assert.equal(result.phase, 'DEBUGGER');
  assert.equal(result.roles.CRITIC.status, 'reject');
  assert.equal(result.roles.DEBUGGER.failure.location.file, 'tests/example.test.mjs');
  assert.equal(result.roles.DEBUGGER.failure.location.line, 42);
  assert.match(result.roles.DEBUGGER.instruction, /smallest source\/test change/);
});

test('timeouts are classified without opening a retry loop', () => {
  const failure = classifyFailure('command timed out after 300000ms');
  assert.equal(failure.kind, 'timeout');
  const critic = critiqueCommand({ exitCode: 1, timedOut: true, output: 'timeout' });
  assert.equal(critic.status, 'reject');
  assert.match(critic.findings.join(' '), /timeout/i);
});

test('engineering pipeline retries the same bounded recipe and records the debugger handoff', async () => {
  const calls = [];
  const updates = [];
  const report = await runEngineeringPipeline({ task: 'retry a flaky check', profile: 'unit', maxAttempts: 2 }, {
    timeoutMs: 50,
    onUpdate: (update) => updates.push(update),
    runCommand: async (command, { attempt }) => {
      calls.push({ name: command.name, attempt });
      return { name: command.name, command: 'npm test', exitCode: attempt === 1 ? 1 : 0, signal: null, timedOut: false, output: attempt === 1 ? 'AssertionError at tests/example.test.mjs:7:2' : 'ok' };
    }
  });
  assert.equal(report.status, 'passed');
  assert.equal(report.attempts, 2);
  assert.equal(report.attemptHistory.length, 2);
  assert.equal(report.attemptHistory[0].debugger.status, 'surgical-fix-required');
  assert.equal(report.attemptHistory[1].critic.status, 'accept');
  assert.equal(report.roles.DEBUGGER.status, 'not-needed');
  assert.match(report.roles.DEBUGGER.note, /later bounded retry passed/);
  assert.deepEqual(calls.map((item) => item.attempt), [1, 2]);
  assert.ok(updates.some((update) => update.status === 'retrying'));
});

test('fixed pipeline commands terminate a Windows process tree after timeout', async () => {
  if (process.platform !== 'win32') return;
  const startedAt = Date.now();
  const result = await runFixedCommand({
    name: 'intentional timeout fixture',
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 60_000)']
  }, { timeoutMs: 200 });
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, 1);
  assert.ok(Date.now() - startedAt < 5_000, `timeout fixture took ${Date.now() - startedAt}ms`);
});
