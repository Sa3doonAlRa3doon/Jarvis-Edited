# OpenJarvis Pi Command Center 2.4.0

A private, Pi-first JARVIS operations screen for OpenJarvis, Ollama, Docker, Google connectors, cameras, microphones, and guarded maintenance. The dashboard stays inside a single fullscreen viewport without page scrolling; compact screens progressively hide secondary rails so the neural core and command line remain usable.

## What is new in 2.4

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

- **True fullscreen HUD** — `/` is now edge-to-edge with no outer webpage gutters. Press **Enter JARVIS** once to invoke the browser Fullscreen API; the compact top-right control toggles it afterward. Installed/mobile launches use a fullscreen web-app manifest. Browsers require that first press and do not permit pages to silently force fullscreen.
- **Interactive 3D knowledge galaxy** — a local Three.js scene combines a dense cyan/gold/magenta neural core, orbital calibration rings, system clusters, and metadata-only folder/file nodes. Drag to orbit, scroll to zoom, click a node, or mention a file/system name in chat and the camera flies to it.
- **Camera gesture controls** — the official MediaPipe Hand Landmarker runs locally in the browser. The selected browser camera supports pointer movement, pinch-to-select, pinch-drag rotation, and two-hand zoom. The camera starts only after **Enable Gestures** is pressed.
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

## Install on Raspberry Pi 5

Clone the maintained GitHub repository directly on the Pi:

```bash
git clone https://github.com/Sa3doonAlRa3doon/Jarvis-Edited.git ~/openjarvis-pi-command-center
cd ~/openjarvis-pi-command-center
chmod +x install-pi.sh
./install-pi.sh
```

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
chmod +x install-pi.sh
./install-pi.sh
```

The installer:

1. Installs production Node packages and FFmpeg/ALSA/V4L2 tools.
2. Creates `.wake-venv`, installs openWakeWord/ONNX Runtime, and downloads the official pretrained wake models once.
3. Generates and prints a private six-digit dashboard/maintenance PIN if `.env` does not already contain one.
4. Installs the fixed root helper and its exact sudoers rule.
5. Adds maintenance-lock conditions to the three allow-listed services.
6. Installs persistent `openjarvis-api.service` and `openjarvis-dashboard.service` units.

Save the generated PIN. It remains only in `~/openjarvis-pi-command-center/.env`. Unlocking the dashboard does not bypass the extra typed confirmation required for maintenance actions.

## Open it from the laptop

Direct Pi access works at:

- Command screen: `http://192.168.4.123:8787/`
- Hidden settings: `http://192.168.4.123:8787/settings`

Enter the installer-generated PIN when the private-console lock appears. For laptop camera/microphone testing, use localhost because browsers treat plain LAN HTTP as an insecure origin. Keep this PowerShell tunnel open:

Keep this PowerShell window open:

```powershell
ssh -N -L 8787:127.0.0.1:8787 pi5@192.168.4.123
```

Then use:

- Command screen: `http://127.0.0.1:8787/`
- Hidden settings: `http://127.0.0.1:8787/settings`

The tunnel is optional for viewing the Pi dashboard and selecting Pi-attached devices, but required for reliable laptop `getUserMedia()` testing unless you add HTTPS.

## Camera, microphone, wake word, and clap

Open `/settings`, choose **This browser** for laptop testing or **Raspberry Pi 5 hardware** for Pi devices, select the exact camera/microphone, then save.

- Browser mode requests permission only after **Start sensors** is pressed.
- The main screen requests camera permission separately only after **Enable Gestures** is pressed. Select the exact **Browser / Gesture Camera** in `/settings`; this is also how Ubuntu/Chromium on the Pi selects one camera while leaving other cameras untouched.
- Pi mode uses the selected `/dev/video*` and `plughw:CARD,DEVICE` paths only.
- Person detection runs the TensorFlow.js COCO-SSD model locally. The release ZIP includes it; GitHub installs download the official model shards once during `npm install`, verify their hashes, and then run offline.
- Voice activity and double-clap detection analyze signal levels; audio is not saved.
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

Google belongs to OpenJarvis, not the Discord bot and not this frontend. OpenJarvis’s shared Google OAuth flow can authorize Drive, Gmail, Calendar, Tasks, and Contacts together, but actual access is always limited to the APIs enabled in Google Cloud and scopes accepted on the consent screen.

Forward the OAuth callback from a second PowerShell/SSH session:

```powershell
ssh -L 8789:127.0.0.1:8789 pi5@192.168.4.123
```

Then on the Pi:

```bash
jarvis connect gdrive
```

Open the authorization URL it prints. The callback travels through the tunnel to the Pi. Keep OAuth client JSON and token files outside this repository. The dashboard checks only for connector presence under `~/.openjarvis/connectors`; it never reads or exposes tokens.

## OpenJarvis and model setup

Expected loopback services:

- OpenJarvis: `http://127.0.0.1:8000`
- Ollama: `http://127.0.0.1:11434`
- Dashboard: `http://127.0.0.1:8787`

Default task routing:

- General: `qwen3.5:4b`
- Coding/Docker: `qwen2.5-coder:7b`
- Reasoning/research: `qwen3.5:9b`

Install models:

```bash
ollama pull qwen3.5:4b
ollama pull qwen2.5-coder:7b
ollama pull qwen3.5:9b
```

For Pi memory pressure, keep `OLLAMA_MAX_LOADED_MODELS=1` so only one task model remains loaded at a time.

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

