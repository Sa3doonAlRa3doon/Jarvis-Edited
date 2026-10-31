#!/usr/bin/env python3
"""Fully local Pi microphone listener for Hey Jarvis and double-clap events."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request

import numpy as np


def emit(payload: dict) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def normalize_command_text(value: object, limit: int = 600) -> str:
    """Keep a local STT result bounded before it crosses the loopback callback."""
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    # Vosk can include the wake phrase in its first segment.  The wake event
    # already proves the phrase, so do not send it back as part of the command.
    text = re.sub(r"^(?:hey\s+)?jarvis\b[\s,;:.-]*", "", text, flags=re.IGNORECASE).strip()
    return text[: max(1, int(limit))]


def recognizer_text(payload: object, *, final: bool = False) -> str:
    """Extract only the bounded text field from a Vosk JSON result."""
    if not isinstance(payload, str):
        return ""
    try:
        parsed = json.loads(payload)
    except (TypeError, ValueError):
        return ""
    key = "text" if final else "partial"
    return normalize_command_text(parsed.get(key, "")) if isinstance(parsed, dict) else ""


def merge_command_text(existing: object, incoming: object, limit: int = 600) -> str:
    """Append a Vosk segment without duplicating a partial/final overlap."""
    left = normalize_command_text(existing, limit)
    right = normalize_command_text(incoming, limit)
    if not right:
        return left
    if not left:
        return right[: max(1, int(limit))]
    if right == left or right.startswith(left + " "):
        return right[: max(1, int(limit))]
    if left.endswith(" " + right) or left.endswith(right):
        return left[: max(1, int(limit))]
    left_words = left.split()
    right_words = right.split()
    overlap = 0
    for size in range(min(len(left_words), len(right_words)), 0, -1):
        if left_words[-size:] == right_words[:size]:
            overlap = size
            break
    return normalize_command_text(" ".join(left_words + right_words[overlap:]), limit)


def command_should_finish(now: float, deadline: float, last_voice: float, *, silence_ms: int = 900) -> bool:
    """Return true after bounded silence or the hard command deadline."""
    if deadline > 0 and now >= deadline:
        return True
    return last_voice > 0 and now - last_voice >= max(250, int(silence_ms)) / 1000.0


def notify(url: str, token: str, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "X-Wake-Token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            response.read(32)
    except Exception as error:  # listener must survive dashboard restarts
        emit({"type": "callback_error", "message": str(error)[:180]})


def centered_audio(samples: np.ndarray) -> np.ndarray:
    """Return normalized PCM with the frame's DC bias removed."""
    if samples.size == 0:
        return np.asarray([], dtype=np.float32)
    normalized = samples.astype(np.float32) / 32768.0
    normalized -= float(np.mean(normalized))
    return normalized


def rms(samples: np.ndarray) -> float:
    normalized = centered_audio(samples)
    if normalized.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(normalized))))


def peak(samples: np.ndarray) -> float:
    normalized = centered_audio(samples)
    if normalized.size == 0:
        return 0.0
    return float(np.max(np.abs(normalized)))


def signal_to_noise_db(level: float, floor: float) -> float:
    """Return a bounded SNR estimate for diagnostics and the physical gate."""
    return float(20.0 * np.log10(max(level, 0.0001) / max(floor, 0.0005)))


def adapt_wake_noise_floor(
    current: float,
    level: float,
    *,
    physical_gate: bool,
    speech_shape_ok: bool,
) -> float:
    """Track a slowly changing Pi room floor without learning a sentence.

    The previous low-pass only moved the floor downward. A fan, HVAC motor, or
    USB gain change could therefore leave the wake gate calibrated to an old
    quiet room and make later non-speech peaks look like a real wake. Ambient
    frames that fail the speech-shape check are allowed to raise the floor,
    but only inside a bounded eight-times window and at a deliberately slow
    rate. Physical-gate frames never change the floor.
    """
    try:
        safe_current = min(0.12, max(0.001, float(current)))
        sample = float(level)
    except (TypeError, ValueError):
        return 0.004
    if not np.isfinite(sample) or physical_gate:
        return safe_current
    if not speech_shape_ok:
        # Follow steady, non-speech room noise upward without allowing one
        # arbitrary loud transient to erase the wake sensitivity.
        ceiling = min(0.12, max(0.006, safe_current * 8.0))
        if sample <= ceiling:
            rate = 0.012 if sample > safe_current else 0.005
            return min(0.12, max(0.001, safe_current * (1.0 - rate) + sample * rate))
    # Keep the original gentle downward drift for quiet frames.
    if sample < max(0.006, safe_current * 2.2):
        return min(0.12, max(0.001, safe_current * 0.995 + sample * 0.005))
    return safe_current


def speech_shape(samples: np.ndarray) -> tuple[float, float]:
    """Return zero-crossing rate and crest factor for a bounded speech-shape check.

    A model score alone can fire on a low hum, fan noise, or a sharp transient.
    Speech normally has a small but non-zero zero-crossing rate and a bounded
    crest factor. The ranges used by ``speech_shape_gate`` are deliberately
    conservative so a quiet voiced speaker is still accepted.
    """
    if samples.size < 2:
        return 0.0, 0.0
    normalized = centered_audio(samples)
    crossings = np.count_nonzero(np.signbit(normalized[1:]) != np.signbit(normalized[:-1]))
    zero_crossing_rate = float(crossings / max(1, normalized.size - 1))
    level = float(np.sqrt(np.mean(np.square(normalized))))
    crest_factor = float(np.max(np.abs(normalized)) / max(level, 0.0001))
    return zero_crossing_rate, crest_factor


def speech_shape_gate(
    samples: np.ndarray,
    *,
    min_zero_crossing_rate: float = 0.008,
    max_zero_crossing_rate: float = 0.45,
    min_crest_factor: float = 1.05,
    max_crest_factor: float = 18.0,
) -> bool:
    """Reject frames shaped like silence, narrow hum, or a sharp impulse."""
    zero_crossing_rate, crest_factor = speech_shape(samples)
    return (
        min_zero_crossing_rate <= zero_crossing_rate <= max_zero_crossing_rate
        and min_crest_factor <= crest_factor <= max_crest_factor
    )


def wake_physical_gate(
    level: float,
    sample_peak: float,
    noise_floor: float,
    *,
    energy_floor: float = 0.0035,
    noise_multiplier: float = 1.6,
    peak_floor: float = 0.004,
    peak_ratio: float = 1.12,
    speech_shape_ok: bool = True,
) -> bool:
    """Require real microphone energy before a model prediction can wake JARVIS.

    openWakeWord can produce a high score from a quiet room or residual model
    state. This bounded physical gate is intentionally independent from the
    model threshold: it blocks false activations without making the acoustic
    model less sensitive to the phrase itself.
    """
    required_level = max(energy_floor, noise_floor * noise_multiplier)
    required_peak = max(peak_floor, level * peak_ratio)
    return level >= required_level and sample_peak >= required_peak and speech_shape_ok


def wake_score_ready(
    scores: list[float] | tuple[float, ...],
    threshold: float,
    *,
    minimum_hits: int = 2,
    window_size: int = 3,
    soft_ratio: float = 0.88,
) -> bool:
    """Require two nearby model frames before accepting a wake prediction.

    openWakeWord emits scores for short audio windows. A single score can be
    caused by a click or a residual model spike even when the physical gate is
    true. Requiring one full-threshold hit plus one nearby soft hit keeps the
    wake responsive while making the decision temporal rather than one-frame.
    """
    try:
        safe_threshold = max(0.0, float(threshold))
        safe_ratio = min(1.0, max(0.5, float(soft_ratio)))
        safe_minimum = max(1, int(minimum_hits))
        safe_window = max(safe_minimum, int(window_size))
        values = [float(value) for value in list(scores)[-safe_window:]]
    except (TypeError, ValueError):
        return False
    if len(values) < safe_minimum or not values:
        return False
    soft_hits = sum(value >= safe_threshold * safe_ratio for value in values)
    return max(values) >= safe_threshold and soft_hits >= safe_minimum


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", required=True)
    parser.add_argument("--callback", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--wake-threshold", type=float, default=0.55)
    parser.add_argument("--wake-energy-floor", type=float, default=0.0035)
    parser.add_argument("--wake-noise-multiplier", type=float, default=1.6)
    parser.add_argument("--wake-peak-floor", type=float, default=0.004)
    parser.add_argument("--wake-peak-ratio", type=float, default=1.12)
    parser.add_argument("--clap-threshold", type=float, default=0.34)
    parser.add_argument("--double-clap-ms", type=int, default=700)
    parser.add_argument("--stt-model", default="", help="Optional local Vosk model directory for Pi command transcription")
    parser.add_argument("--command-timeout-ms", type=int, default=15_000)
    parser.add_argument("--command-silence-ms", type=int, default=900)
    parser.add_argument("--command-warmup-ms", type=int, default=1_200,
                        help="Ignore the wake/TTS tail before local command capture begins")
    parser.add_argument("--wake-enabled", action="store_true")
    parser.add_argument("--clap-enabled", action="store_true")
    args = parser.parse_args()

    wake_model = None
    if args.wake_enabled:
        try:
            from openwakeword.model import Model

            wake_model = Model(wakeword_models=["hey jarvis"], inference_framework="onnx")
        except Exception as error:
            emit({"type": "model_error", "message": str(error)[:240]})

    # Command transcription is optional so the wake listener remains useful
    # on a fresh Pi before its local speech model has been installed.  When a
    # Vosk directory is supplied, the model stays on-device and only the
    # bounded transcript crosses the loopback callback.
    stt_model = None
    kaldi_recognizer_class = None
    if args.stt_model:
        try:
            from vosk import KaldiRecognizer, Model
            try:
                from vosk import SetLogLevel
                SetLogLevel(-1)
            except ImportError:
                pass
            stt_model = Model(args.stt_model)
            kaldi_recognizer_class = KaldiRecognizer
        except Exception as error:
            emit({"type": "stt_model_error", "message": str(error)[:240]})

    command = [
        "arecord", "-D", args.device, "-q", "-t", "raw", "-f", "S16_LE",
        "-r", "16000", "-c", "1",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    emit({"type": "ready", "device": args.device, "wake_model": wake_model is not None, "stt_model": stt_model is not None})

    frame_bytes = 1280 * 2  # 80 ms of 16 kHz mono int16 audio
    first_clap = 0.0
    clap_refractory_until = 0.0
    wake_refractory_until = 0.0
    wake_score_history: list[float] = []
    last_wake_score = 0.0
    last_wake_ready = False
    clap_calibration_until = time.monotonic() + 0.75
    noise_floor_samples: list[float] = []
    noise_floor = 0.008
    # Keep the wake gate's startup floor independent from the clap calibrator.
    # A fixed 0.008 floor can reject quiet speech before the room has had a
    # chance to settle, while a separate bounded floor still learns noisy
    # rooms over time.
    wake_noise_floor = 0.004
    last_diagnostic_at = 0.0
    command_active = False
    command_deadline = 0.0
    command_last_voice = 0.0
    command_warmup_until = 0.0
    command_recognizer_armed = False
    command_text = ""
    command_partial_text = ""
    command_recognizer = None

    def start_command_capture(now: float) -> None:
        nonlocal command_active, command_deadline, command_last_voice, command_warmup_until
        nonlocal command_recognizer_armed, command_text, command_partial_text, command_recognizer
        if kaldi_recognizer_class is None or stt_model is None or command_active:
            return
        try:
            # Do not feed the wake phrase or the dashboard's spoken wake
            # response into Vosk.  The recognizer is armed only after this
            # short local warm-up, while the hard timeout still starts now.
            command_recognizer = None
            command_active = True
            command_deadline = now + max(5_000, int(args.command_timeout_ms)) / 1000.0
            command_last_voice = 0.0
            command_warmup_until = now + max(0, min(5_000, int(args.command_warmup_ms))) / 1000.0
            command_recognizer_armed = False
            command_text = ""
            command_partial_text = ""
            emit({"type": "command_capture", "state": "warming", "timeout_ms": max(5_000, int(args.command_timeout_ms)),
                  "warmup_ms": max(0, min(5_000, int(args.command_warmup_ms))), "source": "pi"})
        except Exception as error:
            command_recognizer = None
            command_recognizer_armed = False
            emit({"type": "stt_error", "message": str(error)[:240]})

    def finish_command_capture() -> None:
        nonlocal command_active, command_deadline, command_last_voice, command_warmup_until
        nonlocal command_recognizer_armed, command_text, command_partial_text, command_recognizer
        if not command_active:
            return
        final_text = merge_command_text(command_text, command_partial_text)
        try:
            if command_recognizer is not None:
                final_result = recognizer_text(command_recognizer.FinalResult(), final=True)
                final_text = merge_command_text(command_text, final_result or command_partial_text or final_text)
        except Exception as error:
            emit({"type": "stt_error", "message": str(error)[:240]})
        if final_text:
            payload = {"kind": "wake_word", "command": final_text, "source": "pi", "command_source": "vosk"}
            notify(args.callback, args.token, payload)
            emit({"type": "command", **payload})
        else:
            emit({"type": "command_capture", "state": "timeout", "source": "pi"})
        command_active = False
        command_deadline = 0.0
        command_last_voice = 0.0
        command_warmup_until = 0.0
        command_recognizer_armed = False
        command_text = ""
        command_partial_text = ""
        command_recognizer = None

    try:
        while process.poll() is None:
            raw = process.stdout.read(frame_bytes) if process.stdout else b""
            if len(raw) != frame_bytes:
                break
            samples = np.frombuffer(raw, dtype=np.int16)
            now = time.monotonic()
            level = rms(samples)
            sample_peak = peak(samples)
            zero_crossing_rate, crest_factor = speech_shape(samples)
            shape_ok = speech_shape_gate(samples)
            snr_db = signal_to_noise_db(level, wake_noise_floor)
            physical_gate = wake_physical_gate(
                level,
                sample_peak,
                wake_noise_floor,
                energy_floor=max(0.0005, min(0.05, args.wake_energy_floor)),
                noise_multiplier=max(1.05, min(8.0, args.wake_noise_multiplier)),
                peak_floor=max(0.0005, min(0.25, args.wake_peak_floor)),
                peak_ratio=max(1.0, min(3.0, args.wake_peak_ratio)),
                speech_shape_ok=shape_ok,
            )

            # Continuously follow slow room-noise drift, but never learn from
            # a likely voice/clap frame. The bounded helper also follows a
            # steady non-speech floor upward after a fan or USB gain change.
            next_wake_noise_floor = adapt_wake_noise_floor(
                wake_noise_floor, level, physical_gate=physical_gate, speech_shape_ok=shape_ok
            )
            if next_wake_noise_floor != wake_noise_floor:
                wake_noise_floor = next_wake_noise_floor
                snr_db = signal_to_noise_db(level, wake_noise_floor)
            if now - last_diagnostic_at >= 1.0:
                emit({
                    "type": "diagnostic",
                    "mic_level": round(level, 5),
                    "mic_peak": round(sample_peak, 5),
                    "noise_floor": round(wake_noise_floor, 5),
                    "signal_to_noise_db": round(snr_db, 2),
                    "physical_gate": physical_gate,
                    "wake_score": round(last_wake_score, 4),
                    "wake_score_hits": sum(value >= max(0.0, args.wake_threshold) * 0.88 for value in wake_score_history),
                    "wake_score_ready": last_wake_ready,
                    "zero_crossing_rate": round(zero_crossing_rate, 4),
                    "crest_factor": round(crest_factor, 2),
                    "speech_shape": shape_ok,
                    "source": "pi",
                })
                last_diagnostic_at = now

            if args.clap_enabled and now >= clap_refractory_until:
                if now < clap_calibration_until:
                    # Learn a bounded room/device floor before accepting a
                    # clap. Wake-word inference remains active during this
                    # window; only impulse events are held back.
                    if level < max(args.clap_threshold * 0.8, noise_floor * 3.0):
                        noise_floor_samples.append(level)
                        noise_floor_samples = noise_floor_samples[-24:]
                        ordered = sorted(noise_floor_samples)
                        percentile = ordered[min(len(ordered) - 1, int(len(ordered) * 0.75))]
                        noise_floor = min(0.12, max(0.002, noise_floor * 0.8 + percentile * 0.2))
                elif clap_calibration_until:
                    clap_calibration_until = 0.0
                    if len(noise_floor_samples) >= 4:
                        ordered = sorted(noise_floor_samples)
                        percentile = ordered[min(len(ordered) - 1, int(len(ordered) * 0.75))]
                        # Keep headroom for a quiet speaker; the event gate
                        # already multiplies this floor by 7.5.
                        noise_floor = min(0.12, max(0.002, noise_floor, percentile * 0.8))
                else:
                    threshold = max(args.clap_threshold, noise_floor * 7.5)
                    impulse = level >= threshold and peak(samples) >= min(1.0, threshold * 1.55) and peak(samples) >= level * 1.32
                    if impulse:
                        if first_clap and (now - first_clap) * 1000 <= args.double_clap_ms:
                            payload = {"kind": "double_clap", "score": round(level, 4), "source": "pi"}
                            notify(args.callback, args.token, payload)
                            emit({"type": "activation", **payload})
                            start_command_capture(now)
                            first_clap = 0.0
                            clap_refractory_until = now + 1.1
                        elif not first_clap or (now - first_clap) * 1000 > args.double_clap_ms:
                            first_clap = now
                    elif first_clap and (now - first_clap) * 1000 > args.double_clap_ms:
                        first_clap = 0.0

            if wake_model is not None and now >= wake_refractory_until:
                try:
                    predictions = wake_model.predict(samples)
                    score = max((float(value) for key, value in predictions.items() if "jarvis" in key.lower()), default=0.0)
                    last_wake_score = score
                    if physical_gate:
                        wake_score_history.append(score)
                        wake_score_history = wake_score_history[-3:]
                    else:
                        # Never let a model score accumulate while the real
                        # microphone gate is quiet; the next physical burst
                        # must earn a fresh temporal window.
                        wake_score_history = []
                    ready = wake_score_ready(wake_score_history, args.wake_threshold)
                    last_wake_ready = ready
                    if ready and physical_gate:
                        payload = {
                            "kind": "wake_word",
                            "phrase": "hey jarvis",
                            "score": round(score, 4),
                            "mic_level": round(level, 5),
                            "mic_peak": round(sample_peak, 5),
                            "noise_floor": round(wake_noise_floor, 5),
                            "signal_to_noise_db": round(snr_db, 2),
                            "zero_crossing_rate": round(zero_crossing_rate, 4),
                            "crest_factor": round(crest_factor, 2),
                            "speech_shape": True,
                            "physical_gate": True,
                            "source": "pi",
                        }
                        notify(args.callback, args.token, payload)
                        emit({"type": "activation", **payload})
                        start_command_capture(now)
                        wake_refractory_until = now + 2.0
                        wake_score_history = []
                except Exception as error:
                    emit({"type": "inference_error", "message": str(error)[:180]})
                    time.sleep(0.25)

            # A Pi wake event is followed by one bounded local command window.
            # First discard the wake/TTS tail, then arm Vosk. Only the final
            # normalized sentence is sent to the dashboard, never raw audio.
            if command_active and not command_recognizer_armed and now >= command_warmup_until:
                try:
                    command_recognizer = kaldi_recognizer_class(stt_model, 16000)
                    command_recognizer.SetWords(False)
                    command_recognizer_armed = True
                    emit({"type": "command_capture", "state": "listening", "source": "pi"})
                except Exception as error:
                    command_recognizer = None
                    command_recognizer_armed = False
                    emit({"type": "stt_error", "message": str(error)[:240]})
                    finish_command_capture()
            if command_active and command_recognizer_armed and command_recognizer is not None:
                try:
                    if command_recognizer.AcceptWaveform(raw):
                        segment = recognizer_text(command_recognizer.Result(), final=True)
                        if segment:
                            command_text = merge_command_text(command_text, segment)
                            command_partial_text = ""
                            command_last_voice = now
                    else:
                        partial = recognizer_text(command_recognizer.PartialResult())
                        if partial:
                            # Partial results are revisions, not new words.
                            # Keep only the latest one and use it if the
                            # sentence reaches the silence boundary first.
                            command_partial_text = partial
                            command_last_voice = now
                except Exception as error:
                    emit({"type": "stt_error", "message": str(error)[:240]})
                    finish_command_capture()
            if command_active:
                if command_recognizer_armed and physical_gate:
                    command_last_voice = now
                elif command_should_finish(now, command_deadline, command_last_voice, silence_ms=args.command_silence_ms):
                    finish_command_capture()
    except KeyboardInterrupt:
        pass
    finally:
        # If arecord exits during a sentence, flush the bounded local text
        # before tearing down the process so a device hiccup does not discard
        # an otherwise complete command.
        if command_active:
            finish_command_capture()
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()

    stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
    if stderr.strip():
        emit({"type": "capture_error", "message": stderr.strip()[-240:]})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
