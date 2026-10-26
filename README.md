# OpenJarvis Pi Command Center 3.11.1

A private, Pi-first JARVIS visualization for OpenJarvis, Ollama, Docker, Google connectors, cameras, microphones, and guarded maintenance. The main route is now exactly one fullscreen neural field with no visible words, panels, cards, labels, or command bar.

### 3.11 private browser, cross-platform workspace, and Office studio

- **Collision-proof browser bridge** — Playwright MCP tools are exposed to OpenJarvis as `jarvis_browser_*`, preventing its incomplete built-in browser tools from shadowing the protected private-browser connection.
- **Automatic private live frames** — navigation, clicks, typing, selections, and key presses refresh a protected screenshot for the dashboard while control is active; the frame is hidden again when the run ends.
- **Its own browser** — JARVIS uses a dedicated Chromium/Chrome/Edge profile and output folder on Raspberry Pi OS, Ubuntu/Linux, and Windows. It never reuses your personal browser profile, cookies, saved passwords, or extensions.
- **Visible, one-task control** — read-only navigation, extraction, screenshots, and sourced research remain available. Clicking or typing requires the dashboard PIN plus the exact `ALLOW BROWSER CONTROL` phrase for that exact task; the grant expires and works once.
- **High-impact actions remain separate** — the browser bridge technically rejects state-changing HTTP methods (POST, PUT, PATCH, and DELETE) in addition to the model policy. It cannot silently send messages, submit forms, buy, upload files, delete data, change permissions, or type passwords/API keys/payment data. Gmail uses its own editable preview and `SEND EMAIL` approval.
- **Local PowerPoint, Word, and Excel output** — requests such as `Create a PowerPoint about solar energy`, `Write a Word report about my Pi`, or `Make an Excel expense tracker` produce real `.pptx`, `.docx`, or `.xlsx` files locally and open a download panel.
- **Current Google News with sources** — `Show Google News about Raspberry Pi` reads the public Google News RSS feed, treats it as untrusted evidence, and returns bounded headlines with citations. No Google API key is required for news.
- **Selected-app lens** — `/settings#screen` lets you explicitly select one screen, window, or browser tab for local preview and snapshot analysis. It does not silently capture or control arbitrary desktop apps.
- **Separate capability lanes** — the browser agent has no shell/file tools. Optional Pi workspace control has no browser/network tools. This prevents instructions hidden in a webpage from turning into host commands.

### 3.10 Codex-style research, visible email approval, and isolated Pi control

- **Search and answer with sources** — current web results and Google records are synthesized by the local Ollama model in a tool-free lane. Web pages, email text, calendar titles, and shared-file names are explicitly treated as untrusted data and can never instruct the Pi-control agent.
- **Draft first, always visible** — ask `Draft an email to name@example.com saying ...`. JARVIS creates a local draft and opens an editable To/Subject/Body preview. Drafting sends nothing.
- **Explicit Gmail sending** — one visible draft can be sent only when Gmail sending is enabled, the dashboard session is unlocked, the operations PIN is correct, and `SEND EMAIL` is typed exactly. Draft IDs expire after 15 minutes and work once.
- **Separate agent account** — OpenJarvis runs as `jarvis-agent`, not the dashboard owner. Optional shell/code/Git tools are restricted to `/srv/jarvis-workspace`; the agent has no sudo rule, dashboard `.env`, OAuth files, SSH keys, private home, or Docker socket.
- **Secure transport boundary** — the dashboard now binds to `127.0.0.1`. Use an SSH tunnel or Tailscale Serve HTTPS; private APIs reject remote plain HTTP, and forwarded HTTPS is trusted only from a loopback proxy.
- **Stronger voice acceptance** — wake phrases and captured command transcripts both require recent physical microphone energy when the audio analyser is available, rejecting silent speech-provider guesses.
- **Wake troubleshooting is visible** — first-run microphone permission can start from the main page, delayed final wake transcripts are accepted within a bounded six-second physical-voice window, and unsupported speech-recognition browsers report an actionable error instead of appearing silently armed.

### 3.9 browser agent, private live control view, and Pi tools

- **Read-only OpenJarvis browser inspection** — browser mode can search, navigate, screenshot, and extract in an isolated profile, but cannot type, click, submit, access files, or run shell commands. In host-control mode, browser/web tools are removed entirely.
- **Private live control view** — the PIN-authenticated dashboard listens to OpenJarvis lifecycle events on loopback and shows protected browser screenshots only while a browser or Pi-control tool is running. The view disappears and clears its last frame when the control run ends.
- **No credential leakage to the webpage** — the OpenJarvis API key stays in the Node service, OAuth files stay on the Pi, and neither is added to a browser URL. Live frames are served only through the existing authenticated dashboard session.
- **Opt-in Pi control** — `scripts/setup-openjarvis-pi.sh --host-control` enables shell, code, and Git only for the isolated `jarvis-agent` account inside `/srv/jarvis-workspace`. That service is network-sealed to loopback and has no browser/web tools. Root maintenance remains restricted to the dashboard user's PIN-and-phrase protected allow-list.
- **Stricter wake gate** — a final wake phrase must begin the transcript and coincide with recent physical microphone activity. This blocks middle-of-sentence “Jarvis” matches and silent recognition-provider guesses while keeping `Hey Jarvis`, `Jarvis`, and double-clap activation.

### 3.8 private tools, live screen, and false-hearing repair

- **False commands are rejected** — low-confidence recognition guesses can no longer become the recovered command sentence, and interim “Jarvis” guesses cannot activate the wake session.
- **Background audio no longer holds JARVIS forever** — raw microphone energy is debounced and can extend a command only after the speech recognizer confirms speech; the hard capture deadline never extends indefinitely.
- **Safer noisy-room defaults** — the recommended profile now uses 72% wake sensitivity, 55% minimum recognition confidence, 28% mic sensitivity, and 42% clap sensitivity.
- **Private Google Workspace access** — JARVIS can read Gmail, Calendar, Drive, Tasks, and Contacts through host-only OAuth files. Gmail sending is a separate opt-in approval action; tokens never enter the browser, model prompt, logs, or repository.
- **Guarded public web tools** — “Search the web for …” adds bounded live results and citations to the local model. “Open YouTube” opens a validated public URL on the JARVIS host; localhost, LAN, credential-bearing, and non-HTTP URLs are blocked.
- **User-controlled live screen link** — `/settings#screen` previews the selected display locally. Each AI view requires an explicit ANALYZE SNAPSHOT click and a configured local Ollama vision model; there is no silent or continuous capture.
- **Codex/OpenHands boundary remains visible** — chat, Google, search, websites, screen snapshots, telemetry, printer, and allow-listed maintenance tools are built in. Arbitrary code/shell/file changes still belong to the OpenJarvis `native_openhands` backend and dangerous operations stay PIN-confirmed.

### 3.7.1 microphone-held command capture

- The live microphone level detector now cancels the initial 15-second no-speech deadline as soon as real voice energy is heard, even before the browser produces transcript text.
- Final recognition segments stay queued while the mic still detects speech, preventing a sentence from being submitted halfway through.
- Brief natural pauses are tolerated with a 1.4-second end-of-sentence window before JARVIS submits the command.
- After audible speech ends, JARVIS allows 2.5 seconds for delayed command text; the separate wake gate accepts a final wake transcript for up to six seconds after physical microphone energy, then expires it.

### 3.7 wake command session

- Saying **“Hey Jarvis”** or double-clapping opens a focused sci-fi voice command window and plays the configured “Yes sir…” acknowledgement before command capture begins.
- The 15-second listening clock now starts after talkback finishes. No speech closes the temporary window without sending a request.
- Once speech begins, JARVIS waits for the end of the sentence instead of cutting it off at the original deadline, joins final recognition segments, and submits the complete command automatically.
- If the browser detects speech but never produces a final result, the best interim transcript is recovered after end-of-speech. If it produces no usable words, JARVIS opens a fresh 15-second retry window.

### 3.6 sensor and voice repair

- Invalid saved browser device values such as `undefined` are cleaned automatically, and stale camera/microphone selections retry once with the browser default instead of failing after permission is granted.
- Calibration now confirms the actual opened video/audio track labels, resumes the browser audio context, and reports permission, missing-device, and busy-device failures in plain language.
- Fish Audio voice `612b878b113047d9a770c069c8b4fdfe` is the configured primary JARVIS voice with `s2.1-pro-free`; browser voice substitution stays disabled unless `ALLOW_BROWSER_TTS_FALLBACK=true` is explicitly configured.
- Chromium's optional phrase-bias failure no longer disables recognition. Repeated browser-provider network failures enter audio-only mode without a retry storm and point directly to the explicit on-device language-pack installer in `/settings`.

## What is new in 3.5

- **Built-in JARVIS Search** — press `Ctrl/Cmd + K` or `/`, or long-press the neural field on touchscreens, to open a temporary command palette. Nothing is added to the resting fullscreen scene.
- **One searchable local index** — search intelligence layers, settings, live services, installed Ollama models, Docker containers, storage devices, and private knowledge/file nodes already exposed to the dashboard.
- **Search-to-AI fallback** — when a local destination is not enough, send the exact search text through the existing guarded local JARVIS chat route without adding a second model.
- **Voice search commands** — say `Open search`, `Search dashboard for …`, or `Find in JARVIS …`; voice and typed searches share the same result index.
- **Direct settings links** — search results can open the exact hidden settings section for devices, sensors, perception, voice, interface, or integrations.

## What is new in 3.4

- **One-click local speech pack setup** — `/settings` now shows an install control only when the browser reports that an on-device pack is downloadable for the selected language. Downloads happen only after that explicit click.
- **Local speech permission policy** — same-origin camera, microphone, and on-device speech capabilities are explicitly allowed while geolocation stays disabled.
- **No overlapping printer probes** — a slow or powered-off Moonraker device can no longer stack multiple two-second status requests on the Pi.
- **No overlapping monitor passes** — Docker, Ollama, OpenJarvis, operations, trace, and auto-repair monitoring stays single-flight even when a check takes longer than its interval.
- **Bounded browser polling** — telemetry requests now time out and recover instead of leaving a refresh lane permanently stuck; hidden-tab polling remains paused.
- **Safer recognition startup** — browser recognition-constructor failures enter the existing bounded retry path instead of leaving voice control stuck in a preparing state.

## What is new in 3.3

- **Arabic and multilingual commands actually survive processing** — Unicode letters and numbers are preserved instead of being stripped by the English-only transcript cleaner. Arabic wake phrases (`جارفيس`, `يا جارفيس`) are included in the default profile.
- **On-device recognition preference** — compatible browsers use an already-installed local language pack. If the experimental capability or pack is unavailable, JARVIS safely falls back to the browser speech provider instead of breaking voice control.
- **JARVIS vocabulary biasing** — editable terms such as OpenJarvis, Ollama, Docker, Moonraker, Klipper, Raspberry Pi, CodeAct, and OpenHands receive contextual recognition weight when supported.
- **Better microphone targeting** — the exact selected microphone track is passed to speech recognition on compatible browsers; unsupported browsers retain a safe provider-default fallback.
- **More reliable Pi operation** — audio analysis reuses its sample buffer, status refreshes cannot overlap, and expensive polling pauses while the dashboard tab is hidden, then refreshes immediately when visible again.
- **Expanded automated coverage** — tests now cover Arabic normalization/wake extraction, vocabulary deduplication, contextual phrase boosts, local-recognition selection, and selected-track fallback behavior.

## What is new in 3.2

- **Actual spoken commands** — the browser voice core now listens continuously after permission is granted, recognizes up to five alternatives, waits for `Hey Jarvis` or `Jarvis`, joins nearby final transcript segments, suppresses duplicate echoes, and sends the spoken command through the same guarded chat route as typed input.
- **More accurate wake matching** — configurable wake phrases, language/accent, confidence floor, end-of-command silence, common Jarvis mishearing correction, and false-trigger protection are available only in `/settings`.
- **Adaptive acoustic processing** — exact-device VAD and clap analysis now learns the room noise floor and supports echo cancellation, noise suppression, auto gain, sharper double-clap impulse checks, and talkback-aware listening pauses.
- **Voice-locked talkback** — Fish Audio wake replies retry once and never silently change into an unrelated browser voice. Browser fallback is opt-in with `ALLOW_BROWSER_TTS_FALLBACK=true`.
- **Reliable fullscreen talkback** — Fish audio is decoded through the microphone's active Web Audio engine instead of relying only on browser autoplay. If a fresh browser still requires activation, the reply is queued and the neural field pulses until the first click anywhere on the screen.
- **Restart-safe dashboard sessions** — authenticated browser sessions use a signed secret stored only under ignored `data/`, so service restarts no longer leave an apparently live dashboard with silently unauthorized voice requests.
- **Voice-reactive neural field** — the text-free particle scene changes light intensity, particle size, glow, and motion while listening, hearing, armed, thinking, speaking, or reporting an error.
- **Smoother camera gestures** — pointer movement, pinch state, and two-hand zoom now use temporal smoothing, pinch hysteresis, and lost-frame tolerance to reduce jitter.
- **Permission-safe auto start** — the microphone listener starts on first enabled visit when permission is prompt or granted, but never retries a denied permission. With the fullscreen page focused, press `V` for voice, `G` for gestures, or `Esc` to stop both without adding visible controls.

## What is new in 3.1

- **One screen only** — `/` renders only the living Three.js orbital particle field from the supplied reference crop. Every dashboard rail, metric card, header, footer, label, and text overlay is hidden.
- **No text inside the 3D scene** — system names are no longer drawn as canvas sprites. The visual is particles, wireframe geometry, paths, rings, and floating nodes only.
- **One model, multiple specialist AIs** — one `JARVIS_MODEL` powers JARVIS, CODEX, PROSPECTOR, SENTINEL, ARCHIVIST, FABRICATOR, and LINK roles.
- **Automatic role switching** — each request is classified locally and routed to the best specialist role without loading or swapping a second model. The particle formation and color change with the selected role.
- **Controls remain private** — `/settings`, authenticated APIs, voice/talkback, sensor selection, printer safeguards, and maintenance safeguards remain available without cluttering the main visual.

## What is new in 3.0

- **Complete visual rebuild** — the screen now has a luminous cyan/gold neural centerpiece, stronger spatial depth, readable glass rails, a brighter operations deck, and the dense technical framing shown across the supplied Instagram-style references.
- **Interactive reactor scan** — click or tap the center reactor to pulse the active intelligence layer and focus its live 3D system node. CORE, DOCKER, FABRICATOR, AGENTS, RESEARCH, and MEMORY retain distinct formations and colors.
- **Reference-driven composition** — a single hero object dominates the center while labelled constellations, a holographic floor, calibration rings, and restrained scan graphics add the layered visual detail missing from the previous build.
- **Actually readable telemetry** — CPU, RAM, GPU, thermal, storage, service, agent, printer, event, and maintenance text is larger and brighter without turning the fixed command screen into a scrolling webpage.
- **Non-blocking fullscreen** — the dashboard opens immediately. The top-right fullscreen control remains available, but the old center-screen entry gate no longer hides the interface.
- **Responsive command view** — tablets and phones receive a compact four-metric status strip, scrollable intelligence modes, a clear neural core, and an always-available command deck.
- **Matching settings overhaul** — `/settings` keeps its hidden protected route and live preview, but now uses the same readable contrast, larger controls, stronger selected states, and cinematic glass panels as the main display.

## What is new in 2.5

- **Rebuilt hidden configuration core** — `/settings` is now a matching full-screen JARVIS instrument with a compact section rail, fixed save bus, protected live preview, and no long page scroll on laptop or Pi displays.
- **Safe profile editing** — every change gets a clear unsaved state, live preview, one-click revert, recommended-profile staging, save progress, and navigation protection so edits cannot disappear silently.
- **Device-bus clarity** — laptop and Raspberry Pi hardware are visually separated, the active host is unmistakable, unavailable saved devices remain visible, and a dedicated rescan preserves valid selections.
- **Better sensor calibration** — camera framing, person lock, microphone meter, wake state, and explicit start/stop status now share one focused calibration screen. Changing a live sensor source safely closes the old stream.
- **Preview and search tools** — settings can be found by name, the dashboard preview switches between adaptive and Pi 16:9 framing, and accent presets update the real command screen immediately.
- **Sensor reliability fixes** — browser wake profiles now request the microphone correctly, empty listener profiles show a useful error, Pi polling cannot overlap, Pi camera frames size correctly, and all media tracks close on exit.

The 2.4 precision command-center design and every existing local operation remain included:

- **Precision reactor core** — the center is now a restrained, layered cyan/gold reactor with calibrated rings, a bright energy seed, mode-aware colors, and readable status diagnostics instead of a bright wireframe ball.
- **Cleaner spatial hierarchy** — background stars, sparks, filaments, and file links were reduced by more than half so the active 3D formation and selected node remain legible at a glance.
- **Readable instrument rails** — CPU, RAM, GPU, thermals, services, storage, and agent traces use larger values, clearer separation, stronger active states, and angled edge geometry inspired by the supplied references.
- **Rebuilt operations deck** — Docker, printer, continuous-monitor, and maintenance controls are taller and easier to read while staying inside one fixed fullscreen viewport.
- **Mode-linked diagnostics** — CORE, DOCKER, FABRICATOR, AGENTS, RESEARCH, and MEMORY now drive the reactor accent, layer number, link type, health label, particle formation, and command context together.

The 2.3 command-center structure and every existing local operation remain included:

- **Interactive intelligence layers** — the top-center CORE, DOCKER, FABRICATOR, AGENTS, RESEARCH, and MEMORY controls now morph the particle field into six distinct live 3D formations, retune its light, and update the command context.
- **Cinematic instrument rails** — the left and right sides are no longer large dashboard cards. They are thin translucent telemetry and agent-report instruments with edge rules, compact signals, and uninterrupted space around the neural core.
- **Unified command deck** — voice, typing, Docker, printer, persistent events, and guarded maintenance now form one angular bottom operations bus instead of disconnected boxes.
- **Reference-matched visual hierarchy** — cyan instrumentation, gold focus states, sparse technical typography, rotating calibration rings, edge labels, crosshairs, and a single dominant center follow the strongest full-screen homemade JARVIS references.

The 2.2 neural visualization and every existing local operation remain included:

- **Living neural intelligence core** — the center uses a GPU-animated field of thousands of particles and restrained sparks. Its cyan, gold, mint, and blue regions breathe, deform, rotate, and bloom independently instead of behaving like a static globe.
- **Reference-driven edge HUD** — the page now follows the supplied JARVIS reel language: one dominant intelligence visualization, fixed translucent system and agent rails, labelled orbital clusters, compact bottom operations telemetry, and a floating command console.
- **Reel-style system clusters** — functional nodes are presented as JARVIS, CODEX, PROSPECTOR, FABRICATOR, SECOND BRAIN, SENTINEL, Docker Matrix, and Google clusters while still opening the same real local data.
- **Zero-scroll responsive display** — laptop, Pi display, tablet, and phone layouts stay viewport-locked. On narrow screens the secondary rails collapse instead of turning the dashboard into a long webpage.

- **True fullscreen HUD** — `/` is edge-to-edge with no outer webpage gutters. The compact top-right control invokes the browser Fullscreen API; installed/mobile launches use a fullscreen web-app manifest. Browsers require a user press and do not permit pages to silently force fullscreen.
- **Interactive 3D knowledge galaxy** — a local Three.js scene combines a dense cyan/gold/magenta neural core, orbital calibration rings, system clusters, and metadata-only folder/file nodes. Drag to orbit, scroll to zoom, click a node, or mention a file/system name in chat and the camera flies to it.
- **Camera gesture controls** — the official MediaPipe Hand Landmarker runs locally in the browser. The selected browser camera supports pointer movement, pinch-to-select, pinch-drag rotation, and two-hand zoom. It auto-starts only after camera permission already exists; press `G` on the fullscreen page to start or stop it manually.
- **Moonraker printer telemetry** — the bottom HUD shows printer state, active file, progress, estimated time left, and nozzle/bed temperatures from the fixed `PRINTER_URL`. The server polls once every two seconds and streams normalized state to the screen.
- **Guarded print controls** — pause, resume, and cancel use fixed Moonraker endpoints. They require the operations PIN plus `PAUSE PRINT`, `RESUME PRINT`, or `CANCEL PRINT`; chat can open the confirmation screen but cannot execute an action automatically.
- **Private knowledge indexing** — only server-configured roots are scanned. The browser receives names and metadata, never file contents; hidden, dependency, data, credential, token, key, and secret paths are excluded, and symlinks are ignored.

The 2.0 agent, monitoring, maintenance, sensor, wake-word, Google, and Pi telemetry features remain included:

- **Code Assistant Visualizer** — reads recent OpenJarvis traces and separates `native_openhands` CodeAct activity into code/tool/result steps. It never invents activity when OpenJarvis is unavailable.
- **Deep Research Monitor** — shows `deep_research` traces and turns URLs returned by research into clickable citations.
- **Continuous Monitor Operative** — shows `monitor_operative` activity and keeps a private JSONL event history. Logs are compacted locally when they grow, preserving type totals and recent events.
- **Pi telemetry** — CPU, RAM, temperature, GPU when the kernel exposes a utilization counter, connected block storage, service state, and Docker container CPU/memory.
- **Docker-aware questions** — Docker/system questions receive a live read-only snapshot as local model context. No arbitrary Docker or shell command is exposed.
- **Private dashboard session** — the Pi installer generates a PIN, and camera/microphone status, settings, Google status, Docker data, chat, and controls stay locked behind a 12-hour `HttpOnly` session.
- **Guarded maintenance** — restart, repair, stop until reboot, persistent maintenance stop, and resume. Every action still needs the private operations PIN plus an exact confirmation phrase.
- **Constrained auto-repair** — restarts only allow-listed services that are not active, activating, or reloading. It pauses in maintenance mode and never executes model-generated shell commands.
- **Fully local wake controls** — official openWakeWord `hey jarvis` model plus double-clap detection on the selected Pi microphone. Browser/laptop testing supports local double-clap detection.
- **Hidden settings** — there is no settings button on the command screen. Open `/settings` directly. Controls appear on the left and a live command-screen preview stays on the right.
- **Exact device selection** — choose one V4L2 camera and one ALSA microphone. Other connected cameras remain untouched.

OpenJarvis documents `native_openhands` as a CodeAct agent that generates and executes Python, `deep_research` as multi-hop research with citations, and `monitor_operative` as a long-horizon agent with memory, compression, retrieval, and decomposition. This dashboard visualizes the official `/v1/traces`, `/v1/telemetry/stats`, and `/v1/memory/stats` data rather than simulating it. See the [OpenJarvis agent guide](https://github.com/open-jarvis/OpenJarvis/blob/main/docs/user-guide/agents.md) and [architecture overview](https://github.com/open-jarvis/OpenJarvis/blob/main/docs/architecture/overview.md).

## Security model

- The Pi service can listen on the LAN, but every non-health API is protected by the generated dashboard PIN. Session cookies are `HttpOnly` and `SameSite=Strict`.
- State-changing requests are same-origin checked.
- The dashboard sends only a fixed action name to a root-owned helper. Service names and shell text are not accepted from the browser.
- The root helper is limited by `/etc/sudoers.d/jarvis-command-center` to six exact commands.
- The helper manages only `ollama.service`, `openjarvis-api.service`, and `hatclanker.service`. It deliberately leaves `openjarvis-dashboard.service`, SSH, networking, and the OS running so you can resume maintenance remotely.
- “Stop until reboot” uses a lock in `/run`; Linux clears it on reboot.
- “Persistent stop” uses a lock in `/var/lib/jarvis-command-center`; it survives reboot until **Resume** removes it.
- Docker maintenance records the exact running container IDs before stopping them and resumes only those IDs.
- `.env`, dashboard logs, the wake Python environment, Google OAuth material, tokens, private keys, and audio files are excluded from Git.
- Google client secrets and tokens are never sent to the browser and are not included in the ZIP.
- The automation browser has its own profile; it never inherits personal cookies, extensions, saved passwords, or active logins.
- Interactive browser grants match one exact prompt, expire after ten minutes, and are consumed once. Uploads, secrets, payments, external sends, destructive actions, and permission changes are excluded from the browser tool set.
- Browser tools and host-control tools are never enabled in the same OpenJarvis configuration.

## Install on Raspberry Pi 5

Clone the maintained GitHub repository directly on the Pi:

```bash
git clone https://github.com/Sa3doonAlRa3doon/Jarvis-Edited.git ~/openjarvis-pi-command-center
cd ~/openjarvis-pi-command-center
chmod +x install-pi.sh scripts/setup-openjarvis-pi.sh
# Dedicated browser with one-task-approved click/type, no shell or file writes:
./scripts/setup-openjarvis-pi.sh
# OR, for the requested user-level Pi control:
./scripts/setup-openjarvis-pi.sh --host-control
./install-pi.sh
```

Use only one setup mode. The default installs the dedicated browser with one-task-approved click/type. Use `--read-only-browser` when you never want interactive browser input. Host-control mode is deliberately separate: it gives the isolated `jarvis-agent` ordinary access only inside `/srv/jarvis-workspace`; it does not make the model root and it disables browser/network tools. The dashboard's existing maintenance helper remains the only sudo path, and it accepts only its fixed service operations after the PIN and exact confirmation phrase.

To update an existing GitHub installation later:

```bash
cd ~/openjarvis-pi-command-center
git pull --ff-only origin main
npm install --omit=dev
sudo systemctl restart openjarvis-dashboard
```

Your local `.env`, OAuth files, logs, and wake environment remain untracked during updates.

Alternatively, copy this working folder from Windows PowerShell:

```powershell
scp -r "$env:USERPROFILE\Documents\Codex\2026-10-17\new-bot-im-working-on-called\outputs\openjarvis-pi-command-center" pi5@192.168.4.123:/home/pi5/
```

On the Pi:

```bash
cd ~/openjarvis-pi-command-center
chmod +x install-pi.sh scripts/setup-openjarvis-pi.sh
./scripts/setup-openjarvis-pi.sh --host-control
./install-pi.sh
```

The installer:

1. Installs production Node packages, Chromium, the root-owned Playwright MCP bridge, and FFmpeg/ALSA/V4L2 tools.
2. Creates `.wake-venv`, installs openWakeWord/ONNX Runtime, and downloads the official pretrained wake models once.
3. Generates and prints a private six-digit dashboard/maintenance PIN if `.env` does not already contain one.
4. Installs the fixed root helper and its exact sudoers rule.
5. Adds maintenance-lock conditions to the three allow-listed services.
6. Installs persistent `openjarvis-api.service` and `openjarvis-dashboard.service` units. Both bind only to loopback; OpenJarvis runs under the isolated `jarvis-agent` account with its browser profile and output under `/srv/jarvis-workspace`.

Save the generated PIN. It remains only in `~/openjarvis-pi-command-center/.env`. Unlocking the dashboard does not bypass the extra typed confirmation required for maintenance actions.

### Windows or desktop Linux workspace

Windows PowerShell can prepare the same private browser layout without touching your normal browser profile:

```powershell
cd "$env:USERPROFILE\Documents\Codex\2026-10-17\new-bot-im-working-on-called\outputs\openjarvis-pi-command-center"
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
node .\scripts\start-browser-mcp.mjs --check
```

On non-Pi Linux, use the same Node project and `scripts/start-browser-mcp.mjs`; install Chromium and point `JARVIS_BROWSER_EXECUTABLE` at it when auto-detection cannot find it. The `--check` command validates the executable, private profile, output directory, and headless mode without launching an agent session.

## Open it from the laptop

Remote plain-HTTP access is intentionally disabled. Keep this PowerShell SSH tunnel open (replace the Pi address if it changed):

```powershell
ssh -N -L 8787:127.0.0.1:8787 pi5@192.168.4.123
```

Then use:

- Command screen: `http://127.0.0.1:8787/`
- Hidden settings: `http://127.0.0.1:8787/settings`

Enter the installer-generated PIN when the private-console lock appears. For a permanent phone-friendly URL, put a TLS reverse proxy such as Tailscale Serve in front of `127.0.0.1:8787`; do not bind the dashboard directly to LAN HTTP.

The tunnel is optional for viewing the Pi dashboard and selecting Pi-attached devices, but required for reliable laptop `getUserMedia()` testing unless you add HTTPS.

## Camera, microphone, wake word, and clap

Open `/settings`, choose **This browser** for laptop testing or **Raspberry Pi 5 hardware** for Pi devices, select the exact camera/microphone, then save.

- Browser mode requests camera and microphone permission on the first enabled visit (or after **Start calibration**, **Test recognition**, `V`, or `G`); a denied permission is never retried automatically.
- Use a normal Chrome/Edge/Chromium tab for laptop voice testing. Embedded preview browsers may not expose `getUserMedia()` or `SpeechRecognition`, so they can display the neural field but cannot hear a wake phrase.
- After permission has been granted, the main screen can safely auto-start the enabled listener on later visits. Select the exact **Browser / Gesture Camera** in `/settings`; this is also how Ubuntu/Chromium on the Pi selects one camera while leaving other cameras untouched.
- Pi mode uses the selected `/dev/video*` and `plughw:CARD,DEVICE` paths only.
- Person detection runs the TensorFlow.js COCO-SSD model locally. The release ZIP includes it; GitHub installs download the official model shards once during `npm install`, verify their hashes, and then run offline.
- Voice activity and double-clap detection analyze signal levels locally; audio is not saved. Browser speech transcription uses the browser's installed speech-recognition provider and may use the operating-system default microphone even though VAD and clap analysis stay locked to the selected device.
- Open **Voice Core** in `/settings` to test recognition and talkback, choose English US/UK/UAE or Arabic UAE, set wake aliases, and tune confidence and command-end silence.
- The Pi `hey jarvis` model runs fully locally through openWakeWord. Its own documentation notes that saying only “Jarvis” may work but has a higher false-reject rate, so “Hey Jarvis” is the reliable phrase. See [openWakeWord’s Hey Jarvis model documentation](https://github.com/dscripka/openWakeWord/blob/main/docs/models/hey_jarvis.md).
- A high wake threshold reduces false activations; noisy rooms may need a higher clap threshold.
- Pinch sensitivity is adjustable in `/settings`. A larger value accepts a wider thumb-to-index gap; start near 42% and tune it for camera distance and lighting.

Check Pi hardware directly:

```bash
v4l2-ctl --list-devices
arecord -l
ls -l /dev/video*
```

## 3D printer / Moonraker

The default example is already set for your printer UI:

```dotenv
PRINTER_URL=http://192.168.4.74:4408
PRINTER_API_KEY=
PRINTER_TIMEOUT_MS=2800
```

Keep these values only in `.env` on the Pi. If your Fluidd reverse proxy at port `4408` does not forward Moonraker API routes, use Moonraker's direct local address instead, commonly `http://192.168.4.74:7125`. If Moonraker requires an API key, put it in `PRINTER_API_KEY`; it is sent only server-to-printer and never returned to the browser.

While the printer is off, the HUD correctly shows **OFFLINE** and print controls stay disabled. When it is online, try:

- “How much time is left on my 3D print?”
- “What are the nozzle and bed temperatures?”
- “Pause my print” or “End my 3D print” — JARVIS opens the guarded confirmation dialog and waits for the PIN and exact phrase.

No chat/model response can send G-code, choose another printer URL, or bypass the confirmation dialog.

## 3D knowledge roots

By default the galaxy indexes only this command-center project. To add trusted folders, set `KNOWLEDGE_ROOTS` in `.env` using the operating system path separator (`:` on Linux, `;` on Windows):

```dotenv
KNOWLEDGE_ROOTS=/home/pi5/Documents:/home/pi5/3d-models
```

Indexing is bounded to 180 nodes and four levels per refresh. It exposes file names, type, size, and modified time—not contents or absolute paths.

## Google Workspace

Google belongs to this JARVIS installation, not the Discord bot. Use **one OAuth 2.0 Client ID of type Desktop app**. Do not create an API key, and do not use a service account for a personal Gmail/Drive/Calendar account. Enable Gmail API, Google Drive API, Google Calendar API, Google Tasks API, and People API in the same project, then add your own Google account under OAuth test users while the app is in Testing.

The OAuth client secret posted in chat is exposed. Delete or rotate that OAuth client in Google Cloud before continuing, download the replacement client JSON, and never commit it or paste it into chat. A single replacement desktop OAuth client can authorize all five Google services; each service is still limited by the scopes you approve.

Forward the OAuth callback from a second PowerShell/SSH session:

```powershell
ssh -L 8789:127.0.0.1:8789 pi5@192.168.4.123
```

Then on the Pi:

```bash
jarvis connect gdrive
```

Open the authorization URL it prints. The callback travels through the tunnel to the Pi. Keep OAuth client JSON and token files outside this repository. The dashboard checks only for connector presence under `~/.openjarvis/connectors`; it never reads or exposes tokens.

The direct bridge can search Gmail, list Calendar events, search Drive metadata, list Tasks, and find Contacts. Email drafting is local and never sends automatically. Gmail sending is the only write action and stays disabled until you explicitly authorize the `gmail.send` scope.

To authorize or refresh all required read scopes plus `gmail.send`, keep this PowerShell tunnel open:

```powershell
ssh -N -L 8789:127.0.0.1:8789 pi5@192.168.4.123
```

Then run on the Pi:

```bash
cd ~/openjarvis-pi-command-center
npm run google:authorize
```

Open the printed Google URL, approve it with your configured OAuth test-user account, and wait for `token.json` to be saved privately. Then set this only in the Pi `.env` and restart:

```dotenv
GOOGLE_EMAIL_SEND_ENABLED=true
```

```bash
sudo systemctl restart openjarvis-dashboard
```

Usage example: `Draft an email to friend@example.com saying I will arrive at five.` Review and edit the exact draft, enter the operations PIN, type `SEND EMAIL`, and press **SEND THIS EXACT EMAIL**. Closing the draft sends nothing. Calendar, Drive, Tasks, Contacts, deletion, forwarding, and settings remain read-only.

## OpenJarvis and model setup

Expected loopback services:

- OpenJarvis: `http://127.0.0.1:8000`
- Ollama: `http://127.0.0.1:11434`
- Dashboard: `http://127.0.0.1:8787`

One model powers all specialist roles and the router changes instructions, tools, and visualization without loading a second model. The Pi-safe default is `llama3.2:1b`:

```bash
ollama pull llama3.2:1b
```

Set `JARVIS_MODEL=llama3.2:1b` in `.env`. For Pi memory pressure, keep `OLLAMA_MAX_LOADED_MODELS=1`.

Browser mode and host-control mode are intentionally different OpenJarvis instances/configurations. Browser mode can browse its private profile and, after one-task approval, click or type. Host-control mode can edit/code only inside the shared workspace and has no browser/network tools. JARVIS can create Office files directly without opening Microsoft Office or LibreOffice.

Run these OpenJarvis agents separately and their real traces appear in the visualizer:

```bash
jarvis ask --agent native_openhands --tools calculator,web_search "Inspect my project and explain the failing test"
jarvis ask --agent deep_research "Research the requested topic with citations"
```

## Maintenance behavior

The dashboard controls are disabled until the Pi helper and sudoers entry are installed.

- **Self repair:** starts only failed/inactive allow-listed services and restores saved containers.
- **Restart all:** restarts the allow-listed services and restores saved containers.
- **Stop until reboot:** creates `/run/jarvis-command-center/maintenance.lock`, stops allow-listed services, records and stops running containers. The lock disappears after reboot.
- **Persistent stop:** creates `/var/lib/jarvis-command-center/maintenance.lock`; services stay stopped across reboot.
- **Resume:** removes both locks, starts services, and starts only containers recorded at maintenance entry.

Every control action is written to `data/monitor-events.jsonl`. The command screen remains accessible because the dashboard, SSH, and networking are not in the allow-list.

## Useful checks

```bash
sudo systemctl status openjarvis-dashboard openjarvis-api ollama --no-pager -l
sudo journalctl -u openjarvis-dashboard -n 100 --no-pager
sudo /usr/local/sbin/jarvis-service-control status
curl http://127.0.0.1:8787/api/health
# Protected endpoints return 401 until a dashboard session is unlocked in the browser.
```

## Laptop development test

From Windows PowerShell:

```powershell
cd "$env:USERPROFILE\Documents\Codex\2026-10-17\new-bot-im-working-on-called\outputs\openjarvis-pi-command-center"
npm.cmd install
npm.cmd start
```

Open the command screen and `/settings`. Pi-only maintenance and openWakeWord controls correctly stay unavailable on Windows; system telemetry, the UI, live preview, browser camera/person detection, browser microphone level, local double-clap detection, and any reachable OpenJarvis/Ollama services can still be tested.
