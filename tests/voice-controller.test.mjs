import test from 'node:test';
import assert from 'node:assert/strict';
import { configureRecognitionCapabilities, startRecognitionWithTrack, VoiceController } from '../public/voice-controller.js';

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

test('can disable experimental phrase bias while preserving recognition', async () => {
  const previous = globalThis.SpeechRecognitionPhrase;
  globalThis.SpeechRecognitionPhrase = class {};
  try {
    const recognition = { phrases: ['existing'] };
    await configureRecognitionCapabilities(recognition, class {}, { enablePhrases: false, preferLocalRecognition: false });
    assert.deepEqual(recognition.phrases, ['existing']);
  } finally { globalThis.SpeechRecognitionPhrase = previous; }
});

test('routes wake phrase and double clap through the same wake callback', () => {
  const events = [];
  const originalNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  try {
    const controller = new VoiceController({ onWake: (detail) => events.push(detail) });
    controller.arm({ kind: 'wake_word', phrase: 'hey jarvis', score: .98 });
    now += 1_300;
    controller.arm({ kind: 'double_clap', phrase: 'double clap', score: .91 });
  } finally {
    Date.now = originalNow;
  }
  assert.deepEqual(events.map(({ kind }) => kind), ['wake_word', 'double_clap']);
});

test('plays server voice audio through the active microphone audio context', async () => {
  const previousWindow = globalThis.window;
  let started = 0; let outputGain = 0;
  class MockAudioContext {
    constructor() { this.state = 'running'; this.sampleRate = 48_000; this.destination = {}; }
    async resume() { this.state = 'running'; }
    createBuffer() { return {}; }
    createGain() { const node = { gain: { value: 0 }, connect: () => {} }; Object.defineProperty(node.gain, 'value', { set: (value) => { outputGain = value; }, get: () => outputGain }); return node; }
    createBufferSource() {
      return { buffer: null, connect: (node) => node, start() { started += 1; queueMicrotask(() => this.onended?.()); }, stop() {} };
    }
    async decodeAudioData() { return { duration: 1 }; }
    async close() { this.state = 'closed'; }
  }
  globalThis.window = { AudioContext: MockAudioContext };
  try {
    const controller = new VoiceController();
    await controller.playAudio(new ArrayBuffer(8), .65);
    assert.equal(started, 2); assert.equal(outputGain, .65);
  } finally { globalThis.window = previousWindow; }
});
