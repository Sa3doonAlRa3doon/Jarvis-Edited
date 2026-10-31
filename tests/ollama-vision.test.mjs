import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisionRuntime, inspectVisionCapability, modelCapabilities, visionRuntimeError } from '../lib/ollama-vision.mjs';

test('recognizes verified Ollama vision capabilities', () => {
  assert.deepEqual(modelCapabilities({ capabilities: ['completion', 'vision', 'vision', ''] }), ['completion', 'vision']);
  assert.deepEqual(inspectVisionCapability({ capabilities: ['completion', 'vision'] }, 'custom-model'), { capable: true, verified: true, source: 'ollama-show', capabilities: ['completion', 'vision'] });
  assert.equal(buildVisionRuntime({ configured: true, installed: true, model: 'custom-model', details: { capabilities: ['completion', 'vision'] } }).runtime, 'ready');
});

test('rejects installed text-only models instead of claiming screen vision', () => {
  const status = buildVisionRuntime({ configured: true, installed: true, model: 'llama3.2:1b', details: { capabilities: ['completion', 'tools'] } });
  assert.equal(status.runtime, 'unsupported');
  assert.equal(status.ready, false);
  assert.equal(status.capabilityVerified, true);
});

test('keeps an older vision-tagged Ollama runtime usable but visibly unverified', () => {
  const status = buildVisionRuntime({ configured: true, installed: true, model: 'qwen2.5vl:3b', details: null, probeError: 'HTTP 404' });
  assert.equal(status.runtime, 'ready');
  assert.equal(status.ready, true);
  assert.equal(status.capabilityVerified, false);
  assert.equal(status.capabilitySource, 'model-tag-fallback');
});

test('distinguishes missing, unreachable, and unconfigured states', () => {
  assert.equal(buildVisionRuntime({ configured: false }).runtime, 'unconfigured');
  assert.equal(buildVisionRuntime({ configured: true, installed: false, model: 'qwen2.5vl:3b' }).runtime, 'missing');
  assert.equal(buildVisionRuntime({ configured: true, installed: null, model: 'qwen2.5vl:3b' }).runtime, 'unknown');
});

test('returns fast actionable vision readiness errors without secrets', () => {
  assert.match(visionRuntimeError(buildVisionRuntime({ configured: false })), /No local vision model is configured/);
  assert.match(visionRuntimeError(buildVisionRuntime({ configured: true, installed: false, model: 'qwen2.5vl:3b' })), /not installed/);
  assert.match(visionRuntimeError(buildVisionRuntime({ configured: true, installed: true, model: 'llama3.2:1b', details: { capabilities: ['completion'] } })), /does not advertise image input/);
  assert.match(visionRuntimeError(buildVisionRuntime({ configured: true, installed: null, model: 'qwen2.5vl:3b' })), /Ollama is unavailable/);
  assert.equal(visionRuntimeError(buildVisionRuntime({ configured: true, installed: true, model: 'qwen2.5vl:3b', details: { capabilities: ['vision'] } })), '');
});
