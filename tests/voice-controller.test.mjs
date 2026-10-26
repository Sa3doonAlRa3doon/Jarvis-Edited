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

test('opens a 15 second command capture and recovers the last interim sentence', () => {
  const previousWindow = globalThis.window;
  const timers = []; const captures = []; const commands = [];
  globalThis.window = { setTimeout(callback, milliseconds) { timers.push({ callback, milliseconds }); return timers.length; } };
  try {
    const controller = new VoiceController({ onCapture: (event) => captures.push(event), onCommand: (command) => commands.push(command) });
    controller.beginCommandCapture();
    assert.equal(controller.commandCaptureActive, true);
    assert.equal(timers[0].milliseconds, 15_000);
    assert.equal(captures[0].state, 'listening');

    controller.captureInterim = 'How much memory is being used?';
    controller.handleCommandCaptureDeadline();
    assert.deepEqual(commands, ['how much memory is being used']);
    assert.equal(controller.commandCaptureActive, false);
    assert.equal(captures.at(-1).state, 'complete');
  } finally { globalThis.window = previousWindow; }
});

test('closes command capture without sending when no speech is detected', () => {
  const previousWindow = globalThis.window;
  const captures = []; const commands = [];
  globalThis.window = { setTimeout: () => 1 };
  try {
    const controller = new VoiceController({ onCapture: (event) => captures.push(event), onCommand: (command) => commands.push(command) });
    controller.beginCommandCapture(); controller.finishCommandCapture('timeout');
    assert.equal(controller.commandCaptureActive, false);
    assert.deepEqual(commands, []);
    assert.equal(captures.at(-1).state, 'timeout');
  } finally { globalThis.window = previousWindow; }
});

test('microphone voice activity cancels the 15 second no-speech deadline before text arrives', () => {
  const previousWindow = globalThis.window; const previousClearTimeout = globalThis.clearTimeout;
  const timers = []; const cleared = []; const captures = [];
  globalThis.window = { setTimeout(callback, milliseconds) { timers.push({ callback, milliseconds }); return timers.length; } };
  globalThis.clearTimeout = (id) => { if (id) cleared.push(id); };
  try {
    const controller = new VoiceController({ onCapture: (event) => captures.push(event) });
    controller.beginCommandCapture(); const noSpeechTimer = controller.captureTimer;
    controller.updateCommandVoiceActivity(true);
    assert.equal(controller.commandCaptureStarted, true);
    assert.equal(controller.captureVoiceActive, true);
    assert.ok(cleared.includes(noSpeechTimer));
    assert.equal(captures.at(-1).state, 'hearing');
    assert.equal(timers.at(-1).milliseconds, 120_000);
  } finally { globalThis.window = previousWindow; globalThis.clearTimeout = previousClearTimeout; }
});

test('does not submit a final segment while mic activity says the speaker is still talking', () => {
  const previousWindow = globalThis.window;
  const timers = []; const commands = [];
  globalThis.window = { setTimeout(callback, milliseconds) { timers.push({ callback, milliseconds }); return timers.length; } };
  try {
    const controller = new VoiceController({ onCommand: (command) => commands.push(command) });
    controller.configure({ commandSilenceMs: 700 }); controller.beginCommandCapture();
    controller.updateCommandVoiceActivity(true); controller.queueCommand('How much RAM');
    assert.deepEqual(commands, []);
    assert.equal(controller.commandTimer, 0);
    controller.updateCommandVoiceActivity(false);
    const finalize = timers.at(-1); assert.equal(finalize.milliseconds, 1_400); finalize.callback();
    assert.deepEqual(commands, ['how much ram']);
  } finally { globalThis.window = previousWindow; }
});

test('waits for delayed recognition text after audible speech ends', () => {
  const previousWindow = globalThis.window;
  const timers = []; const captures = [];
  globalThis.window = { setTimeout(callback, milliseconds) { timers.push({ callback, milliseconds }); return timers.length; } };
  try {
    const controller = new VoiceController({ onCapture: (event) => captures.push(event) });
    controller.configure({ commandSilenceMs: 700 }); controller.beginCommandCapture();
    controller.updateCommandVoiceActivity(true); controller.updateCommandVoiceActivity(false);
    assert.equal(timers.at(-1).milliseconds, 2_500);
    assert.equal(captures.at(-1).state, 'hearing');
  } finally { globalThis.window = previousWindow; }
});

test('never recovers a rejected low-confidence transcript as a command', () => {
  const previousWindow = globalThis.window;
  const commands = [];
  globalThis.window = { setTimeout: () => 1 };
  try {
    const controller = new VoiceController({ onCommand: (command) => commands.push(command) });
    controller.configure({ recognitionConfidence: .55, wakeWord: true });
    controller.beginCommandCapture();
    const result = Object.assign([{ transcript: 'turn everything off', confidence: .08 }], { isFinal: true });
    controller.handleRecognitionResult({ resultIndex: 0, results: [result] });
    assert.equal(controller.captureInterim, '');
    controller.handleCommandCaptureDeadline();
    assert.deepEqual(commands, []);
    assert.equal(controller.commandCaptureActive, false);
  } finally { globalThis.window = previousWindow; }
});

test('does not wake from an interim provider guess', () => {
  const wakes = [];
  const controller = new VoiceController({ onWake: (event) => wakes.push(event) });
  controller.configure({ wakeWord: true, recognitionConfidence: .55, wakePhrases: ['hey jarvis', 'jarvis'] });
  const result = Object.assign([{ transcript: 'hey jarvis', confidence: .99 }], { isFinal: false });
  controller.handleRecognitionResult({ resultIndex: 0, results: [result] });
  assert.deepEqual(wakes, []);
});

test('requires a final wake phrase at the beginning of the transcript', () => {
  const wakes = [];
  const controller = new VoiceController({ onWake: (event) => wakes.push(event) });
  controller.configure({ wakeWord: true, recognitionConfidence: .55, wakePhrases: ['hey jarvis', 'jarvis'] });
  controller.analyser = {}; controller.lastRawVoiceAt = performance.now();
  const background = Object.assign([{ transcript: 'someone on television said jarvis', confidence: .99 }], { isFinal: true });
  controller.handleRecognitionResult({ resultIndex: 0, results: [background] });
  assert.deepEqual(wakes, []);
});

test('requires recent physical microphone activity before accepting a provider wake result', () => {
  const wakes = [];
  const controller = new VoiceController({ onWake: (event) => wakes.push(event) });
  controller.configure({ wakeWord: true, recognitionConfidence: .55, wakePhrases: ['hey jarvis', 'jarvis'] });
  controller.analyser = {}; controller.lastRawVoiceAt = 0;
  const silentGuess = Object.assign([{ transcript: 'hey jarvis', confidence: .99 }], { isFinal: true });
  controller.handleRecognitionResult({ resultIndex: 0, results: [silentGuess] });
  assert.deepEqual(wakes, []);

  controller.lastRawVoiceAt = performance.now();
  controller.handleRecognitionResult({ resultIndex: 0, results: [silentGuess] });
  assert.equal(wakes.length, 1);
});

test('accepts a delayed final wake transcript within the bounded physical-voice grace window', () => {
  const previousPerformance = globalThis.performance;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 10_000 } });
  const wakes = [];
  try {
    const controller = new VoiceController({ onWake: (event) => wakes.push(event) });
    controller.configure({ wakeWord: true, recognitionConfidence: .55, wakePhrases: ['hey jarvis'] });
    controller.analyser = {};
    controller.lastRawVoiceAt = 5_000;
    const delayedWake = Object.assign([{ transcript: 'hey jarvis', confidence: .99 }], { isFinal: true });
    controller.handleRecognitionResult({ resultIndex: 0, results: [delayedWake] });
    assert.equal(wakes.length, 1);

    controller.armedUntil = 0;
    controller.lastRawVoiceAt = 3_000;
    controller.handleRecognitionResult({ resultIndex: 0, results: [delayedWake] });
    assert.equal(wakes.length, 1);
  } finally { Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance }); }
});

test('ignores a provider-hallucinated command when the physical microphone is silent', () => {
  const previousWindow = globalThis.window;
  const commands = []; const captures = [];
  globalThis.window = { setTimeout: () => 1 };
  try {
    const controller = new VoiceController({ onCommand: (command) => commands.push(command), onCapture: (event) => captures.push(event) });
    controller.configure({ wakeWord: true, recognitionConfidence: .55 });
    controller.analyser = {}; controller.lastRawVoiceAt = 0;
    controller.beginCommandCapture();
    const silentGuess = Object.assign([{ transcript: 'shut down everything', confidence: .99 }], { isFinal: true });
    controller.handleRecognitionResult({ resultIndex: 0, results: [silentGuess] });
    controller.handleCommandCaptureDeadline();
    assert.deepEqual(commands, []);
    assert.equal(captures.some((event) => event.state === 'transcript' || event.state === 'final'), false);
  } finally { globalThis.window = previousWindow; }
});

test('does not reuse wake-phrase microphone energy to authorize a later silent command', () => {
  const previousWindow = globalThis.window;
  const commands = [];
  globalThis.window = { setTimeout: () => 1 };
  try {
    const controller = new VoiceController({ onCommand: (command) => commands.push(command) });
    controller.configure({ wakeWord: true, recognitionConfidence: .55 });
    controller.analyser = {}; controller.lastRawVoiceAt = performance.now();
    controller.beginCommandCapture();
    assert.equal(controller.lastRawVoiceAt, 0);
    const staleGuess = Object.assign([{ transcript: 'send all my files', confidence: .99 }], { isFinal: true });
    controller.handleRecognitionResult({ resultIndex: 0, results: [staleGuess] });
    controller.handleCommandCaptureDeadline();
    assert.deepEqual(commands, []);
  } finally { globalThis.window = previousWindow; }
});

test('ignores transient raw audio and requires a speech-recognition signal before VAD can hold capture', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout: () => 1 };
  try {
    const controller = new VoiceController();
    controller.beginCommandCapture();
    controller.updateRawCommandVoiceActivity(true, 1_000);
    controller.updateRawCommandVoiceActivity(true, 1_500);
    assert.equal(controller.commandCaptureStarted, false);
    assert.equal(controller.captureVoiceActive, false);

    const previousPerformance = globalThis.performance;
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 2_000 } });
    try { controller.markCommandSpeech(); }
    finally { Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance }); }
    controller.updateRawCommandVoiceActivity(true, 2_050);
    controller.updateRawCommandVoiceActivity(true, 2_400);
    assert.equal(controller.captureVoiceActive, true);
  } finally { globalThis.window = previousWindow; }
});
