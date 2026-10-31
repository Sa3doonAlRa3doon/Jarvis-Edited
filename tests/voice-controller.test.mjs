import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVoiceFrame, analyzeVoiceSpectrum, clearVoiceProfile, configureRecognitionCapabilities, isSpeechBandEligible, loadVoiceProfile, resumeAudioContext, saveVoiceProfile, stabilizeNoiseFloor, startRecognitionWithTrack, VoiceController } from '../public/voice-controller.js';

function withLocalStorage(callback) {
  const previous = globalThis.localStorage;
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { return callback(storage); }
  finally {
    if (previous === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
  }
}

test('keeps bounded microphone calibration profiles isolated per device and local', () => {
  withLocalStorage((storage) => {
    assert.equal(saveVoiceProfile('laptop-mic-secret-id', { noiseFloor: .021, signalToNoiseDb: 27 }), true);
    const profile = loadVoiceProfile('laptop-mic-secret-id');
    assert.ok(profile);
    assert.equal(profile.noiseFloor, .021);
    assert.equal(profile.signalToNoiseDb, 27);
    assert.equal(loadVoiceProfile('usb-mic-different-id'), null);
    const raw = storage.getItem('jarvis.voice-profiles.v1');
    assert.doesNotMatch(raw, /laptop-mic-secret-id/);
    assert.doesNotMatch(raw, /usb-mic-different-id/);

    for (let index = 0; index < 10; index += 1) saveVoiceProfile(`mic-${index}`, { noiseFloor: .01 + index / 1000, signalToNoiseDb: 12 + index });
    assert.equal(Object.keys(JSON.parse(storage.getItem('jarvis.voice-profiles.v1'))).length, 8);
  });
});

test('treats malformed or unavailable local microphone profiles as a safe miss', () => {
  withLocalStorage((storage) => {
    storage.setItem('jarvis.voice-profiles.v1', '{bad json');
    assert.equal(loadVoiceProfile('broken'), null);
    storage.setItem('jarvis.voice-profiles.v1', JSON.stringify({ 'mic-dead': { noiseFloor: 'not-a-number' } }));
    assert.equal(loadVoiceProfile('broken'), null);
    assert.equal(saveVoiceProfile('broken', { noiseFloor: .014, signalToNoiseDb: 19 }), true);
  });
});

test('resets only the requested microphone profile', () => {
  withLocalStorage(() => {
    saveVoiceProfile('mic-to-reset', { noiseFloor: .019, signalToNoiseDb: 23 });
    saveVoiceProfile('mic-to-keep', { noiseFloor: .011, signalToNoiseDb: 31 });
    assert.equal(clearVoiceProfile('mic-to-reset'), true);
    assert.equal(loadVoiceProfile('mic-to-reset'), null);
    assert.equal(loadVoiceProfile('mic-to-keep')?.signalToNoiseDb, 31);
    assert.equal(clearVoiceProfile('mic-to-reset'), false);
  });
});

test('uses the same speech-shaped gate for hum rejection and quiet speech diagnostics', () => {
  const hum = analyzeVoiceFrame(Uint8Array.from([140, 116, 140, 116]), { noiseFloor: .01, sensitivity: .08 });
  const voice = analyzeVoiceFrame(Uint8Array.from([168, 119, 146, 128]), { noiseFloor: .01, sensitivity: .08 });
  assert.equal(hum.speechCandidate, false);
  assert.equal(voice.speechCandidate, true);
  assert.ok(voice.signalToNoiseDb > hum.signalToNoiseDb);
  assert.ok(voice.speechScore > hum.speechScore);
  assert.ok(voice.zeroCrossingRatio < .82);
});

test('returns a bounded quiet-frame diagnostic instead of treating silence as speech', () => {
  const quietSamples = new Uint8Array(64); quietSamples.fill(128);
  const quiet = analyzeVoiceFrame(quietSamples, { noiseFloor: .008, sensitivity: .28 });
  assert.equal(quiet.speechCandidate, false);
  assert.equal(quiet.rms, 0);
  assert.ok(quiet.speechScore >= 0 && quiet.speechScore <= 1);
  assert.equal(quiet.signalToNoiseDb, -38.1);
});

test('accepts quiet speech-shaped energy at the default microphone profile', () => {
  const quietSpeech = Uint8Array.from({ length: 64 }, (_, index) => [136, 136, 134, 134, 124, 124, 132, 132][index % 8]);
  const result = analyzeVoiceFrame(quietSpeech, { noiseFloor: .008, sensitivity: .28 });
  assert.ok(result.rms < .04, `fixture is not quiet: ${result.rms}`);
  assert.ok(result.speechScore >= .2, JSON.stringify(result));
  assert.equal(result.speechCandidate, true);
});

test('removes DC bias from real analyser frames before measuring speech energy', () => {
  const biasedSilence = new Uint8Array(64); biasedSilence.fill(160);
  const quiet = analyzeVoiceFrame(biasedSilence, { noiseFloor: .008, sensitivity: .28 });
  assert.ok(quiet.dcOffset > .2);
  assert.equal(quiet.rms, 0);
  assert.equal(quiet.speechCandidate, false);

  const biasedSpeech = Uint8Array.from({ length: 64 }, (_, index) => [188, 139, 166, 148][index % 4]);
  const voice = analyzeVoiceFrame(biasedSpeech, { noiseFloor: .01, sensitivity: .08 });
  assert.ok(voice.dcOffset > .1);
  assert.ok(voice.rms > 0);
  assert.equal(voice.speechCandidate, true);
});

test('stabilizes the learned room floor instead of erasing it during silence', () => {
  let floor = .04; let baseline = .04;
  for (let index = 0; index < 500; index += 1) {
    ({ noiseFloor: floor, baseline } = stabilizeNoiseFloor(floor, baseline, 0));
  }
  assert.ok(floor >= .04 * .72);
  assert.ok(baseline >= .04);

  const louder = stabilizeNoiseFloor(floor, baseline, .08);
  assert.ok(louder.noiseFloor > floor);
  assert.ok(louder.baseline >= baseline);
  const guarded = stabilizeNoiseFloor(.04, .04, .1, { postSpeechGuard: true });
  assert.deepEqual(guarded, { noiseFloor: .04, baseline: .04 });
});

test('rejects a narrow low-frequency hum while preserving a speech-band frame', () => {
  const hum = new Uint8Array(16); hum[1] = 220;
  const speech = new Uint8Array(16); speech[2] = 150; speech[3] = 190; speech[4] = 170; speech[5] = 130;
      const humResult = analyzeVoiceSpectrum(hum, { sampleRate: 16_000, fftSize: 256 });
      const speechResult = analyzeVoiceSpectrum(speech, { sampleRate: 16_000, fftSize: 256 });
  assert.equal(humResult.lowHum, true);
  assert.equal(speechResult.lowHum, false);
  assert.ok(speechResult.speechBandRatio > humResult.speechBandRatio);
});

test('rejects high-band-only interference while preserving speech-band energy', () => {
  assert.equal(isSpeechBandEligible({ available: true, totalPower: 1, speechBandRatio: 0, highBandRatio: 1 }), false);
  assert.equal(isSpeechBandEligible({ available: true, totalPower: 1, speechBandRatio: .24, highBandRatio: .72 }), true);

  const previousPerformance = globalThis.performance;
  const previousRaf = globalThis.requestAnimationFrame;
  let now = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  globalThis.requestAnimationFrame = () => 0;
  try {
    const controller = new VoiceController();
    controller.configure({ micSensitivity: .28, doubleClap: false });
    const samples = [168, 119, 146, 128];
    const frequency = new Uint8Array(1024);
    controller.analyser = {
      fftSize: 2048,
      frequencyBinCount: frequency.length,
      getByteTimeDomainData(target) { for (let index = 0; index < target.length; index += 1) target[index] = samples[index % samples.length]; },
      getByteFrequencyData(target) { target.set(frequency); }
    };

    // 300 / 2048 * 48 kHz is a high-band-only signal.
    frequency[300] = 220;
    for (let frame = 0; frame < 10; frame += 1) { now = frame * 50; controller.monitorAudio(); }
    assert.equal(controller.rawVoiceActive, false);

    frequency.fill(0);
    // 80 / 2048 * 48 kHz is in the speech band.
    frequency[80] = 220;
    for (let frame = 0; frame < 10; frame += 1) { now = 1_000 + frame * 50; controller.monitorAudio(); }
    assert.equal(controller.rawVoiceActive, true);
  } finally {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance });
    if (previousRaf) globalThis.requestAnimationFrame = previousRaf;
    else delete globalThis.requestAnimationFrame;
  }
});

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

test('reports an actionable state when the browser has no speech-recognition API', async () => {
  const previousWindow = globalThis.window;
  const states = []; const errors = [];
  globalThis.window = {};
  try {
    const controller = new VoiceController({ onState: (state) => states.push(state), onError: (error) => errors.push(error.message) });
    controller.configure(); controller.shouldRun = true;
    await controller.startRecognition();
    assert.equal(states.at(-1), 'audio-only');
    assert.match(errors.at(-1), /Speech recognition is unavailable/);
  } finally { globalThis.window = previousWindow; }
});

test('does not show hearing for provider speech without physical mic energy', async () => {
  const previousWindow = globalThis.window;
  const states = [];
  class MockRecognition { start() {} abort() {} }
  globalThis.window = { SpeechRecognition: MockRecognition };
  try {
    const controller = new VoiceController({ onState: (state) => states.push(state) });
    controller.configure({ wakeWord: true }); controller.shouldRun = true; controller.analyser = {}; controller.lastRawVoiceAt = 0;
    await controller.startRecognition();
    controller.recognition.onspeechstart();
    assert.equal(states.at(-1), 'listening');
  } finally { globalThis.window = previousWindow; }
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

test('bounds a suspended browser audio context instead of hanging microphone startup', async () => {
  const context = { state: 'suspended', resume() { return new Promise(() => {}); } };
  const started = Date.now();
  assert.equal(await resumeAudioContext(context, { timeoutMs: 12 }), false);
  assert.ok(Date.now() - started < 500, 'audio resume should remain bounded');
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

test('rejects a recent physical burst when its speech shape is below the wake floor', () => {
  const wakes = [];
  const controller = new VoiceController({ onWake: (event) => wakes.push(event) });
  controller.configure({ wakeWord: true, recognitionConfidence: .55, wakePhrases: ['hey jarvis'] });
  controller.analyser = {}; controller.lastRawVoiceAt = performance.now(); controller.lastPhysicalSpeechScore = .12;
  const burst = Object.assign([{ transcript: 'hey jarvis', confidence: .99 }], { isFinal: true });
  controller.handleRecognitionResult({ resultIndex: 0, results: [burst] });
  assert.deepEqual(wakes, []);
});

test('fails closed when the physical audio analyser is unavailable', () => {
  const wakes = [];
  const controller = new VoiceController({ onWake: (event) => wakes.push(event) });
  controller.configure({ wakeWord: true, recognitionConfidence: .55, wakePhrases: ['hey jarvis'] });
  controller.lastRawVoiceAt = performance.now();
  const providerGuess = Object.assign([{ transcript: 'hey jarvis', confidence: .99 }], { isFinal: true });
  controller.handleRecognitionResult({ resultIndex: 0, results: [providerGuess] });
  assert.deepEqual(wakes, []);
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

test('marks provider guesses rejected so the UI can hide them', () => {
  const transcripts = [];
  const controller = new VoiceController({ onTranscript: (detail) => transcripts.push(detail) });
  controller.configure({ wakeWord: true, recognitionConfidence: .55 });
  controller.analyser = {}; controller.lastRawVoiceAt = 0;
  const silentGuess = Object.assign([{ transcript: 'what is the weather', confidence: .99 }], { isFinal: true });
  controller.handleRecognitionResult({ resultIndex: 0, results: [silentGuess] });
  assert.equal(transcripts.length, 1);
  assert.equal(transcripts[0].accepted, false);
  assert.equal(transcripts[0].final, true);
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

test('requires a fresh physical voice onset after command capture opens', () => {
  const previousWindow = globalThis.window;
  const commands = [];
  globalThis.window = { setTimeout: () => 1 };
  try {
    const controller = new VoiceController({ onCommand: (command) => commands.push(command) });
    controller.configure({ wakeWord: true, recognitionConfidence: .55 });
    controller.analyser = {};
    controller.physicalVoiceEpoch = 4;
    controller.lastRawVoiceAt = performance.now();
    controller.lastPhysicalVoiceOnsetAt = performance.now();
    controller.beginCommandCapture();

    // A provider replay can have a fresh-looking timestamp but no new
    // microphone onset after the acknowledgement/capture boundary.
    controller.lastRawVoiceAt = performance.now();
    const staleGuess = Object.assign([{ transcript: 'send all my files', confidence: .99 }], { isFinal: true });
    controller.handleRecognitionResult({ resultIndex: 0, results: [staleGuess] });
    assert.equal(controller.captureInterim, '');

    controller.physicalVoiceEpoch = 5;
    controller.lastPhysicalVoiceOnsetAt = performance.now();
    controller.lastRawVoiceAt = performance.now();
    controller.handleRecognitionResult({ resultIndex: 0, results: [staleGuess] });
    assert.equal(controller.captureInterim, 'send all my files');
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

test('uses speech-shaped attack and release hysteresis for raw microphone activity', () => {
  const previousPerformance = globalThis.performance;
  const previousRaf = globalThis.requestAnimationFrame;
  const levels = [];
  let now = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  globalThis.requestAnimationFrame = () => 0;
  try {
    const controller = new VoiceController({ onLevel: (level) => levels.push(level.voiceActive) });
    controller.configure({ micSensitivity: .28, doubleClap: false });
    const samples = [128, 128, 128, 128];
    controller.analyser = { fftSize: samples.length, getByteTimeDomainData(target) { target.set(samples); } };

    // A steady, symmetric hum has energy but no speech-shaped crest.
    samples.splice(0, samples.length, 140, 116, 140, 116);
    for (let frame = 0; frame < 10; frame += 1) { now = frame * 50; controller.monitorAudio(); }
    assert.equal(controller.rawVoiceActive, false);

    // A sustained voice-like crest crosses the gate only after the attack window.
    samples.splice(0, samples.length, 168, 119, 146, 128);
    for (let frame = 0; frame < 8; frame += 1) { now = 1_000 + frame * 50; controller.monitorAudio(); }
    assert.equal(controller.rawVoiceActive, true);
    assert.ok(levels.includes(true));

    samples.splice(0, samples.length, 128, 128, 128, 128);
    for (let frame = 0; frame < 10; frame += 1) { now = 1_500 + frame * 50; controller.monitorAudio(); }
    assert.equal(controller.rawVoiceActive, false);
  } finally {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance });
    if (previousRaf) globalThis.requestAnimationFrame = previousRaf;
    else delete globalThis.requestAnimationFrame;
  }
});

test('guards the microphone from the TTS tail without disabling explicit barge-in', () => {
  const previousPerformance = globalThis.performance;
  const previousRaf = globalThis.requestAnimationFrame;
  let now = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  globalThis.requestAnimationFrame = () => 0;
  try {
    const controller = new VoiceController();
    controller.configure({ micSensitivity: .28, doubleClap: false });
    const samples = [168, 119, 146, 128];
    controller.analyser = { fftSize: samples.length, getByteTimeDomainData(target) { target.set(samples); } };

    controller.setSpeaking(true);
    for (let frame = 0; frame < 10; frame += 1) { now = frame * 50; controller.monitorAudio(); }
    assert.equal(controller.rawVoiceActive, false);
    assert.equal(controller.lastPhysicalVoiceOnsetAt, 0);

    controller.setSpeaking(false);
    now = 300;
    controller.monitorAudio();
    assert.equal(controller.rawVoiceActive, false);
    assert.equal(controller.lastPhysicalVoiceOnsetAt, 0);

    now = 1_000;
    for (let frame = 0; frame < 10; frame += 1) { now = 1_000 + frame * 50; controller.monitorAudio(); }
    assert.equal(controller.rawVoiceActive, true);
    assert.ok(controller.lastPhysicalVoiceOnsetAt > 0);

    controller.configure({ bargeIn: true }); now = 2_000; controller.setSpeaking(true);
    for (let frame = 0; frame < 10; frame += 1) { now = 2_000 + frame * 50; controller.monitorAudio(); }
    assert.equal(controller.rawVoiceActive, true);
  } finally {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance });
    if (previousRaf) globalThis.requestAnimationFrame = previousRaf;
    else delete globalThis.requestAnimationFrame;
  }
});

test('calibrates the startup microphone floor before accepting wake or clap energy', () => {
  const previousPerformance = globalThis.performance;
  const previousRaf = globalThis.requestAnimationFrame;
  const levels = [];
  let now = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  globalThis.requestAnimationFrame = () => 0;
  try {
    const controller = new VoiceController({ onLevel: (level) => levels.push(level) });
    controller.configure({ micSensitivity: .28, doubleClap: true });
    const samples = [128, 128, 128, 128];
    controller.analyser = { fftSize: samples.length, getByteTimeDomainData(target) { target.set(samples); } };
    controller.audioCalibrationUntil = 750;

    // A room/fan floor is learned without producing a wake or clap event.
    samples.splice(0, samples.length, 138, 118, 138, 118);
    for (let frame = 0; frame < 8; frame += 1) { now = frame * 50; controller.monitorAudio(); }
    assert.ok(levels.some((level) => level.calibrating));
    assert.equal(controller.rawVoiceActive, false);
    assert.equal(controller.physicalVoiceEpoch, 0);

    // After calibration, a sustained speech-shaped frame can cross the gate.
    samples.splice(0, samples.length, 168, 119, 146, 128);
    for (let frame = 0; frame < 10; frame += 1) { now = 900 + frame * 50; controller.monitorAudio(); }
    assert.equal(controller.audioCalibrationUntil, 0);
    assert.equal(controller.rawVoiceActive, true);
    assert.ok(controller.physicalVoiceEpoch >= 1);
  } finally {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance });
    if (previousRaf) globalThis.requestAnimationFrame = previousRaf;
    else delete globalThis.requestAnimationFrame;
  }
});
