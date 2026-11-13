# Third-party code notices

## Sukeesh/Jarvis plugin storage pattern

`lib/plugin-storage.mjs` adapts the `PluginStorage` class from
[Sukeesh/Jarvis](https://github.com/sukeesh/Jarvis/blob/master/jarviscli/plugin.py)
(Copyright (c) 2017 Sukeesh), under the MIT License. The MIT license text is in
[`third_party/licenses/sukeesh-jarvis-MIT.txt`](third_party/licenses/sukeesh-jarvis-MIT.txt).
JARVIS changes include a JavaScript port, validated plugin names, defensive
enumeration, and copy-on-transfer semantics. Its registry contains only
first-party descriptors registered by application code; it does not load
user-provided modules.

## OpenJarvis runtime

The Pi installer clones and runs the upstream
[OpenJarvis](https://github.com/open-jarvis/OpenJarvis) project under its
Apache-2.0 license as JARVIS's local model and agent runtime. JARVIS connects to
that separate service through its documented local API and event stream; its
upstream files are installed separately rather than copied into this source
tree. See the upstream [`LICENSE`](https://github.com/open-jarvis/OpenJarvis/blob/main/LICENSE).

## OpenJarvis loop-guard patterns

`lib/browser-action-loop-guard.mjs` adapts the repeated-call hash check, and
`lib/agent-security.mjs` adapts the recent-window context trimming stage, from
OpenJarvis's `src/openjarvis/agents/loop_guard.py` (Copyright 2025 The
OpenJarvis Authors), under Apache-2.0. The license is included in
[`third_party/licenses/openjarvis-Apache-2.0.txt`](third_party/licenses/openjarvis-Apache-2.0.txt).
JARVIS ports these pieces to JavaScript and adapts OpenJarvis's alternating
tool-cycle idea: its browser guard compares complete call signatures, warns
before blocking an exact two-action cycle, expires state after a short window,
and applies only to browser actions. The history window keeps whole recent
user/assistant messages within a character budget and remains disabled for
tool-enabled requests. The guard stores hashes in memory and does not log
action arguments.
