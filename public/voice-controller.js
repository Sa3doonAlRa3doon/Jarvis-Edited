import {
  DEFAULT_VOICE_VOCABULARY, DEFAULT_WAKE_PHRASES, findWakePhrase, isDuplicateCommand,
  normalizeTranscript, normalizeVocabulary, normalizeWakePhrases, recognitionPhraseSpecs,
  selectRecognitionAlternative
} from './voice-utils.js';
import { deviceIdConstraint, getUserMediaWithFallback, normalizeDeviceId } from './media-utils.js';

const Recognition = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const COMMAND_CAPTURE_HARD_LIMIT_MS = 120_000;
const DELAYED_TRANSCRIPT_GRACE_MS = 2_500;
// Browser speech recognition often delivers the final wake transcript several
// seconds after the microphone's VAD peak. Keep this bounded so a stale sound
// cannot authorize a later command, while avoiding false negatives on normal
// speech with network/local recognition latency.
const WAKE_PHYSICAL_VOICE_GRACE_MS = 6_000;
const COMMAND_END_SILENCE_MS = 1_400;
const VAD_ATTACK_MS = 320;
const VAD_RELEASE_MS = 360;
const VAD_TRANSCRIPT_HOLD_MS = 4_000;
const MIC_STARTUP_CALIBRATION_MS = 750;
const AUDIO_RESUME_TIMEOUT_MS = 3_000;
const MIC_NOISE_FLOOR_MIN = .002;
const MIC_NOISE_FLOOR_MAX = .12;
const MIN_PHYSICAL_SPEECH_SCORE = .24;
const VOICE_PROFILE_STORAGE_KEY = 'jarvis.voice-profiles.v1';
const VOICE_PROFILE_MAX = 8;
// Keep the speaker tail from becoming a fresh microphone epoch immediately
// after JARVIS finishes talking. The guard is deliberately short and only
// applies to activation; explicit barge-in can still opt out of it.
const POST_SPEECH_GUARD_MS = 420;

/**
 * Track the room floor without letting long silence erase the last useful
 * calibration. Downward movement is intentionally slow and bounded by a
 * fraction of the saved baseline; upward movement follows a newly louder
 * room more quickly. This is shared with Settings so diagnostics and the
 * always-on listener use the same acoustic policy.
 */
export function stabilizeNoiseFloor(current = .008, baseline = .008, observed = 0, {
  speaking = false, postSpeechGuard = false
} = {}) {
  const safeCurrent = clamp(current, MIC_NOISE_FLOOR_MIN, MIC_NOISE_FLOOR_MAX);
  const safeBaseline = clamp(baseline, MIC_NOISE_FLOOR_MIN, MIC_NOISE_FLOOR_MAX);
  const sample = Number(observed);
  if (!Number.isFinite(sample) || speaking || postSpeechGuard) {
    return { noiseFloor: safeCurrent, baseline: safeBaseline };
  }
  const safeSample = clamp(sample, MIC_NOISE_FLOOR_MIN, MIC_NOISE_FLOOR_MAX);
  const rate = safeSample > safeCurrent ? .04 : .006;
  const nextBaseline = safeSample > safeBaseline
    ? clamp(safeBaseline * .995 + safeSample * .005, MIC_NOISE_FLOOR_MIN, MIC_NOISE_FLOOR_MAX)
    : safeBaseline;
  const nextFloor = clamp(Math.max(
    safeCurrent * (1 - rate) + safeSample * rate,
    nextBaseline * .72
  ), MIC_NOISE_FLOOR_MIN, MIC_NOISE_FLOOR_MAX);
  return { noiseFloor: nextFloor, baseline: nextBaseline };
}

function voiceProfileStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function voiceProfileDeviceKey(deviceId = '') {
  // Device identifiers are browser-scoped values. Store only a short hash so
  // calibration remains local without copying a raw identifier into storage.
  const value = String(deviceId || 'default').trim() || 'default';
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `mic-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function readVoiceProfiles() {
  const storage = voiceProfileStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(VOICE_PROFILE_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch { return {}; }
}

function normalizedVoiceProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const noiseFloor = Number(profile.noiseFloor);
  if (!Number.isFinite(noiseFloor)) return null;
  const signalToNoiseDb = Number(profile.signalToNoiseDb);
  const updatedAt = Number(profile.updatedAt);
  return {
    noiseFloor: clamp(noiseFloor, MIC_NOISE_FLOOR_MIN, MIC_NOISE_FLOOR_MAX),
    signalToNoiseDb: Number.isFinite(signalToNoiseDb) ? clamp(signalToNoiseDb, -60, 60) : 18,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0
  };
}

/**
 * Load one microphone's local acoustic calibration. Only bounded noise/SNR
 * values are stored; audio and raw browser device identifiers never leave the
 * page. A missing or malformed browser storage entry is treated as no profile.
 */
export function loadVoiceProfile(deviceId = '') {
  const profile = normalizedVoiceProfile(readVoiceProfiles()[voiceProfileDeviceKey(deviceId)]);
  return profile ? { ...profile } : null;
}

/**
 * Save one microphone's bounded calibration and retain only the most recent
 * eight devices. This deliberately fails closed when localStorage is blocked.
 */
export function saveVoiceProfile(deviceId = '', { noiseFloor, signalToNoiseDb } = {}) {
  const storage = voiceProfileStorage();
  const normalized = normalizedVoiceProfile({ noiseFloor, signalToNoiseDb, updatedAt: Date.now() });
  if (!storage || !normalized) return false;
  const profiles = readVoiceProfiles();
  profiles[voiceProfileDeviceKey(deviceId)] = normalized;
  const bounded = Object.fromEntries(Object.entries(profiles)
    .map(([key, value]) => [key, normalizedVoiceProfile(value)])
    .filter(([, value]) => value)
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, VOICE_PROFILE_MAX));
  try { storage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(bounded)); return true; }
  catch { return false; }
}

/** Remove only one microphone's local calibration profile. */
export function clearVoiceProfile(deviceId = '') {
  const storage = voiceProfileStorage();
  if (!storage) return false;
  const profiles = readVoiceProfiles();
  const key = voiceProfileDeviceKey(deviceId);
  const existed = Object.prototype.hasOwnProperty.call(profiles, key);
  if (!existed) return false;
  delete profiles[key];
  try { storage.setItem(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(profiles)); return true; }
  catch { return false; }
}

/**
 * Analyse one time-domain analyser frame with the same gate used by the
 * always-on listener. Keeping this pure makes the calibration screen and the
 * live wake listener agree about what counts as speech-shaped input.
 *
 * A high-energy frame alone is not enough: steady hums and device noise can
 * be loud without containing speech. The crest and zero-crossing checks are
 * deliberately conservative, while the crest fallback preserves short,
 * unvoiced consonants (for example "s" and "f").
 */
export function analyzeVoiceFrame(samples, { noiseFloor = .008, sensitivity = .28 } = {}) {
  const frame = samples || [];
  // Browser analyser frames can carry a small DC bias (especially on USB
  // microphones and laptop audio drivers). If it is left in the signal, the
  // bias raises RMS and can make a quiet room look like speech. Keep the
  // tiny fixture frames used by the pure unit tests backwards-compatible,
  // while centring real analyser frames before calculating the gate.
  let rawSum = 0;
  for (let index = 0; index < frame.length; index += 1) rawSum += (Number(frame[index]) - 128) / 128;
  const dcOffset = frame.length >= 32 ? clamp(rawSum / frame.length, -.25, .25) : 0;
  let sum = 0; let peak = 0; let zeroCrossings = 0; let previous = 0;
  for (let index = 0; index < frame.length; index += 1) {
    const value = (Number(frame[index]) - 128) / 128 - dcOffset;
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
    if (index && ((value >= 0 && previous < 0) || (value < 0 && previous >= 0))) zeroCrossings += 1;
    previous = value;
  }
  const rms = frame.length ? Math.sqrt(sum / frame.length) : 0;
  const safeNoiseFloor = Math.max(.0005, Number(noiseFloor) || .008);
  const safeSensitivity = clamp(Number(sensitivity) || .28, .01, .8);
  // The old fixed .14 multiplier made the default .28 profile require an
  // RMS level of .0392 even in a quiet room. That is enough to miss a quiet
  // speaker on a Pi USB mic. Keep the learned room floor authoritative and
  // lower only the fixed sensitivity floor; crest, crossing, and spectrum
  // gates still have to agree before a frame becomes speech-shaped.
  const threshold = Math.max(.008, safeNoiseFloor * 2.6, safeSensitivity * .11);
  const crestFactor = peak / Math.max(rms, .0001);
  const zeroCrossingRatio = zeroCrossings / Math.max(1, frame.length - 1);
  const energyGate = rms > threshold && peak > Math.max(threshold * 1.2, rms * 1.18);
  // Centered real analyser frames can have a higher zero-crossing ratio than
  // the compact fixtures above. Keep a strong crest as the second speech
  // shape signal, but only after the energy gate has already rejected quiet
  // noise.
  const speechCandidate = energyGate && (zeroCrossingRatio < .82 || crestFactor > 1.45);
  const energyScore = clamp((rms / Math.max(threshold, .0001) - 1) / 1.5, 0, 1);
  const shapeScore = clamp((crestFactor - 1.18) / .8, 0, 1);
  const crossingScore = clamp(1 - Math.max(0, zeroCrossingRatio - .55) / .45, 0, 1);
  const speechScore = energyGate
    ? Math.round((energyScore * .55 + shapeScore * .3 + crossingScore * .15) * 100) / 100
    : 0;
  const signalToNoiseDb = Math.round(20 * Math.log10(Math.max(rms, .0001) / safeNoiseFloor) * 10) / 10;
  return { rms, peak, threshold, crestFactor, zeroCrossings, zeroCrossingRatio, dcOffset, signalToNoiseDb, speechScore, speechCandidate };
}

/**
 * Inspect an analyser frequency frame for the narrow low-frequency signature
 * of a fan, HVAC, or motor hum. This is intentionally a conservative reject
 * signal rather than a hard speech classifier: if a browser does not expose
 * frequency data, the time-domain gate remains authoritative.
 */
export function analyzeVoiceSpectrum(bins, { sampleRate = 48_000, fftSize = 2_048 } = {}) {
  const frame = bins || [];
  const safeRate = Number(sampleRate);
  const safeFft = Number(fftSize);
  if (!frame.length || !Number.isFinite(safeRate) || safeRate <= 0 || !Number.isFinite(safeFft) || safeFft <= 0) {
    return { available: false, totalPower: 0, lowBandRatio: 0, speechBandRatio: 0, highBandRatio: 0, lowHum: false };
  }
  let totalPower = 0; let lowPower = 0; let speechPower = 0; let highPower = 0;
  for (let index = 1; index < frame.length; index += 1) {
    const magnitude = clamp(Number(frame[index]) / 255, 0, 1);
    const power = magnitude * magnitude;
    if (!power) continue;
    const frequency = index * safeRate / safeFft;
    totalPower += power;
    if (frequency < 180) lowPower += power;
    else if (frequency <= 4_200) speechPower += power;
    else highPower += power;
  }
  if (!totalPower) return { available: true, totalPower: 0, lowBandRatio: 0, speechBandRatio: 0, highBandRatio: 0, lowHum: false };
  const lowBandRatio = lowPower / totalPower;
  const speechBandRatio = speechPower / totalPower;
  const highBandRatio = highPower / totalPower;
  return {
    available: true, totalPower,
    lowBandRatio: Math.round(lowBandRatio * 100) / 100,
    speechBandRatio: Math.round(speechBandRatio * 100) / 100,
    highBandRatio: Math.round(highBandRatio * 100) / 100,
    lowHum: lowBandRatio >= .82 && speechBandRatio <= .16
  };
}

/**
 * Decide whether a frequency frame contains enough speech-band energy to be
 * eligible for the physical-voice gate.  This is intentionally conservative:
 * when frequency data is unavailable we keep the time-domain gate as the
 * source of truth, but when it is available we reject a near-pure high-band
 * signal (for example a notification chirp, fan whine, or keyboard squeak).
 */
export function isSpeechBandEligible({ available = false, totalPower = 0, speechBandRatio = 0, highBandRatio = 0, lowHum = false } = {}) {
  if (!available || !(Number(totalPower) > 0)) return true;
  if (lowHum) return false;
  const speech = clamp(Number(speechBandRatio), 0, 1);
  const high = clamp(Number(highBandRatio), 0, 1);
  return !(high > .70 && speech < .08);
}

export async function configureRecognitionCapabilities(recognition, RecognitionClass, {
  language = 'en-US', preferLocalRecognition = true, wakePhrases = DEFAULT_WAKE_PHRASES,
  voiceVocabulary = DEFAULT_VOICE_VOCABULARY, timeoutMs = 800, enablePhrases = true
} = {}) {
  let mode = 'browser';
  if (preferLocalRecognition && 'processLocally' in recognition && typeof RecognitionClass?.available === 'function') {
    let timeout = 0;
    try {
      const availability = await Promise.race([
        RecognitionClass.available({ langs: [language], processLocally: true }),
        new Promise((resolve) => { timeout = globalThis.setTimeout(() => resolve('unknown'), timeoutMs); })
      ]);
      if (availability === 'available') { recognition.processLocally = true; mode = 'local'; }
    } catch {}
    finally { globalThis.clearTimeout(timeout); }
  }
  try {
    const PhraseClass = globalThis.SpeechRecognitionPhrase;
    if (enablePhrases && 'phrases' in recognition && typeof PhraseClass === 'function') {
      recognition.phrases = recognitionPhraseSpecs(wakePhrases, voiceVocabulary)
        .map(({ phrase, boost }) => new PhraseClass(phrase, boost));
    }
  } catch {}
  return mode;
}

export function startRecognitionWithTrack(recognition, track) {
  if (track?.readyState === 'live') {
    try { recognition.start(track); return true; }
    catch (error) {
      if (!['TypeError', 'NotSupportedError'].includes(error.name)) throw error;
    }
  }
  recognition.start(); return false;
}

/**
 * Browser autoplay/device policy can leave AudioContext.resume() pending
 * forever instead of rejecting. Keep microphone startup and talkback bounded
 * so a suspended audio device cannot make JARVIS look silently unresponsive.
 */
export async function resumeAudioContext(context, { timeoutMs = AUDIO_RESUME_TIMEOUT_MS } = {}) {
  if (!context || typeof context.resume !== 'function') return false;
  if (context.state === 'running') return true;
  const timeout = Math.max(1, Math.min(15_000, Number(timeoutMs) || AUDIO_RESUME_TIMEOUT_MS));
  let timer = 0;
  try {
    const resumed = await Promise.race([
      Promise.resolve().then(() => context.resume()).then(() => true, () => false),
      new Promise((resolve) => { timer = globalThis.setTimeout(() => resolve(false), timeout); })
    ]);
    return resumed === true;
  } finally {
    if (timer) globalThis.clearTimeout(timer);
  }
}

export class VoiceController {
  constructor({ onState = () => {}, onLevel = () => {}, onWake = () => {}, onCommand = () => {}, onTranscript = () => {}, onCapture = () => {}, onError = () => {} } = {}) {
    this.onState = onState; this.onLevel = onLevel; this.onWake = onWake; this.onCommand = onCommand; this.onTranscript = onTranscript; this.onCapture = onCapture; this.onError = onError;
    this.settings = {}; this.stream = null; this.context = null; this.analyser = null; this.raf = 0; this.recognition = null;
    this.running = false; this.shouldRun = false; this.speaking = false; this.restartTimer = 0; this.restartDelay = 240;
    this.playbackSource = null;
    this.noiseFloor = .008; this.noiseFloorBaseline = .008; this.lastSignalToNoiseDb = 18; this.profileDevice = ''; this.firstClapAt = 0; this.clapAbove = false; this.clapCooldownUntil = 0;
    this.armedUntil = 0; this.lastWakeAt = 0; this.lastCommand = ''; this.lastCommandAt = 0; this.pending = []; this.commandTimer = 0;
    this.commandCaptureActive = false; this.commandCaptureStarted = false; this.captureTimer = 0; this.captureFinalizeTimer = 0;
    this.captureInterim = ''; this.captureTimeoutMs = 15_000; this.captureHardDeadline = 0; this.captureVoiceActive = false;
    this.vadCandidateSince = 0; this.vadQuietSince = 0; this.lastSpeechSignalAt = 0; this.lastRawVoiceAt = 0;
    this.rawVoiceCandidateSince = 0; this.rawVoiceQuietSince = 0; this.rawVoiceActive = false;
    this.audioCalibrationUntil = 0; this.noiseFloorSamples = [];
    // Each speech-shaped onset gets a monotonically increasing evidence epoch.
    // A browser provider can replay buffered text after recognition restarts;
    // tying command capture to a fresh epoch prevents that stale text from
    // becoming a command just because an older audio timestamp is recent.
    this.physicalVoiceEpoch = 0; this.lastPhysicalVoiceOnsetAt = 0; this.lastPhysicalSpeechScore = null;
    this.captureStartedAt = 0; this.captureVoiceEpoch = 0;
    this.postSpeechGuardUntil = 0;
    this.lastLevel = 0; this.lastVoiceState = false; this.audioSamples = null; this.frequencySamples = null; this.preparingRecognition = false;
    this.recognitionMode = 'browser'; this.localRecognitionDisabled = false; this.phraseBiasDisabled = false;
    this.networkErrors = 0; this.recognitionUnavailable = false;
  }

  configure(settings = {}) {
    this.settings = {
      browserMicrophone: '', wakeWord: true, doubleClap: true, wakePhrases: DEFAULT_WAKE_PHRASES,
      wakeSensitivity: .72, recognitionConfidence: .55, commandSilenceMs: 700, micSensitivity: .28,
      clapSensitivity: .34, doubleClapWindow: 700, echoCancellation: true, noiseSuppression: true,
      autoGainControl: true, voiceLanguage: 'en-US', bargeIn: false, preferLocalRecognition: true,
      voiceVocabulary: DEFAULT_VOICE_VOCABULARY, ...settings
    };
    this.settings.wakePhrases = normalizeWakePhrases(this.settings.wakePhrases);
    this.settings.voiceVocabulary = normalizeVocabulary(this.settings.voiceVocabulary);
    this.settings.browserMicrophone = normalizeDeviceId(this.settings.browserMicrophone);
    if (this.recognition) this.recognition.lang = this.settings.voiceLanguage;
  }

  async start(settings = this.settings) {
    this.configure(settings);
    if (this.running) return;
    this.networkErrors = 0; this.recognitionUnavailable = false;
    // A different microphone can have a very different idle level. Never
    // carry a learned floor from a previous device or browser session.
    this.noiseFloor = .008; this.noiseFloorBaseline = .008; this.lastSignalToNoiseDb = 18; this.profileDevice = ''; this.lastVoiceState = false; this.lastLevel = 0;
    this.rawVoiceCandidateSince = 0; this.rawVoiceQuietSince = 0; this.rawVoiceActive = false; this.lastRawVoiceAt = 0;
    this.audioCalibrationUntil = 0; this.noiseFloorSamples = []; this.frequencySamples = null;
    this.physicalVoiceEpoch = 0; this.lastPhysicalVoiceOnsetAt = 0; this.lastPhysicalSpeechScore = null;
    this.postSpeechGuardUntil = 0;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is not available in this browser.');
    const audio = {
      deviceId: deviceIdConstraint(this.settings.browserMicrophone),
      channelCount: { ideal: 1 }, sampleRate: { ideal: 16000 }, sampleSize: { ideal: 16 },
      echoCancellation: this.settings.echoCancellation !== false,
      noiseSuppression: this.settings.noiseSuppression !== false,
      autoGainControl: this.settings.autoGainControl !== false
    };
    const opened = await getUserMediaWithFallback(navigator.mediaDevices, { audio, video: false });
    this.stream = opened.stream;
    let activeDeviceId = this.settings.browserMicrophone;
    try { activeDeviceId = normalizeDeviceId(this.stream.getAudioTracks()[0]?.getSettings?.().deviceId) || activeDeviceId; } catch {}
    this.profileDevice = activeDeviceId;
    const profile = loadVoiceProfile(this.profileDevice);
    if (profile) { this.noiseFloor = profile.noiseFloor; this.noiseFloorBaseline = profile.noiseFloor; this.lastSignalToNoiseDb = profile.signalToNoiseDb; }
    if (opened.fallbackUsed) {
      this.settings.browserMicrophone = '';
      this.onState('microphone-default');
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.stream.getTracks().forEach((track) => track.stop()); this.stream = null;
      throw new Error('This browser cannot expose a physical audio analyser. Use a supported desktop browser for accurate JARVIS wake detection.');
    }
    try {
      if (!this.context || this.context.state === 'closed') this.context = new AudioContextClass({ latencyHint: 'interactive' });
      if (!await resumeAudioContext(this.context)) throw new Error('Browser audio is suspended. Click the JARVIS screen once, then start the microphone again.');
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = .28;
      this.context.createMediaStreamSource(this.stream).connect(this.analyser);
      this.audioCalibrationUntil = performance.now() + MIC_STARTUP_CALIBRATION_MS;
      this.noiseFloorSamples = [];
      this.monitorAudio();
    } catch (error) {
      this.stream.getTracks().forEach((track) => track.stop()); this.stream = null; this.analyser = null;
      throw error;
    }
    this.shouldRun = true; this.running = true; this.restartDelay = 240; void this.startRecognition(); this.onState('listening');
  }

  async autoStartIfGranted(settings = this.settings) {
    this.configure(settings);
    if (!this.settings.voiceAutoStart || this.running) return false;
    let permission = null;
    try {
      if (navigator.permissions?.query) permission = await navigator.permissions.query({ name: 'microphone' });
      // A prompt is a valid first-run state: getUserMedia will ask once and
      // then future page loads can start silently. Never retry a denied grant.
      if (permission?.state === 'denied') return false;
      await this.start(); return true;
    } catch (error) {
      // Surface first-run/unsupported-browser failures instead of leaving the
      // user with an apparently armed but inert wake listener.
      if (permission?.state !== 'denied') this.onError(error);
      return false;
    }
  }

  async startRecognition() {
    if (!this.shouldRun || this.recognitionUnavailable || this.speaking && !this.settings.bargeIn || this.recognition || this.preparingRecognition) return;
    const RecognitionClass = Recognition();
    if (!RecognitionClass) {
      this.onState('audio-only');
    this.onError(new Error('Speech recognition is unavailable in this browser. Use a supported dashboard browser, or install the on-device language pack in /settings.'));
      return;
    }
    this.preparingRecognition = true;
    let recognition;
    try { recognition = new RecognitionClass(); }
    catch (error) {
      this.preparingRecognition = false; this.onError(error); this.scheduleRecognitionRestart(); return;
    }
    recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 5; recognition.lang = this.settings.voiceLanguage || 'en-US';
    recognition.onstart = () => { this.restartDelay = 240; this.onState('listening'); };
    recognition.onspeechstart = () => {
      const recentPhysicalVoice = this.hasRecentPhysicalVoice();
      if (recentPhysicalVoice) {
        this.markCommandSpeech();
        if (this.commandCaptureActive) this.updateCommandVoiceActivity(true);
        this.onState('hearing');
      } else {
        // Browser recognition can announce speech-shaped input from a stale
        // provider buffer or another tab. Do not make the HUD claim that the
        // user is speaking unless this controller also saw physical mic energy.
        this.onState(this.commandCaptureActive ? 'armed' : 'listening');
      }
    };
    recognition.onspeechend = () => {
      if (this.commandCaptureActive) this.updateCommandVoiceActivity(false);
      this.onState(this.commandCaptureActive ? 'armed' : 'listening');
    };
    recognition.onresult = (event) => this.handleRecognitionResult(event);
    recognition.onerror = (event) => {
      if (event.error === 'phrases-not-supported') {
        this.phraseBiasDisabled = true;
        try { recognition.phrases = []; } catch {}
        this.onState('listening');
        return;
      }
      if (event.error === 'network') {
        this.networkErrors += 1;
        if (this.networkErrors >= 3) {
          this.recognitionUnavailable = true;
          clearTimeout(this.restartTimer);
          this.onError(new Error('Speech provider is offline. Install the on-device language pack in /settings; camera, microphone level, and double-clap still work locally.'));
          this.onState('audio-only');
        }
        return;
      }
      if (event.error === 'language-not-supported' && this.recognitionMode === 'local') {
        this.localRecognitionDisabled = true; this.recognitionMode = 'browser';
        return;
      }
      const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error);
      if (fatal) {
        this.shouldRun = false;
        void this.stop().then(() => this.onError(new Error(`Speech recognition ${event.error.replaceAll('-', ' ')}.`)));
      }
      else if (!['aborted', 'no-speech'].includes(event.error)) this.onError(new Error(`Speech recognition ${event.error}.`));
    };
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null;
      if (this.shouldRun && !this.recognitionUnavailable && (!this.speaking || this.settings.bargeIn)) this.scheduleRecognitionRestart();
    };
    this.recognition = recognition;
    this.recognitionMode = await configureRecognitionCapabilities(recognition, RecognitionClass, {
      language: recognition.lang,
      preferLocalRecognition: this.settings.preferLocalRecognition && !this.localRecognitionDisabled,
      wakePhrases: this.settings.wakePhrases,
      voiceVocabulary: this.settings.voiceVocabulary,
      enablePhrases: !this.phraseBiasDisabled
    });
    this.preparingRecognition = false;
    if (!this.shouldRun || this.recognition !== recognition || this.speaking && !this.settings.bargeIn) {
      if (this.recognition === recognition) this.recognition = null;
      return;
    }
    try {
      const track = this.stream?.getAudioTracks?.()[0];
      startRecognitionWithTrack(recognition, track);
    } catch (error) {
      if (this.recognition === recognition) this.recognition = null;
      this.scheduleRecognitionRestart();
      if (error.name !== 'InvalidStateError') this.onError(error);
    }
  }

  scheduleRecognitionRestart() {
    clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => void this.startRecognition(), this.restartDelay);
    this.restartDelay = Math.min(4200, Math.round(this.restartDelay * 1.7));
  }

  handleRecognitionResult(event) {
    this.networkErrors = 0;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternatives = Array.from({ length: result.length }, (_, alternativeIndex) => result[alternativeIndex]);
      const armed = Date.now() < this.armedUntil;
      const selected = selectRecognitionAlternative(alternatives, {
        wakePhrases: this.settings.wakePhrases, wakeSensitivity: this.settings.wakeSensitivity,
        recognitionConfidence: this.settings.recognitionConfidence, preferWake: this.settings.wakeWord && !armed
      });
      const recentPhysicalVoice = this.hasRecentPhysicalVoice();
      const freshCaptureVoice = !this.commandCaptureActive || this.hasFreshCaptureVoice();
      const physicallyAccepted = selected.accepted && recentPhysicalVoice && freshCaptureVoice;
      this.onTranscript({ text: selected.transcript, final: result.isFinal, confidence: selected.confidence, accepted: physicallyAccepted });
      if (this.commandCaptureActive && physicallyAccepted && selected.transcript) {
        this.captureInterim = normalizeTranscript(selected.transcript);
        this.markCommandSpeech();
        this.onCapture({ state: result.isFinal ? 'final' : 'transcript', text: selected.transcript, confidence: selected.confidence });
      }
      if (!physicallyAccepted || this.speaking && !this.settings.bargeIn) continue;
      const wake = selected.wake || findWakePhrase(selected.transcript, this.settings.wakePhrases, this.settings.wakeSensitivity);
      if (!this.commandCaptureActive && result.isFinal && this.settings.wakeWord && wake.detected && wake.start === 0 && recentPhysicalVoice) {
        this.arm(wake);
        continue;
      }
      if (!result.isFinal) continue;
      if (this.commandCaptureActive || !this.settings.wakeWord || armed) this.queueCommand(selected.transcript);
    }
  }

  arm(wake = { phrase: 'jarvis', score: 1, kind: 'wake_word' }) {
    const now = Date.now(); this.armedUntil = now + 30_000;
    if (now - this.lastWakeAt > 1200) { this.lastWakeAt = now; this.onWake({ kind: wake.kind || 'wake_word', phrase: wake.phrase, score: wake.score, command: normalizeTranscript(wake.command) }); }
    this.onState('armed');
  }

  hasRecentPhysicalVoice(now = performance.now(), graceMs = WAKE_PHYSICAL_VOICE_GRACE_MS) {
    // Provider speech recognition is not evidence that this microphone heard
    // anything. If the analyser could not be created (for example, an audio
    // context was blocked), fail closed instead of allowing a stale/provider
    // transcript to wake JARVIS or become a command.
    const speechScore = this.lastPhysicalSpeechScore;
    const speechShapeAccepted = speechScore == null || Number(speechScore) >= MIN_PHYSICAL_SPEECH_SCORE;
    return Boolean(this.analyser && this.lastRawVoiceAt > 0 && now - this.lastRawVoiceAt <= graceMs && speechShapeAccepted);
  }

  hasFreshCaptureVoice(now = performance.now()) {
    if (!this.commandCaptureActive || !this.analyser) return true;
    if (!this.hasRecentPhysicalVoice(now)) return false;
    return this.physicalVoiceEpoch > this.captureVoiceEpoch
      || this.captureVoiceActive
      || this.lastPhysicalVoiceOnsetAt >= this.captureStartedAt;
  }

  beginCommandCapture(timeoutMs = 15_000) {
    clearTimeout(this.captureTimer); clearTimeout(this.captureFinalizeTimer); clearTimeout(this.commandTimer);
    this.pending = []; this.captureInterim = ''; this.commandCaptureStarted = false; this.commandCaptureActive = true; this.captureVoiceActive = false;
    this.captureStartedAt = performance.now(); this.captureVoiceEpoch = this.physicalVoiceEpoch;
    this.vadCandidateSince = 0; this.vadQuietSince = 0; this.lastSpeechSignalAt = 0; this.lastRawVoiceAt = 0;
    this.rawVoiceCandidateSince = 0; this.rawVoiceQuietSince = 0; this.rawVoiceActive = false;
    this.captureTimeoutMs = clamp(Number(timeoutMs) || 15_000, 5_000, 30_000);
    this.captureHardDeadline = 0; this.armedUntil = Date.now() + this.captureTimeoutMs;
    this.captureTimer = window.setTimeout(() => this.finishCommandCapture('timeout'), this.captureTimeoutMs);
    this.onCapture({ state: 'listening', timeoutMs: this.captureTimeoutMs }); this.onState('armed');
    if (this.shouldRun && !this.speaking) void this.startRecognition();
  }

  markCommandSpeech() {
    if (!this.commandCaptureActive) return;
    this.lastSpeechSignalAt = performance.now();
    if (!this.commandCaptureStarted) {
      this.commandCaptureStarted = true; clearTimeout(this.captureTimer);
      this.captureHardDeadline = Date.now() + COMMAND_CAPTURE_HARD_LIMIT_MS; this.armedUntil = this.captureHardDeadline;
      this.captureTimer = window.setTimeout(() => this.handleCommandCaptureDeadline(), COMMAND_CAPTURE_HARD_LIMIT_MS);
    }
    clearTimeout(this.captureFinalizeTimer); this.captureFinalizeTimer = 0;
    this.onCapture({ state: 'hearing', text: this.captureInterim });
  }

  updateCommandVoiceActivity(active) {
    if (!this.commandCaptureActive) return;
    const next = Boolean(active); const changed = next !== this.captureVoiceActive;
    this.captureVoiceActive = next;
    if (next) {
      clearTimeout(this.commandTimer); this.commandTimer = 0;
      if (changed || !this.commandCaptureStarted) this.markCommandSpeech();
      return;
    }
    if (changed && this.commandCaptureStarted) this.scheduleCommandFinalize();
  }

  updateRawCommandVoiceActivity(active, now = performance.now()) {
    if (!this.commandCaptureActive) return;
    if (!active) {
      this.vadCandidateSince = 0;
      if (!this.captureVoiceActive) { this.vadQuietSince = 0; return; }
      if (!this.vadQuietSince) this.vadQuietSince = now;
      if (now - this.vadQuietSince >= VAD_RELEASE_MS) {
        this.vadQuietSince = 0;
        this.updateCommandVoiceActivity(false);
      }
      return;
    }
    this.vadQuietSince = 0;
    if (!this.commandCaptureStarted || !this.lastSpeechSignalAt || now - this.lastSpeechSignalAt > VAD_TRANSCRIPT_HOLD_MS) {
      this.vadCandidateSince = 0;
      if (this.captureVoiceActive) this.updateCommandVoiceActivity(false);
      return;
    }
    if (!this.vadCandidateSince) this.vadCandidateSince = now;
    if (!this.captureVoiceActive && now - this.vadCandidateSince >= VAD_ATTACK_MS) this.updateCommandVoiceActivity(true);
  }

  scheduleCommandFinalize() {
    if (!this.commandCaptureActive) return;
    clearTimeout(this.captureFinalizeTimer);
    if (this.captureVoiceActive) { this.captureFinalizeTimer = 0; return; }
    const hasTranscript = Boolean(this.pending.length || this.captureInterim);
    const delay = hasTranscript
      ? Math.max(COMMAND_END_SILENCE_MS, clamp(this.settings.commandSilenceMs, 500, 1800))
      : Math.max(DELAYED_TRANSCRIPT_GRACE_MS, clamp(this.settings.commandSilenceMs, 500, 1800));
    this.captureFinalizeTimer = window.setTimeout(() => {
      if (!this.commandCaptureActive) return;
      if (this.pending.length) { this.flushCommand(); return; }
      if (this.captureInterim) { this.pending.push(this.captureInterim); this.flushCommand(); return; }
      this.commandCaptureStarted = false; clearTimeout(this.captureTimer);
      this.captureTimer = window.setTimeout(() => this.finishCommandCapture('timeout'), this.captureTimeoutMs);
      this.onCapture({ state: 'retry', timeoutMs: this.captureTimeoutMs });
    }, delay);
  }

  handleCommandCaptureDeadline() {
    if (!this.commandCaptureActive) return;
    if (this.pending.length) { this.flushCommand(); return; }
    if (this.captureInterim) { this.pending.push(this.captureInterim); this.flushCommand(); return; }
    this.finishCommandCapture('timeout');
  }

  finishCommandCapture(reason = 'cancelled', text = '') {
    if (!this.commandCaptureActive && reason !== 'complete') return;
    this.commandCaptureActive = false; this.commandCaptureStarted = false; this.captureVoiceActive = false; this.armedUntil = 0;
    this.vadCandidateSince = 0; this.vadQuietSince = 0; this.lastSpeechSignalAt = 0;
    this.rawVoiceCandidateSince = 0; this.rawVoiceQuietSince = 0; this.rawVoiceActive = false;
    clearTimeout(this.captureTimer); clearTimeout(this.captureFinalizeTimer); clearTimeout(this.commandTimer);
    this.captureTimer = 0; this.captureFinalizeTimer = 0; this.commandTimer = 0; this.captureHardDeadline = 0; this.captureInterim = '';
    this.captureStartedAt = 0; this.captureVoiceEpoch = this.physicalVoiceEpoch;
    if (reason !== 'complete') this.pending = [];
    this.onCapture({ state: reason, text });
    this.onState(this.shouldRun ? 'listening' : 'standby');
  }

  cancelCommandCapture(reason = 'cancelled') { this.finishCommandCapture(reason); }

  queueCommand(value) {
    const text = normalizeTranscript(value);
    if (!text) return;
    if (this.commandCaptureActive) this.markCommandSpeech();
    this.pending.push(text); clearTimeout(this.commandTimer);
    if (!this.commandCaptureActive || !this.captureVoiceActive) {
      const delay = this.commandCaptureActive
        ? Math.max(COMMAND_END_SILENCE_MS, clamp(this.settings.commandSilenceMs, 300, 1800))
        : clamp(this.settings.commandSilenceMs, 300, 1800);
      this.commandTimer = window.setTimeout(() => this.flushCommand(), delay);
    }
  }

  flushCommand() {
    const command = normalizeTranscript(this.pending.join(' ')); this.pending = [];
    if (!command) return;
    const now = Date.now();
    if (isDuplicateCommand(command, this.lastCommand, now - this.lastCommandAt)) return;
    this.lastCommand = command; this.lastCommandAt = now; this.armedUntil = 0;
    if (this.commandCaptureActive) this.finishCommandCapture('complete', command);
    this.onState('processing'); this.onCommand(command);
  }

  monitorAudio = () => {
    if (!this.analyser) return;
    if (!this.audioSamples || this.audioSamples.length !== this.analyser.fftSize) this.audioSamples = new Uint8Array(this.analyser.fftSize);
    const samples = this.audioSamples; this.analyser.getByteTimeDomainData(samples);
    const now = performance.now();
    const analysis = analyzeVoiceFrame(samples, { noiseFloor: this.noiseFloor, sensitivity: this.settings.micSensitivity });
    if (Number.isFinite(analysis.signalToNoiseDb)) this.lastSignalToNoiseDb = analysis.signalToNoiseDb;
    const { rms, peak, threshold: vadThreshold } = analysis;
    const calibrating = this.audioCalibrationUntil > 0 && now < this.audioCalibrationUntil;
    if (calibrating) {
      // Learn the room/device floor from non-speech frames. Use a high
      // percentile rather than a single peak so a short click does not raise
      // the gate permanently, while a fan or USB gain floor is still covered.
      if (!analysis.speechCandidate && Number.isFinite(rms)) {
        this.noiseFloorSamples.push(rms);
        if (this.noiseFloorSamples.length > 24) this.noiseFloorSamples.shift();
        const ordered = [...this.noiseFloorSamples].sort((left, right) => left - right);
        const percentile = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * .75))] || rms;
        this.noiseFloor = clamp(this.noiseFloor * .8 + percentile * .2, MIC_NOISE_FLOOR_MIN, MIC_NOISE_FLOOR_MAX);
      }
      const shown = Math.min(1, rms / Math.max(.035, vadThreshold * 2.4));
      this.onLevel({ level: shown, rms, peak, noiseFloor: this.noiseFloor, voiceActive: false, speechCandidate: false,
        speechScore: 0, signalToNoiseDb: analysis.signalToNoiseDb, crestFactor: analysis.crestFactor,
        zeroCrossingRatio: analysis.zeroCrossingRatio, dcOffset: analysis.dcOffset, physicalVoiceEpoch: this.physicalVoiceEpoch,
        lastPhysicalVoiceOnsetAt: this.lastPhysicalVoiceOnsetAt, captureFresh: false, calibrating: true });
      this.lastVoiceState = false; this.lastLevel = rms; this.raf = requestAnimationFrame(this.monitorAudio); return;
    }
    if (this.audioCalibrationUntil) {
      this.audioCalibrationUntil = 0;
      if (this.noiseFloorSamples.length >= 4) {
        const ordered = [...this.noiseFloorSamples].sort((left, right) => left - right);
        const percentile = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * .75))];
        // Keep headroom for speech above a loud but steady room floor. The
        // normal gate already multiplies this estimate by 2.6, so adding a
        // further safety multiplier here would suppress quiet speakers.
        this.noiseFloor = clamp(Math.max(this.noiseFloor, percentile * .8), MIC_NOISE_FLOOR_MIN, MIC_NOISE_FLOOR_MAX);
        this.noiseFloorBaseline = this.noiseFloor;
      }
      this.noiseFloorSamples = [];
    }
    // Require a speech-shaped transient to stay above the adaptive floor for
    // several analyser frames. This rejects fans, keyboard rumble, and a
    // single loud sample while retaining normal speech and the clap detector.
    let spectrum = { available: false, totalPower: 0, lowBandRatio: 0, speechBandRatio: 0, highBandRatio: 0, lowHum: false };
    if (typeof this.analyser.getByteFrequencyData === 'function') {
      const frequencyLength = Number(this.analyser.frequencyBinCount) || Math.floor(Number(this.analyser.fftSize || 0) / 2);
      if (frequencyLength > 0) {
        if (!this.frequencySamples || this.frequencySamples.length !== frequencyLength) this.frequencySamples = new Uint8Array(frequencyLength);
        try {
          this.analyser.getByteFrequencyData(this.frequencySamples);
          spectrum = analyzeVoiceSpectrum(this.frequencySamples, { sampleRate: this.context?.sampleRate || 48_000, fftSize: this.analyser.fftSize || frequencyLength * 2 });
        } catch {}
      }
    }
    const postSpeechGuard = now < this.postSpeechGuardUntil || (this.speaking && !this.settings.bargeIn);
    const spectrumSpeechEligible = isSpeechBandEligible(spectrum);
    const speechCandidate = !postSpeechGuard && analysis.speechCandidate && spectrumSpeechEligible;
    const speechScore = spectrumSpeechEligible ? analysis.speechScore : Math.min(analysis.speechScore, .1);
    if (speechCandidate) {
      this.rawVoiceQuietSince = 0;
      if (!this.rawVoiceCandidateSince) this.rawVoiceCandidateSince = now;
      if (!this.rawVoiceActive && now - this.rawVoiceCandidateSince >= VAD_ATTACK_MS) {
        this.rawVoiceActive = true;
        this.physicalVoiceEpoch += 1;
        this.lastPhysicalVoiceOnsetAt = now;
      }
    } else {
      this.rawVoiceCandidateSince = 0;
      if (this.rawVoiceActive) {
        if (!this.rawVoiceQuietSince) this.rawVoiceQuietSince = now;
        if (now - this.rawVoiceQuietSince >= VAD_RELEASE_MS) { this.rawVoiceActive = false; this.rawVoiceQuietSince = 0; }
      }
    }
    const voiceActive = this.rawVoiceActive;
    if (voiceActive) {
      this.lastRawVoiceAt = now;
      this.lastPhysicalSpeechScore = speechScore;
    }
    const floorUpdate = stabilizeNoiseFloor(this.noiseFloor, this.noiseFloorBaseline, rms, { speaking: speechCandidate, postSpeechGuard });
    this.noiseFloor = floorUpdate.noiseFloor; this.noiseFloorBaseline = floorUpdate.baseline;
    const shown = Math.min(1, rms / Math.max(.035, vadThreshold * 2.4)); this.onLevel({ level: shown, rms, peak, noiseFloor: this.noiseFloor, noiseFloorBaseline: this.noiseFloorBaseline, voiceActive, speechCandidate, speechScore, signalToNoiseDb: analysis.signalToNoiseDb, crestFactor: analysis.crestFactor, zeroCrossingRatio: analysis.zeroCrossingRatio, dcOffset: analysis.dcOffset, lowBandRatio: spectrum.lowBandRatio, speechBandRatio: spectrum.speechBandRatio, lowHum: spectrum.lowHum, postSpeechGuard, physicalVoiceEpoch: this.physicalVoiceEpoch, lastPhysicalVoiceOnsetAt: this.lastPhysicalVoiceOnsetAt, captureFresh: this.hasFreshCaptureVoice() });
    if (this.commandCaptureActive) this.updateRawCommandVoiceActivity(voiceActive, now);
    if (voiceActive !== this.lastVoiceState) { this.lastVoiceState = voiceActive; this.onState(voiceActive ? 'hearing' : Date.now() < this.armedUntil ? 'armed' : 'listening'); }

    const clapThreshold = Math.max(Number(this.settings.clapSensitivity || .34), this.noiseFloor * 7.5);
    const impulse = !postSpeechGuard && rms > clapThreshold && peak > Math.min(1, clapThreshold * 1.55) && rms > this.lastLevel * 1.32;
    if (this.settings.doubleClap && impulse && !this.clapAbove && now >= this.clapCooldownUntil) {
      this.clapAbove = true;
      if (this.firstClapAt && now - this.firstClapAt <= Number(this.settings.doubleClapWindow || 700)) {
        this.firstClapAt = 0; this.clapCooldownUntil = now + 1100; this.arm({ kind: 'double_clap', phrase: 'double clap', score: Math.min(1, rms) });
      } else this.firstClapAt = now;
    }
    if (rms < clapThreshold * .52) this.clapAbove = false;
    if (this.firstClapAt && now - this.firstClapAt > Number(this.settings.doubleClapWindow || 700)) this.firstClapAt = 0;
    this.lastLevel = rms; this.raf = requestAnimationFrame(this.monitorAudio);
  };

  setSpeaking(active) {
    this.speaking = Boolean(active);
    const now = performance.now();
    if (this.speaking && this.settings.bargeIn) this.postSpeechGuardUntil = now;
    else this.postSpeechGuardUntil = Math.max(this.postSpeechGuardUntil, now + (this.speaking ? 240 : POST_SPEECH_GUARD_MS));
    if (this.speaking) {
      this.onState('speaking');
      if (!this.settings.bargeIn) { clearTimeout(this.restartTimer); try { this.recognition?.abort(); } catch {} }
    } else if (this.shouldRun) {
      this.onState(this.commandCaptureActive ? 'armed' : 'listening'); this.restartDelay = 240; void this.startRecognition();
    }
  }

  async primeAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    if (!this.context || this.context.state === 'closed') this.context = new AudioContextClass({ latencyHint: 'interactive' });
    if (this.context.state !== 'running' && !await resumeAudioContext(this.context)) return false;
    if (this.context.state !== 'running') return false;
    const source = this.context.createBufferSource();
    source.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    source.connect(this.context.destination); source.start(0);
    return true;
  }

  async playAudio(arrayBuffer, volume = 1) {
    if (!await this.primeAudio()) {
      const error = new Error('Browser audio needs one click on the JARVIS screen before it can speak.');
      error.name = 'NotAllowedError'; throw error;
    }
    const decoded = await this.context.decodeAudioData(arrayBuffer.slice(0));
    try { this.playbackSource?.stop(); } catch {}
    const source = this.context.createBufferSource(); const gain = this.context.createGain();
    source.buffer = decoded; gain.gain.value = clamp(volume, 0, 1); source.connect(gain).connect(this.context.destination);
    this.playbackSource = source;
    await new Promise((resolve, reject) => {
      source.onended = resolve;
      try { source.start(0); }
      catch (error) { reject(error); }
    });
    if (this.playbackSource === source) this.playbackSource = null;
  }

  async stop() {
    if (this.running && this.profileDevice) saveVoiceProfile(this.profileDevice, { noiseFloor: this.noiseFloor, signalToNoiseDb: this.lastSignalToNoiseDb });
    this.shouldRun = false; this.running = false; this.speaking = false;
    if (this.commandCaptureActive) this.finishCommandCapture('cancelled');
    clearTimeout(this.restartTimer); clearTimeout(this.commandTimer); clearTimeout(this.captureTimer); clearTimeout(this.captureFinalizeTimer); cancelAnimationFrame(this.raf);
    try { this.recognition?.abort(); } catch {}
    try { this.playbackSource?.stop(); } catch {}
    this.playbackSource = null;
    this.recognition = null; this.preparingRecognition = false; this.pending = []; this.commandCaptureActive = false; this.captureVoiceActive = false; this.captureInterim = '';
    this.vadCandidateSince = 0; this.vadQuietSince = 0; this.lastSpeechSignalAt = 0;
    this.rawVoiceCandidateSince = 0; this.rawVoiceQuietSince = 0; this.rawVoiceActive = false; this.lastRawVoiceAt = 0;
    this.captureStartedAt = 0; this.captureVoiceEpoch = this.physicalVoiceEpoch;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null; this.analyser = null; this.audioSamples = null; this.frequencySamples = null;
    this.audioCalibrationUntil = 0; this.noiseFloorSamples = []; this.postSpeechGuardUntil = 0; this.profileDevice = '';
    this.networkErrors = 0; this.recognitionUnavailable = false; this.lastPhysicalSpeechScore = null;
    if (this.context) await this.context.close().catch(() => {});
    this.context = null; this.onLevel({ level: 0, rms: 0, peak: 0, noiseFloor: this.noiseFloor, noiseFloorBaseline: this.noiseFloorBaseline, signalToNoiseDb: this.lastSignalToNoiseDb, voiceActive: false, dcOffset: 0, physicalVoiceEpoch: this.physicalVoiceEpoch, lastPhysicalVoiceOnsetAt: this.lastPhysicalVoiceOnsetAt, captureFresh: false }); this.onState('standby');
  }

  async toggle(settings = this.settings) { if (this.running) await this.stop(); else await this.start(settings); }
  get active() { return this.running; }
  get recognitionAvailable() { return Boolean(Recognition()); }
}
