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
