import assert from 'node:assert/strict';
import test from 'node:test';
import { selectVisionModel, visionModelProfile } from '../lib/vision-model-profile.mjs';

const GiB = 1024 ** 3;

test('selects the balanced qwen vision profile for a normal Pi 5', () => {
  const result = selectVisionModel({ totalRamBytes: 8 * GiB, freeBytes: 20 * GiB });
  assert.equal(result.model, 'qwen2.5vl:3b');
  assert.equal(result.profile, 'balanced');
  assert.equal(result.reason, 'balanced');
});

test('selects the lite vision profile when Pi RAM is constrained', () => {
  const result = selectVisionModel({ totalRamBytes: 4 * GiB, freeBytes: 20 * GiB });
  assert.equal(result.model, 'moondream:1.8b');
  assert.equal(result.profile, 'lite');
  assert.equal(result.reason, 'ram');
});

test('selects the lite vision profile when storage is constrained', () => {
  const result = selectVisionModel({ totalRamBytes: 8 * GiB, freeBytes: 3 * GiB });
  assert.equal(result.model, 'moondream:1.8b');
  assert.equal(result.reason, 'storage');
});

test('explicit vision tags always win over automatic selection', () => {
  const result = selectVisionModel({ configured: 'qwen2.5vl:3b', totalRamBytes: 4 * GiB, freeBytes: 2 * GiB });
  assert.equal(result.model, 'qwen2.5vl:3b');
  assert.equal(result.reason, 'explicit');
  assert.equal(visionModelProfile('custom-vision:latest').profile, 'custom');
});

