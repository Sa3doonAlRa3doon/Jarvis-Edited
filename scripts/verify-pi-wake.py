"""Small dependency-light policy checks for the Pi wake listener."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("jarvis_wake_listener", ROOT / "lib" / "wake-listener.py")
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Could not load lib/wake-listener.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


assert MODULE.wake_score_ready([0.91], 0.7) is False
assert MODULE.wake_score_ready([0.65, 0.73, 0.2], 0.7) is True
assert MODULE.wake_score_ready([0.72, 0.2, 0.1], 0.7) is False
assert MODULE.wake_score_ready([0.72, 0.2, 0.73, 0.72], 0.7, window_size=3) is True
assert MODULE.wake_score_ready(["bad", None], 0.7) is False
assert MODULE.normalize_command_text("  Hey Jarvis, show Docker status  ") == "show Docker status"
assert MODULE.normalize_command_text("jarvis") == ""
assert MODULE.recognizer_text('{"text":"show the printer"}', final=True) == "show the printer"
assert MODULE.recognizer_text('{"partial":"show the printer"}') == "show the printer"
assert MODULE.merge_command_text("show the", "the printer status") == "show the printer status"
assert MODULE.merge_command_text("show the printer", "printer") == "show the printer"
assert MODULE.merge_command_text("", "what is the weather") == "what is the weather"
biased_silence = MODULE.np.full(1600, 1800, dtype=MODULE.np.int16)
assert MODULE.rms(biased_silence) == 0.0
assert MODULE.peak(biased_silence) == 0.0
assert MODULE.speech_shape_gate(biased_silence) is False
assert MODULE.adapt_wake_noise_floor(.004, .02, physical_gate=False, speech_shape_ok=False) > .004
assert MODULE.adapt_wake_noise_floor(.004, .02, physical_gate=False, speech_shape_ok=True) == .004
assert MODULE.adapt_wake_noise_floor(.004, .02, physical_gate=True, speech_shape_ok=False) == .004
assert MODULE.command_should_finish(10.0, 20.0, 8.9, silence_ms=900) is True
assert MODULE.command_should_finish(10.0, 9.0, 8.9, silence_ms=900) is True
assert MODULE.command_should_finish(10.0, 20.0, 9.5, silence_ms=900) is False
# A wake must leave the user the full bounded window to start speaking; the
# silence timer only begins after a real post-warmup voice frame is observed.
assert MODULE.command_should_finish(10.0, 20.0, 0.0, silence_ms=900) is False
print("Pi wake policy checks passed.")
