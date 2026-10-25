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
const COMMAND_END_SILENCE_MS = 1_400;
const VAD_ATTACK_MS = 320;
const VAD_RELEASE_MS = 360;
const VAD_TRANSCRIPT_HOLD_MS = 4_000;

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

export class VoiceController {
  constructor({ onState = () => {}, onLevel = () => {}, onWake = () => {}, onCommand = () => {}, onTranscript = () => {}, onCapture = () => {}, onError = () => {} } = {}) {
    this.onState = onState; this.onLevel = onLevel; this.onWake = onWake; this.onCommand = onCommand; this.onTranscript = onTranscript; this.onCapture = onCapture; this.onError = onError;
    this.settings = {}; this.stream = null; this.context = null; this.analyser = null; this.raf = 0; this.recognition = null;
    this.running = false; this.shouldRun = false; this.speaking = false; this.restartTimer = 0; this.restartDelay = 240;
    this.playbackSource = null;
    this.noiseFloor = .008; this.firstClapAt = 0; this.clapAbove = false; this.clapCooldownUntil = 0;
    this.armedUntil = 0; this.lastWakeAt = 0; this.lastCommand = ''; this.lastCommandAt = 0; this.pending = []; this.commandTimer = 0;
    this.commandCaptureActive = false; this.commandCaptureStarted = false; this.captureTimer = 0; this.captureFinalizeTimer = 0;
    this.captureInterim = ''; this.captureTimeoutMs = 15_000; this.captureHardDeadline = 0; this.captureVoiceActive = false;
    this.vadCandidateSince = 0; this.vadQuietSince = 0; this.lastSpeechSignalAt = 0; this.lastRawVoiceAt = 0;
    this.lastLevel = 0; this.lastVoiceState = false; this.audioSamples = null; this.preparingRecognition = false;
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
    if (opened.fallbackUsed) {
      this.settings.browserMicrophone = '';
      this.onState('microphone-default');
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!this.context || this.context.state === 'closed') this.context = new AudioContextClass({ latencyHint: 'interactive' });
      await this.context.resume();
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = .28;
      this.context.createMediaStreamSource(this.stream).connect(this.analyser); this.monitorAudio();
    }
    this.shouldRun = true; this.running = true; this.restartDelay = 240; void this.startRecognition(); this.onState('listening');
  }

  async autoStartIfGranted(settings = this.settings) {
    this.configure(settings);
    if (!this.settings.voiceAutoStart || this.running || !navigator.permissions?.query) return false;
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' });
      if (permission.state !== 'granted') return false;
      await this.start(); return true;
    } catch { return false; }
  }

  async startRecognition() {
    if (!this.shouldRun || this.recognitionUnavailable || this.speaking && !this.settings.bargeIn || this.recognition || this.preparingRecognition) return;
    const RecognitionClass = Recognition();
    if (!RecognitionClass) { this.onState('audio-only'); return; }
    this.preparingRecognition = true;
    let recognition;
    try { recognition = new RecognitionClass(); }
    catch (error) {
      this.preparingRecognition = false; this.onError(error); this.scheduleRecognitionRestart(); return;
    }
    recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 5; recognition.lang = this.settings.voiceLanguage || 'en-US';
    recognition.onstart = () => { this.restartDelay = 240; this.onState('listening'); };
    recognition.onspeechstart = () => {
      const recentPhysicalVoice = !this.analyser || this.lastRawVoiceAt > 0 && performance.now() - this.lastRawVoiceAt <= 2500;
      if (recentPhysicalVoice) {
        this.markCommandSpeech();
        if (this.commandCaptureActive) this.updateCommandVoiceActivity(true);
      }
      this.onState('hearing');
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
      const recentPhysicalVoice = !this.analyser || this.lastRawVoiceAt > 0 && performance.now() - this.lastRawVoiceAt <= 2500;
      const physicallyAccepted = selected.accepted && recentPhysicalVoice;
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

  beginCommandCapture(timeoutMs = 15_000) {
    clearTimeout(this.captureTimer); clearTimeout(this.captureFinalizeTimer); clearTimeout(this.commandTimer);
    this.pending = []; this.captureInterim = ''; this.commandCaptureStarted = false; this.commandCaptureActive = true; this.captureVoiceActive = false;
    this.vadCandidateSince = 0; this.vadQuietSince = 0; this.lastSpeechSignalAt = 0; this.lastRawVoiceAt = 0;
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
    clearTimeout(this.captureTimer); clearTimeout(this.captureFinalizeTimer); clearTimeout(this.commandTimer);
    this.captureTimer = 0; this.captureFinalizeTimer = 0; this.commandTimer = 0; this.captureHardDeadline = 0; this.captureInterim = '';
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
    let sum = 0; let peak = 0;
    for (const sample of samples) { const value = Math.abs((sample - 128) / 128); sum += value * value; peak = Math.max(peak, value); }
    const rms = Math.sqrt(sum / samples.length); const now = performance.now();
    const vadThreshold = Math.max(.012, this.noiseFloor * 2.8, Number(this.settings.micSensitivity || .18) * .2);
    const voiceActive = rms > vadThreshold;
    if (voiceActive && peak > vadThreshold * 1.25) this.lastRawVoiceAt = now;
    if (!voiceActive) this.noiseFloor = this.noiseFloor * .985 + rms * .015;
    else if (this.noiseFloor < .004) this.noiseFloor = .004;
    const shown = Math.min(1, rms / Math.max(.035, vadThreshold * 2.4)); this.onLevel({ level: shown, rms, peak, noiseFloor: this.noiseFloor, voiceActive });
    if (this.commandCaptureActive) this.updateRawCommandVoiceActivity(voiceActive, now);
    if (voiceActive !== this.lastVoiceState) { this.lastVoiceState = voiceActive; this.onState(voiceActive ? 'hearing' : Date.now() < this.armedUntil ? 'armed' : 'listening'); }

    const clapThreshold = Math.max(Number(this.settings.clapSensitivity || .34), this.noiseFloor * 7.5);
    const impulse = rms > clapThreshold && peak > Math.min(1, clapThreshold * 1.55) && rms > this.lastLevel * 1.32;
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
    if (this.context.state !== 'running') await this.context.resume();
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
    this.shouldRun = false; this.running = false; this.speaking = false;
    if (this.commandCaptureActive) this.finishCommandCapture('cancelled');
    clearTimeout(this.restartTimer); clearTimeout(this.commandTimer); clearTimeout(this.captureTimer); clearTimeout(this.captureFinalizeTimer); cancelAnimationFrame(this.raf);
    try { this.recognition?.abort(); } catch {}
    try { this.playbackSource?.stop(); } catch {}
    this.playbackSource = null;
    this.recognition = null; this.preparingRecognition = false; this.pending = []; this.commandCaptureActive = false; this.captureVoiceActive = false; this.captureInterim = '';
    this.vadCandidateSince = 0; this.vadQuietSince = 0; this.lastSpeechSignalAt = 0;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null; this.analyser = null; this.audioSamples = null;
    this.networkErrors = 0; this.recognitionUnavailable = false;
    if (this.context) await this.context.close().catch(() => {});
    this.context = null; this.onLevel({ level: 0, rms: 0, peak: 0, noiseFloor: this.noiseFloor, voiceActive: false }); this.onState('standby');
  }

  async toggle(settings = this.settings) { if (this.running) await this.stop(); else await this.start(settings); }
  get active() { return this.running; }
  get recognitionAvailable() { return Boolean(Recognition()); }
}
