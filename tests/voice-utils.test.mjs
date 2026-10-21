import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findWakePhrase, isDuplicateCommand, normalizeTranscript, normalizeWakePhrases,
  selectRecognitionAlternative, similarity
} from '../public/voice-utils.js';

test('normalizes transcripts and wake phrase settings', () => {
  assert.equal(normalizeTranscript("  Héy, JARVIS!  What's up? "), 'hey jarvis whats up');
  assert.deepEqual(normalizeWakePhrases('Hey Jarvis, jarvis, Hey Jarvis'), ['hey jarvis', 'jarvis']);
});

test('detects exact and common Jarvis mishearings without matching Travis', () => {
  const exact = findWakePhrase('Hey Jarvis check docker', ['hey jarvis', 'jarvis'], .55);
  assert.equal(exact.detected, true); assert.equal(exact.command, 'check docker');
  assert.equal(findWakePhrase('Jervis system report', ['jarvis'], .55).detected, true);
  assert.equal(findWakePhrase('Travis system report', ['jarvis'], .55).detected, false);
});

test('selects the recognition alternative containing the wake phrase', () => {
  const selected = selectRecognitionAlternative([
    { transcript: 'service show storage', confidence: .86 },
    { transcript: 'Jarvis show storage', confidence: .81 }
  ], { preferWake: true, wakePhrases: ['jarvis'], wakeSensitivity: .55, recognitionConfidence: .3 });
  assert.equal(selected.transcript, 'Jarvis show storage'); assert.equal(selected.wake.detected, true);
});

test('suppresses repeated command echoes while allowing new commands', () => {
  assert.equal(isDuplicateCommand('show docker status', 'show docker status', 900), true);
  assert.equal(isDuplicateCommand('show printer status', 'show docker status', 900), false);
  assert.ok(similarity('restart services', 'restart service') > .9);
});
