# JARVIS reference projects

This page records projects used for design research. It is not a bundle of their source code. The current service split and integrations in this repository are implemented here; this change does not copy source files, assets, or model weights from these projects.

## Sources and reuse notes

| Source | What it is useful for | License / reuse decision |
| --- | --- | --- |
| [Jarvis voice assistant gist](https://gist.github.com/brayn003/e3367283d1137e1fc237a685fdcae2dc) | A small example of spoken acknowledgement and explicit command routing. | No license is shown on the gist page, so its code is not copied. Its sample calls `recognize_google`, which sends audio for cloud recognition and does not fit JARVIS's local-first Pi microphone path. |
| [OpenJarvis repository](https://github.com/open-jarvis/openjarvis) | Agent, engine, tool, memory, and orchestration patterns. | Apache-2.0. We use the project's documented interfaces and concepts; no source code from it is copied by this change. If code is reused later, preserve its license and notices and mark modified files. |
| [OpenJarvis documentation](https://open-jarvis.github.io/OpenJarvis/) | Official architecture, API, agent, and user guides for the OpenJarvis engine already connected to JARVIS. | Documentation reference; no documentation text is copied into the application. |
| [Sukeesh/Jarvis](https://github.com/sukeesh/Jarvis) | A personal-assistant command catalog and Linux/macOS implementation example. | MIT. No code is copied by this change. Any later reuse must retain the copyright and license notice. |
| [Priler/jarvis](https://github.com/Priler/jarvis) | Offline voice architecture examples using Rust/Tauri, Vosk, and wake-word components. | CC BY-NC-SA 4.0. No code is copied. This license is non-commercial and share-alike, so its code must not be mixed into this project without an explicit compatible distribution decision. |

## Applied design direction

- Keep microphone capture under one dedicated process so a second `arecord` process cannot contend for the same ALSA device.
- Keep settings persistence, camera capture, microphone/wake-word capture, core API, and dashboard in separate local processes with health checks.
- Prefer local speech recognition and local model execution for private voice flows; make cloud use explicit when a feature requires it.
- Keep OpenJarvis agent and tool integrations behind the JARVIS core API instead of giving the browser direct access to credentials or host services.

These are design choices for this project, not copied implementation code from the sources above.
