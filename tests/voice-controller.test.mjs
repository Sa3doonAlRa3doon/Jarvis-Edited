import test from 'node:test';
import assert from 'node:assert/strict';
import { configureRecognitionCapabilities, startRecognitionWithTrack } from '../public/voice-controller.js';

test('enables installed on-device recognition and contextual phrase boosts', async () => {
  const previous = globalThis.SpeechRecognitionPhrase;
  globalThis.SpeechRecognitionPhrase = class {
    constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; }
  };
  try {
    class RecognitionClass {
      static async available() { return 'available'; }
    }
    const recognition = { processLocally: false, phrases: [] };
    const mode = await configureRecognitionCapabilities(recognition, RecognitionClass, {
      language: 'en-US', wakePhrases: ['jarvis'], voiceVocabulary: ['Ollama'], timeoutMs: 50
    });
    assert.equal(mode, 'local'); assert.equal(recognition.processLocally, true);
    assert.deepEqual(recognition.phrases.map(({ phrase, boost }) => ({ phrase, boost })), [
      { phrase: 'jarvis', boost: 6 }, { phrase: 'Ollama', boost: 4 }
    ]);
  } finally { globalThis.SpeechRecognitionPhrase = previous; }
});

test('falls back to provider recognition when the audio-track overload is unavailable', () => {
  const calls = [];
  const recognition = {
    start(track) {
      calls.push(track || null);
      if (track) throw new TypeError('Audio track overload unsupported');
    }
  };
  const exactTrack = { readyState: 'live' };
  assert.equal(startRecognitionWithTrack(recognition, exactTrack), false);
  assert.deepEqual(calls, [exactTrack, null]);
});

