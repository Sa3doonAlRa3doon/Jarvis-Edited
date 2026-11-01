"""Select a shared PipeWire source for the Pi wake listener, with ALSA fallback."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from typing import Callable


def _alsa_coordinates(device: str) -> tuple[int, int]:
    match = re.fullmatch(r"(?:plughw|hw):(\d+),(\d+)", str(device).strip())
    if not match:
        raise ValueError(f"Unsupported selected microphone device: {device}")
    return int(match.group(1)), int(match.group(2))


def resolve_pipewire_source(device: str, graph: object) -> tuple[str, str]:
    """Map an ALSA picker value to one unambiguous PipeWire capture node."""
    selected_card, selected_device = _alsa_coordinates(device)
    if not isinstance(graph, list):
        raise RuntimeError("PipeWire returned an invalid audio graph.")

    matches: list[tuple[str, object]] = []
    for entry in graph:
        if not isinstance(entry, dict):
            continue
        info = entry.get("info")
        props = info.get("props") if isinstance(info, dict) else None
        if not isinstance(props, dict) or props.get("api.alsa.pcm.stream") != "capture":
            continue
        try:
            card = int(props.get("api.alsa.pcm.card"))
        except (TypeError, ValueError):
            continue
        if card != selected_card or entry.get("id") is None:
            continue
        matches.append((str(entry["id"]), props.get("api.alsa.pcm.device")))

    exact = [node for node in matches if node[1] is not None and str(node[1]) == str(selected_device)]
    if len(exact) == 1:
        return exact[0][0], "pipewire"
    if len(exact) > 1:
        raise RuntimeError(f"PipeWire exposes multiple capture nodes for {device}.")
    if len(matches) == 1:
        return matches[0][0], "pipewire"
    if not matches:
        raise RuntimeError(f"PipeWire has no capture source for selected microphone {device}.")
    raise RuntimeError(f"PipeWire has multiple capture sources for card {selected_card}; the selected device {selected_device} cannot be identified safely.")


def _pipewire_env() -> dict[str, str]:
    env = os.environ.copy()
    if not env.get("XDG_RUNTIME_DIR") and hasattr(os, "getuid"):
        runtime_dir = f"/run/user/{os.getuid()}"
        if os.path.isdir(runtime_dir):
            env["XDG_RUNTIME_DIR"] = runtime_dir
    return env


def resolve_capture_command(
    device: str,
    *,
    runner: Callable = subprocess.run,
    which: Callable = shutil.which,
) -> tuple[list[str], str, str | None]:
    """Prefer PipeWire when its daemon is available; otherwise use ALSA."""
    pw_dump = which("pw-dump")
    pw_record = which("pw-record")
    arecord = which("arecord")
    env = _pipewire_env()

    if pw_dump and pw_record:
        try:
            result = runner([pw_dump], capture_output=True, text=True, timeout=3, env=env, check=False)
        except (OSError, subprocess.SubprocessError) as error:
            raise RuntimeError(f"Could not query the PipeWire microphone graph: {error}") from error
        if result.returncode == 0:
            try:
                graph = json.loads(result.stdout)
            except (TypeError, ValueError) as error:
                raise RuntimeError("PipeWire returned unreadable microphone information.") from error
            target, backend = resolve_pipewire_source(device, graph)
            return [pw_record, "--target", target, "--raw", "--rate", "16000", "--channels", "1", "--format", "s16", "-"], backend, target
        # An installed PipeWire client with no reachable session daemon may
        # fall back to ALSA. If ALSA is also reserved, startup will report the
        # actual error instead of pretending that the listener is ready.

    if not arecord:
        if pw_dump and pw_record:
            raise RuntimeError("PipeWire is not reachable and arecord is unavailable.")
        raise RuntimeError("Neither PipeWire capture nor arecord is available on this Pi.")
    return [arecord, "-D", device, "-q", "-t", "raw", "-f", "S16_LE", "-r", "16000", "-c", "1"], "alsa", device
