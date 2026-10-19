#!/usr/bin/env python3
"""Fully local Pi microphone listener for Hey Jarvis and double-clap events."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.request

import numpy as np


def emit(payload: dict) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)


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


def rms(samples: np.ndarray) -> float:
    if samples.size == 0:
        return 0.0
    normalized = samples.astype(np.float32) / 32768.0
    return float(np.sqrt(np.mean(np.square(normalized))))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", required=True)
    parser.add_argument("--callback", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--wake-threshold", type=float, default=0.55)
    parser.add_argument("--clap-threshold", type=float, default=0.34)
    parser.add_argument("--double-clap-ms", type=int, default=700)
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

    command = [
        "arecord", "-D", args.device, "-q", "-t", "raw", "-f", "S16_LE",
        "-r", "16000", "-c", "1",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    emit({"type": "ready", "device": args.device, "wake_model": wake_model is not None})

    frame_bytes = 1280 * 2  # 80 ms of 16 kHz mono int16 audio
    first_clap = 0.0
    clap_refractory_until = 0.0
    wake_refractory_until = 0.0

    try:
        while process.poll() is None:
            raw = process.stdout.read(frame_bytes) if process.stdout else b""
            if len(raw) != frame_bytes:
                break
            samples = np.frombuffer(raw, dtype=np.int16)
            now = time.monotonic()

            if args.clap_enabled and now >= clap_refractory_until:
                level = rms(samples)
                if level >= args.clap_threshold:
                    if first_clap and (now - first_clap) * 1000 <= args.double_clap_ms:
                        payload = {"kind": "double_clap", "score": round(level, 4), "source": "pi"}
                        notify(args.callback, args.token, payload)
                        emit({"type": "activation", **payload})
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
                    if score >= args.wake_threshold:
                        payload = {"kind": "wake_word", "phrase": "hey jarvis", "score": round(score, 4), "source": "pi"}
                        notify(args.callback, args.token, payload)
                        emit({"type": "activation", **payload})
                        wake_refractory_until = now + 2.0
                except Exception as error:
                    emit({"type": "inference_error", "message": str(error)[:180]})
                    time.sleep(0.25)
    except KeyboardInterrupt:
        pass
    finally:
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
