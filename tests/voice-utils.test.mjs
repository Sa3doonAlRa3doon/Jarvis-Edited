import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findWakePhrase, isDuplicateCommand, normalizeTranscript, normalizeVocabulary,
  normalizeWakePhrases, recognitionPhraseSpecs, selectRecognitionAlternative, similarity
} from '../public/voice-utils.js';

test('normalizes transcripts and wake phrase settings', () => {
  assert.equal(normalizeTranscript("  Héy, JARVIS!  What's up? "), 'hey jarvis whats up');
  assert.deepEqual(normalizeWakePhrases('Hey Jarvis, jarvis, Hey Jarvis'), ['hey jarvis', 'jarvis']);
});

test('preserves Arabic commands and detects an Arabic wake phrase', () => {
  assert.equal(normalizeTranscript('  يَا جَارْفِيس، افتح دوكر!  '), 'يا جارفيس افتح دوكر');
  const wake = findWakePhrase('يا جارفيس اعرض حالة النظام', ['جارفيس', 'يا جارفيس'], .55);
  assert.equal(wake.detected, true); assert.equal(wake.command, 'اعرض حالة النظام');
});

test('deduplicates domain vocabulary and builds bounded recognition biases', () => {
  assert.deepEqual(normalizeVocabulary(['Ollama', 'ollama', 'Raspberry Pi!', 'Moonraker']), ['Ollama', 'Raspberry Pi', 'Moonraker']);
  const specs = recognitionPhraseSpecs(['Jarvis'], ['Ollama', 'Docker']);
  assert.deepEqual(specs, [
    { phrase: 'jarvis', boost: 6 }, { phrase: 'Ollama', boost: 4 }, { phrase: 'Docker', boost: 4 }
  ]);
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

