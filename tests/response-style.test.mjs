import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResponseLength, normalizeResponseStyle, responseStyleInstruction } from '../lib/response-style.mjs';

test('normalizes unknown response preferences to safe JARVIS defaults', () => {
  assert.equal(normalizeResponseStyle('TECHNICAL'), 'technical');
  assert.equal(normalizeResponseStyle('unknown'), 'jarvis');
  assert.equal(normalizeResponseLength('DETAILED'), 'detailed');
  assert.equal(normalizeResponseLength('unknown'), 'normal');
});

test('builds a bounded style instruction without changing tool permissions', () => {
  const instruction = responseStyleInstruction('focused', 'short');
  assert.match(instruction, /short operational sentences/i);
  assert.match(instruction, /one or two compact sentences/i);
  assert.doesNotMatch(instruction, /click|send|upload|permission/i);
});

