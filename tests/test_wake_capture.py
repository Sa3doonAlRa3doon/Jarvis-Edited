import json
import subprocess
import unittest

from lib.wake_capture import resolve_capture_command, resolve_pipewire_source


def source(node_id, card, device=None, stream="capture"):
    props = {"api.alsa.pcm.card": str(card), "api.alsa.pcm.stream": stream}
    if device is not None:
        props["api.alsa.pcm.device"] = str(device)
    return {"id": node_id, "info": {"props": props}}


class WakeCaptureTests(unittest.TestCase):
    def test_maps_selected_alsa_card_to_its_single_pipewire_capture_node(self):
        graph = [source(8, 1), source(57, 2), source(61, 2, stream="playback")]
        self.assertEqual(resolve_pipewire_source("plughw:2,0", graph), ("57", "pipewire"))

    def test_prefers_exact_device_when_a_card_exposes_multiple_capture_nodes(self):
        graph = [source(57, 2, 0), source(58, 2, 1)]
        self.assertEqual(resolve_pipewire_source("plughw:2,1", graph), ("58", "pipewire"))

    def test_rejects_ambiguous_or_missing_pipewire_sources(self):
        with self.assertRaisesRegex(RuntimeError, "cannot be identified safely"):
            resolve_pipewire_source("plughw:2,0", [source(57, 2), source(58, 2)])
        with self.assertRaisesRegex(RuntimeError, "no capture source"):
            resolve_pipewire_source("plughw:3,0", [source(57, 2)])

    def test_builds_shared_pipewire_record_command(self):
        graph = [source(57, 2)]

        def runner(command, **_kwargs):
            self.assertEqual(command, ["pw-dump"])
            return subprocess.CompletedProcess(command, 0, json.dumps(graph), "")

        command, backend, target = resolve_capture_command(
            "plughw:2,0", runner=runner, which=lambda name: {"pw-dump": "pw-dump", "pw-record": "pw-record", "arecord": "arecord"}.get(name)
        )
        self.assertEqual(backend, "pipewire")
        self.assertEqual(target, "57")
        self.assertEqual(command, ["pw-record", "--target", "57", "--raw", "--rate", "16000", "--channels", "1", "--format", "s16", "-"])

    def test_falls_back_to_alsa_only_when_pipewire_is_unavailable(self):
        def runner(command, **_kwargs):
            return subprocess.CompletedProcess(command, 1, "", "PipeWire daemon is not available")

        command, backend, target = resolve_capture_command(
            "plughw:2,0", runner=runner, which=lambda name: {"pw-dump": "pw-dump", "pw-record": "pw-record", "arecord": "arecord"}.get(name)
        )
        self.assertEqual(backend, "alsa")
        self.assertEqual(target, "plughw:2,0")
        self.assertEqual(command[0:3], ["arecord", "-D", "plughw:2,0"])

    def test_uses_alsa_when_pipewire_clients_are_not_installed(self):
        command, backend, target = resolve_capture_command("plughw:2,0", which=lambda name: "arecord" if name == "arecord" else None)
        self.assertEqual(backend, "alsa")
        self.assertEqual(target, "plughw:2,0")
        self.assertEqual(command[0], "arecord")


if __name__ == "__main__":
    unittest.main()
