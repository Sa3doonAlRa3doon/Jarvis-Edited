import assert from 'node:assert/strict';
import test from 'node:test';
import { askLocalModelCascade, localModelAttemptTimeout } from '../lib/ollama-cascade.mjs';

test('a healthy cold model gets enough of the deadline to load and return JSON', async () => {
  let time = 0;
  const calls = [];
  const answer = await askLocalModelCascade({
    modelsToTry: ['primary', 'backup', 'last'], selectedModel: 'primary', timeoutMs: 30_000, now: () => time,
    messages: [{ role: 'user', content: 'Draft a test message.' }], format: 'json',
    fetchChat: async (body, timeout) => {
      calls.push(body.model);
      // The measured Pi cold response takes 21.7 seconds. Equal 10-second
      // slices cancel it just as its model finishes loading.
      assert.ok(timeout >= 21_700);
      assert.equal(body.format, 'json');
      time += 21_700;
      return { message: { content: '{"subject":"Test","body":"Ready"}' } };
    }
  });
  assert.equal(answer.model, 'primary');
  assert.deepEqual(answer.attemptedModels, ['primary']);
  assert.deepEqual(calls, ['primary']);
});

test('fail-fast model errors preserve the remaining time for a real fallback', async () => {
  let time = 0;
  const answer = await askLocalModelCascade({
    modelsToTry: ['broken', 'healthy', 'unused'], selectedModel: 'broken', timeoutMs: 30_000, now: () => time,
    fetchChat: async (body, timeout) => {
      if (body.model === 'broken') { time += 20; throw new Error('Runner failed'); }
      assert.ok(timeout > 20_000);
      return { message: { content: 'Ready' } };
    }
  });
  assert.deepEqual(answer.attemptedModels, ['broken', 'healthy']);
  assert.match(answer.fallback, /healthy/);
});

test('hung attempts share one total deadline without inventing extra time', async () => {
  let time = 0;
  const timeouts = [];
  await assert.rejects(askLocalModelCascade({
    modelsToTry: ['first', 'second', 'third'], timeoutMs: 30_000, now: () => time,
    fetchChat: async (_body, timeout) => { timeouts.push(timeout); time += timeout; throw new Error('Timed out'); }
  }), /Timed out/);
  assert.equal(timeouts.length, 3);
  assert.equal(timeouts.reduce((sum, value) => sum + value, 0), 30_000);
  assert.equal(time, 30_000);
  assert.equal(localModelAttemptTimeout(999, 1), 0);
});

test('empty replies trigger fallback while successful unused models stay out of the attempt list', async () => {
  const answer = await askLocalModelCascade({
    modelsToTry: ['empty', 'working', 'unused'], selectedModel: 'empty',
    fetchChat: async (body) => ({ message: { content: body.model === 'empty' ? '  ' : 'Answer' } })
  });
  assert.equal(answer.model, 'working');
  assert.deepEqual(answer.attemptedModels, ['empty', 'working']);
});

test('a call that exhausts the deadline prevents starting another model', async () => {
  let time = 0;
  const calls = [];
  await assert.rejects(askLocalModelCascade({
    modelsToTry: ['slow', 'never'], timeoutMs: 5000, now: () => time,
    fetchChat: async (body) => { calls.push(body.model); time = 5001; throw new Error('Connection ended'); }
  }), /Connection ended/);
  assert.deepEqual(calls, ['slow']);
});
