"""Small dependency-light policy checks for the Pi wake listener."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "lib"
SPEC = importlib.util.spec_from_file_location("jarvis_wake_listener", LIB / "wake-listener.py")
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Could not load lib/wake-listener.py")
MODULE = importlib.util.module_from_spec(SPEC)
# wake-listener.py imports sibling helpers. Running this verifier from the
# project root must behave like running the listener from lib/, without
# requiring callers to mutate PYTHONPATH themselves.
sys.path.insert(0, str(LIB))
try:
    SPEC.loader.exec_module(MODULE)
finally:
    sys.path.remove(str(LIB))


assert MODULE.wake_score_ready([0.91], 0.7) is False
assert MODULE.wake_score_ready([0.65, 0.73, 0.2], 0.7) is True
assert MODULE.wake_score_ready([0.72, 0.2, 0.1], 0.7) is False
assert MODULE.wake_score_ready([0.72, 0.2, 0.73, 0.72], 0.7, window_size=3) is True
assert MODULE.wake_score_ready(["bad", None], 0.7) is False
# A real voice frame may precede the model peak, but the bridge is hard-capped
# at 320 ms and never accepts absent, stale, future, or invalid evidence.
assert MODULE.wake_physical_evidence_recent(10.0, 9.681) is True
assert MODULE.wake_physical_evidence_recent(10.0, 9.679) is False
assert MODULE.wake_physical_evidence_recent(10.0, 9.67, max_age_ms=9999) is False
assert MODULE.wake_physical_evidence_recent(10.0, 10.001) is False
assert MODULE.wake_physical_evidence_recent(10.0, 0.0) is False
assert MODULE.wake_physical_evidence_recent(float("nan"), 9.9) is False
assert MODULE.wake_physical_evidence_recent(10.0, float("inf")) is False

# Reproduce the Pi trace shape: a real voice frame comes first and two strong
# model frames arrive in the quiet phrase tail. The bounded bridge accepts the
# real phrase, while the same scores after the window expires stay rejected.
history = []
last_physical_at = 0.0
accepted = False
for now, physical_gate, score in ((1.44, True, 0.0001), (1.60, False, 0.91), (1.68, False, 0.99)):
    if physical_gate:
        last_physical_at = now
    recent = MODULE.wake_physical_evidence_recent(now, last_physical_at)
    history = (history + [score])[-3:] if recent else []
    accepted = accepted or (recent and MODULE.wake_score_ready(history, 0.72))
assert accepted is True

history = []
for now, score in ((2.00, 0.99), (2.08, 0.99)):
    recent = MODULE.wake_physical_evidence_recent(now, 1.44)
    history = (history + [score])[-3:] if recent else []
assert MODULE.wake_score_ready(history, 0.72) is False
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
assert MODULE.command_acknowledgement_ready(10.0, True, 20.0) is True
assert MODULE.command_acknowledgement_ready(10.0, False, 10.0) is True
assert MODULE.command_acknowledgement_ready(9.9, False, 10.0) is False
assert MODULE.command_acknowledgement_ready(10.0, False, 0.0) is False
assert MODULE.command_acknowledgement_ready(float("nan"), False, 10.0) is False
print("Pi wake policy checks passed.")
