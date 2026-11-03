# JARVIS reference projects

These references informed actual integrations and code reuse where compatible. See [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) for retained third-party notices.

## Sources and reuse notes

| Source | What it is useful for | License / reuse decision |
| --- | --- | --- |
| [Jarvis voice assistant gist](https://gist.github.com/brayn003/e3367283d1137e1fc237a685fdcae2dc) | A small example of spoken acknowledgement and explicit command routing. | No license is shown on the gist page, so its code is not copied. Its sample calls `recognize_google`, which sends audio for cloud recognition and does not fit JARVIS's local-first Pi microphone path. |
| [OpenJarvis repository](https://github.com/open-jarvis/openjarvis) | Local model, agent, and orchestration runtime. | Apache-2.0. The Pi installer installs and runs the actual upstream project as JARVIS's private API/event service; JARVIS sends requests to its local API. Upstream source remains separately installed and its license is retained there. |
| [OpenJarvis documentation](https://open-jarvis.github.io/OpenJarvis/) | Official API and agent-runtime reference. | Used to connect to the upstream runtime and event stream; no documentation passages are copied. |
| [Sukeesh/Jarvis](https://github.com/sukeesh/Jarvis) | Its `PluginStorage` pattern for registering and retrieving nested assistant plugins. | MIT. Adapted into `lib/plugin-storage.mjs` and used by `lib/agent-router.mjs` to register specialist domains. The port adds validated identifiers, defensive enumeration, copy-on-transfer, and startup-only in-process registration. The original MIT notice is retained in `third_party/licenses/sukeesh-jarvis-MIT.txt`. |
| [Priler/jarvis](https://github.com/Priler/jarvis) | Offline voice architecture and voice activity detection. | CC BY-NC-SA 4.0. The inspected energy detector is a fixed RMS threshold; JARVIS already uses an adaptive noise floor, SNR, speech-shape, spectrum, and wake-model gates, so copying it would reduce the current mic gate's evidence. No source from this repository is included. |

## Applied design direction

- Keep microphone capture under one dedicated process so a second `arecord` process cannot contend for the same ALSA device.
- Keep settings persistence, camera capture, microphone/wake-word capture, core API, and dashboard in separate local processes with health checks.
- Prefer local speech recognition and local model execution for private voice flows; make cloud use explicit when a feature requires it.
- Keep OpenJarvis agent and tool integrations behind the JARVIS core API instead of giving the browser direct access to credentials or host services.

These are design choices for this project, not copied implementation code from the sources above.
