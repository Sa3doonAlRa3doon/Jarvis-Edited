"""Select a shared PipeWire source for the Pi wake listener, with ALSA fallback."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from typing import Callable


def _normalized_card_name(value: object) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip()).strip("_")[:96]


def _alsa_selection(device: str) -> tuple[int | None, str | None, int, str | None]:
    match = re.fullmatch(r"(?:plughw|hw):(\d+),(\d+)", str(device).strip())
    if match:
        return int(match.group(1)), None, int(match.group(2)), None
    stable = re.fullmatch(r"alsa:CARD=([A-Za-z0-9_-]+),DEV=(\d{1,3}),NAME=([A-Za-z0-9_-]+)", str(device).strip())
    if stable and int(stable.group(2)) <= 255:
        return None, stable.group(1), int(stable.group(2)), stable.group(3)
    raise ValueError(f"Unsupported selected microphone device: {device}")


def resolve_pipewire_source(device: str, graph: object) -> tuple[str, str]:
    """Map an ALSA picker value to one unambiguous PipeWire capture node."""
    selected_card, _selected_card_id, selected_device, selected_name = _alsa_selection(device)
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
        if selected_card is not None:
            try:
                card_matches = int(props.get("api.alsa.pcm.card")) == selected_card
            except (TypeError, ValueError):
                card_matches = False
        else:
            card_matches = _normalized_card_name(props.get("api.alsa.card.name")) == selected_name
        if not card_matches or entry.get("id") is None:
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
    selected_label = selected_card if selected_card is not None else selected_name
    raise RuntimeError(f"PipeWire has multiple capture sources for card {selected_label}; the selected device {selected_device} cannot be identified safely.")


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
    _selected_card, selected_card_id, selected_device, _selected_name = _alsa_selection(device)
    alsa_device = device if selected_card_id is None else f"plughw:CARD={selected_card_id},DEV={selected_device}"
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
    return [arecord, "-D", alsa_device, "-q", "-t", "raw", "-f", "S16_LE", "-r", "16000", "-c", "1"], "alsa", device
