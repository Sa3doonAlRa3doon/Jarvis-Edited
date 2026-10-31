# OpenJarvis Pi Command Center 3.31.0

### 3.31.0 private browser preview

- **Immediate own-screen feedback** — an explicit public `open <website>` request
  now captures one short-lived, read-only preview in `/workspace` while the
  isolated Camoufox browser loads. The preview uses a fresh Playwright-compatible context with no
  cookies or persistent storage, revalidates every HTTP(S) sub-request against
  the private-network guard, caps the PNG at 6 MiB, and expires after 90
  seconds. The **REFRESH PREVIEW** control captures a new bounded frame for the
  same public URL without reusing browser state; while the preview is visible,
  JARVIS performs one bounded refresh every 45 seconds and pauses when the tab
  is hidden or a local display share is active. Continuous screen viewing still
  requires the visible **SHARE YOUR SCREEN** action.
- **No control implied** — preview status is labeled `BROWSER PREVIEW`, never
  `AGENT CONTROL`; it cannot click, type, submit, upload, send, purchase,
  delete, log in, remove ads, or bypass a paywall. The existing one-task
  approval and transient frame rules remain unchanged for interactive browser
  work.
- **Configuration** — `JARVIS_BROWSER_PREVIEW_ENABLED=true` and
  `JARVIS_BROWSER_PREVIEW_TIMEOUT_MS=12000` are documented in `.env.example`.
- **Profile reuse** — public navigation opens a new tab in JARVIS's dedicated
  browser profile when that profile is already running, instead of spawning a
  detached window for every request. The personal browser profile is never
  reused.

### 3.31.0 capability-aware local vision check

- **Read-only Pi acceptance runner** — `npm run smoke:pi` (or
  `bash scripts/pi-smoke.sh --strict`) checks 64-bit ARM, Node, Ollama,
  dashboard/OpenJarvis health, the configured local vision tag, the one-model
  memory limit, V4L2 cameras, ALSA microphones, the optional local Vosk command
  model/runtime, printer reachability, same-host printer-camera snapshot
  discovery, and OBS configuration. It never sources
  `.env`, prints credentials, changes services, captures media, or sends a
  printer/OBS action. Optional hardware is reported as a warning; `--strict`
  fails only on required runtime/model failures. The
  Node entrypoint gives a clear Pi/Linux instruction on Windows instead of
  failing with a missing-Bash error.

### 3.31.0 deterministic local status lane

- **Fast local answers for operations** — questions such as “What is my 3D
  printer status?”, “How many Docker containers are running?”, and “Show CPU,
  RAM, disk, GPU, temperature, and service health” now use a bounded local
  summary instead of waiting for model synthesis. The lane is read-only,
  rejects mutation or mixed-domain prompts, and includes the actual source
  status so an offline printer or Docker engine is reported honestly.

### 3.31.0 bounded multi-purpose synthesis fallback

- **No silent 502 on CPU-only hosts** — a cross-domain request such as “check
  my printer, weather in Dubai, and latest Gmail” collects each explicit
  read-only tool result first. If the local Ollama model misses its total
  synthesis deadline, JARVIS returns a deterministic evidence summary with
  the specialist lanes, provider errors, and citations instead of dropping the
  request. The response is marked `read-only-fallback`/`degraded: true`; it is
  not presented as a model answer and never invents unavailable data.
- **Visible specialist assignments** — multi-purpose requests expose bounded
  FABRICATOR, CONNECTOR, RESEARCH, SOCIAL, MONITOR, CODEX, or other lane
  assignments and the installed local model selected for each. This is routing
  metadata only, not hidden chain-of-thought or a claim that every lane made a
  separate model call.
- **Pi response budget** — mixed requests use
  `MULTI_PURPOSE_OLLAMA_TIMEOUT_MS` (18 seconds by default) instead of waiting
  the full general chat budget. If the local model is still warming, the
  deterministic evidence summary arrives sooner; raise the value in the
  private `.env` only when the host can afford the extra latency.

### 3.29.0 conversational engineering lane

- **Architect → Critic → Debugger from chat** — ask “run the Architect Critic
  Debugger unit checks,” “run the full engineering checks,” or “self-correct
  the browser checks.” Browser/UI wording is routed to the Camoufox-only
  recipe; JARVIS starts the same fixed, bounded recipes exposed by
  `/api/engineering/pipeline`, immediately returns a run ID, and keeps the
  workspace status card updated while the Critic evaluates command evidence.
  Profile selection is deterministic (`unit`, `check`, `camoufox`, `live`, or
  `full`), retries are capped at three, and no model-generated text becomes a
  shell command. A `PIPELINE` shortcut is available in the workspace directive
  channel.
- **Multi-purpose coordination remains explicit** — the conversational lane is
  one independent capability in the broader local router; it does not copy or
  invoke Dexter code, assets, authentication, or paid-feature gates.

### 3.28.0 clean-room multi-purpose orchestration

Cross-domain requests now show a bounded fan-out plan before execution. JARVIS
detects the named capability lanes (for example printer + weather + Gmail),
routes synthesis through the local coordinator, and exposes the lane count in
the Mission Inspector. This is an independent implementation based on the
observable workflow, with no Dexter binaries, assets, credentials, or paid
access copied into the project.

The private workspace also includes an independent local stats deck covering
OBS, music, desktop, automations, specialist agents, and explicit read-only
states for external socials/viewers/chat. It is a status surface, not a claim
that Twitch, Discord, or another external service is connected.

Ask “show me the current live deck stats” (or ask for the current scene,
viewers, chatters, bitrate, now playing, or automations) for the same bounded
snapshot in chat. The response is served by the local stats lane without a
model warm-up and labels unavailable external metrics as `N/A`.

The same deck now exposes voice readiness from the selected local source:
`BROWSER`, `STARTING`, `READY`, `ARMED`, or `OFFLINE`, plus the physical gate,
bounded signal-to-noise ratio, and last wake event. These values are diagnostics
only; a transcript cannot authorize a wake or command without fresh physical
microphone evidence.

Ask “is my microphone and wake gate ready?” for an immediate local diagnostic
response. It reports the same bounded voice snapshot as the deck instead of
waiting for the model router; browser mode explicitly says that the active
page owns the microphone measurement, while Pi mode reports the listener gate.

### Local multipurpose briefing lane

- **Morning briefing** — say “Good morning,” “start my day,” ask “morning briefing,” or use the command-screen shortcut. JARVIS combines host CPU/RAM/services, default-location weather, current technology headlines, Docker, printer state, and Google Calendar when its OAuth probe is live. It is read-only, cites public sources, and clearly reports unavailable connectors instead of pretending they worked.
- **Operator style controls** — the protected Voice Core settings can choose JARVIS Professional, Warm Assistant, Technical Operator, or Focused Command, plus short/normal/detailed response length. The preference changes phrasing only; it never grants tools, changes approvals, or weakens safety boundaries.
- **Speech-shape wake floor** — a recent physical mic burst now also needs a minimum speech-shape score before it can authorize “Hey JARVIS” or a captured command. Provider text remains bounded by the physical-mic epoch and delayed-transcript grace window, reducing wakes from fans, clicks, and other short noise bursts.
- **Pi DC-bias correction** — the local ALSA listener removes each PCM frame’s DC offset before RMS, peak, zero-crossing, and crest measurements. A biased USB/analogue input can no longer inflate the physical wake/clap gate as if it were speech, while the centered values remain local and bounded.
- **Phonetic wake recovery** — common bounded recognition variants such as `jarvish`, `jarvys`, `jarvid`, and `jarvice` are canonicalized to JARVIS before the existing physical-mic and confidence gates run. This improves missed wakes without accepting unrelated names such as `Travis`.
- **Frequency-aware voice gate** — when the dashboard browser exposes analyser bins, the same gate now rejects near-pure high-frequency interference (notification chirps, fan whine, and keyboard squeaks) while preserving speech-band energy; Settings shows the high-band decision instead of hiding it behind a generic microphone percentage.
- **Per-microphone calibration profiles** — each selected browser microphone keeps its own bounded noise-floor/SNR profile under a hashed local key (at most eight profiles). No audio or raw device identifier is uploaded, and switching between laptop, USB, and Pi microphones no longer reuses another device’s learned floor.
- **Hot-plug device recovery** — Settings listens for browser `devicechange` events and refreshes the camera/microphone list after a short debounce. The main command screen also stops an active voice/gesture listener when hardware changes, so JARVIS never silently switches inputs; choose the replacement in Settings and re-enable it.
- **Quiet-speech headroom** — the default browser gate no longer imposes an unnecessarily high fixed RMS floor in a quiet room. The learned noise floor, speech-shape, crest, zero-crossing, and spectrum checks still have to agree, improving soft-speaker detection without opening a hum/impulse shortcut.
- **Pi wake score window** — the fully local OpenWakeWord listener now requires one full-threshold score plus a nearby soft score inside a three-frame window, and clears that history whenever the physical microphone gate goes quiet. A single 80 ms model spike cannot wake JARVIS by itself.
- **Calibration visibility** — Settings now shows `NO LOCAL PROFILE`, `DEFAULT MIC`, or the selected mic’s bounded floor/SNR so a quiet or misheard wake can be diagnosed before saving a new profile.
- **Selective calibration reset** — the device bus can clear only the selected browser microphone’s local profile, stopping an active calibration first; other microphones and server settings remain untouched.
- **Immediate own-screen handoff** — after the browser grants a display stream, the private screen switches to `LOCAL SCREEN LIVE` immediately while video playback settles in the background; this avoids a false OFF state on slower Pi hardware.
- **TTS echo guard** — JARVIS suppresses one short speaker-tail window after talkback so its own reply cannot become a fresh wake or command. Explicit barge-in keeps the live interruption path available.
- **Real browser talkback check** — the Camoufox smoke path now requests the configured Fish Audio acknowledgement, decodes it through a real `AudioContext`, and briefly plays it, so a successful server response cannot mask a silent browser playback failure.
- **Protected Google reauthorization handoff** — when Google reports a deleted or disabled OAuth client, Settings can start the existing local Desktop OAuth helper and expose only its consent URL. Credentials, refresh tokens, and the callback listener remain on the JARVIS host; after consent, press **VERIFY GOOGLE** to re-probe all five connectors.
- **Bounded Google connector replies** — Gmail, Calendar, Drive, Tasks, and Contacts read-only requests return a direct, bounded summary immediately when they are the only requested tool. A deleted/disabled OAuth client is reported directly instead of being sent through a slow model-synthesis lane; successful reads never expose tokens or credential fields.
- **Fast public-data replies** — single weather, map, nearby-place, alert, time, sunrise, currency, holiday, earthquake, ISS, dictionary, Wikipedia, crypto, and GitHub lookups return a bounded cited summary immediately. Mixed questions still use the local model with the API response marked as untrusted evidence.
- **Keyboard wake shortcut** — while the command screen is focused, `Ctrl+Alt+D` opens the same local acknowledgement and 15-second command window as a wake phrase. It is only a UI wake path; it does not bypass microphone permission or approve browser, desktop, email, printer, OBS, or PDF mutations.
- **Dexter-compatible talk shortcut** — `Ctrl+Alt+Space` is an additional push-to-talk path (alongside `Ctrl+Space`) and opens the same guarded 15-second command session; it does not bypass microphone permission or approvals.
- **Bounded conversation mode** — the Voice settings can opt into one follow-up capture after a voice answer, matching the useful conversational flow seen in desktop assistants without leaving the microphone permanently open.
- **Keyless GitHub research lane** — ask “search GitHub for local voice assistants” or name a public `owner/repository`. JARVIS reads at most five public repository records through GitHub’s REST API, returns source links, and never writes, stars, clones, or uses a GitHub token.
- **Public social research lane** — the SCOUT specialist is now visible in the mission plan and capability matrix for public GitHub, Instagram, Reddit, YouTube, Twitch, Discord, community, creator, repository, and channel research. It is citation-first and read-only: no login, posting, messaging, reactions, uploads, ad removal, paywall bypass, or permission changes.
- **Mission preflight** — every typed or spoken chat request is classified before execution into a specialist route, local/public/Google/browser sources, read-only steps, and any required approval. The plan is redacted, does not execute tools, and keeps secret entry, silent external mutations, and unselected screen capture disabled.
- **Multi-purpose capability matrix** — the private workspace exposes the broad product shape seen in the public Dexter reference without copying it: bounded knowledge indexing, Architect → Critic → Debugger checks, host-local analytics, morning briefings, and keyless maps/weather/time are visible alongside the existing browser, printer, OBS, media, Office, routines, and Google lanes. Search the command palette for “knowledge,” “analytics,” “engineering,” “briefing,” or “map” to jump to each lane.
- **Live deck parity lane** — the private workspace now adds a compact Dexter-inspired deck for OBS state, current scene, stream health, dropped-frame percentage, recording, replay buffer, virtual camera, staged media, and read-only routine counts. It is telemetry only; OBS and other mutations remain behind their existing PIN-and-phrase gates.
- **Workspace directive channel** — the private screen now has its own small JARVIS input with health, Docker, print-ETA, and briefing shortcuts. It uses the same local model router as the command screen, shows the route/model/result in the current-run card, and can play the latest response through the configured Fish Audio voice with an explicit TALK button. It never grants browser, desktop, email, printer, OBS, or PDF mutations implicitly.
- **Mission preview** — the workspace directive channel now has a **PLAN** action that shows the selected specialist, local model, multi-purpose fan-out lanes, bounded steps, approvals, and warnings before the request runs. It is a deterministic preview only: it never opens a browser, calls a connector, changes a service, or grants permission.
- **Fish Audio resilience** — the server retries one transient 500/502/503/504 Fish Audio response with a short bounded backoff, and Settings displays that policy next to the selected voice. Authentication errors, rate limits, and other client errors are never retried, and the configured voice is never silently substituted unless the explicit browser-fallback setting is enabled.
- This workflow is an independent implementation of observable assistant patterns described in public Dexter and OpenJarvis materials; it does not copy proprietary binaries, source, assets, authentication, or paid-feature gates.

### 3.27.0 private website launcher

- **Workspace-native navigation** — `/workspace` now has a compact **PRIVATE BROWSER** launcher. Enter a public URL or supported site alias, and JARVIS validates it through the same isolated browser route before opening it. The first page load appears as a short-lived read-only **BROWSER PREVIEW**; use **REFRESH PREVIEW** for another fresh frame, or **SHARE YOUR SCREEN** to choose the browser window/display for continuous local viewing, then **EXPLAIN VIEW** for one approved local snapshot.
- **Public source shortcuts** — the private browser launcher includes one-click read-only chips for Twitch, Discord, GitHub, Reddit, Instagram, and Google News. They only fill the existing validated public-site route; they do not reuse credentials or submit actions.
- **Same browser boundary** — the launcher is public/read-only and never exposes cookies, tokens, credentials, private-network targets, ad removal, paywall bypass, login bypass, or silent form submission. It is an input surface for the existing guarded browser lane, not a generic URL proxy.
- **Verified integration state** — the Settings workspace card distinguishes Stirling `SERVER-SIDE // VERIFY`, `PROCESSING VERIFIED`, and `PROCESSING KEY REJECTED`; a configured-but-rejected key no longer appears as ready.

### 3.27.0 printer-camera workspace lane

- Added a private, read-only printer-camera snapshot card to `/workspace`. JARVIS first tries bounded same-host Fluidd/Mainsail paths (`/webcam/?action=snapshot` and `/webcam2/?action=snapshot`, including the adjacent 4409 port used by some setups), then accepts an explicit `PRINTER_CAMERA_URL` for a custom JPEG/PNG/WebP/GIF endpoint. It refreshes one bounded frame every five seconds, and **EXPLAIN VIEW** can read one approved printer snapshot through the local vision model when a frame is live. It never exposes the printer key or acts as a generic URL proxy. The standard snapshot paths are documented by the [Creality helper camera guide](https://github.com/Guilouz/Creality-Helper-Script-Wiki/blob/main/docs/helper-script/usb-camera-support.md).
- **Printer-camera recovery** — if the printer is powered off when JARVIS starts, same-host auto-discovery records the failure without scanning elsewhere, then retries once every 30 seconds while the private workspace is open. Turning the printer on therefore makes its camera appear without restarting JARVIS; configured custom endpoints keep their existing five-second bounded frame retry.

### 3.27.0 bounded local model recovery

- **Runtime model cascade** — specialist routing still starts with the selected local model, but a transient Ollama runner/load failure now retries up to two additional installed local models in a bounded order: routed specialist, primary model, then Pi-friendly fallbacks. The response and workspace identify the model that actually answered. No model is downloaded and no cloud provider is contacted.
- **Bounded drafting and artifact generation** — Gmail drafts and local DOCX/PPTX/XLSX planning use the installed-only specialist cascade and a shorter `OLLAMA_STRUCTURED_TIMEOUT_MS` total deadline (30 seconds by default). If every local JSON attempt expires, the response identifies the deterministic local fallback instead of labeling it with a model that did not answer.

### 3.26.2 multi-purpose PDF repair lane

- Added a bounded Stirling **Repair PDF** operation alongside compression, OCR, and PDF-to-Word conversion. The clean-room JARVIS integration accepts only a local PDF inside configured private roots, keeps the API key server-side, and stores the returned artifact locally.

### 3.26.1 local runtime hardening

- **Local-only Ollama defaults** — `.env.example` and the Pi installer set `OLLAMA_HOST=127.0.0.1:11434`, `OLLAMA_NO_CLOUD=1`, and `OLLAMA_MAX_LOADED_MODELS=1`. Windows uses the same values from `.env`; restart Ollama after changing them so the model router stays on the host and swaps one model at a time within Pi 5 RAM.
- **Camera recovery** — selected devices and browser defaults get up to three short, bounded retries for transient release races before a stale selection falls back to browser defaults. Denied permissions never retry; the Camoufox smoke harness releases page-owned media tracks and retries an isolated media probe only when Firefox invalidates a remote object during teardown.
- **Pi room-noise tracking** — the local wake listener now follows a sustained non-speech floor upward after a fan, HVAC, or USB-gain change while refusing to learn from speech-shaped frames; the gate remains bounded and sentence-safe.
- **Pi model-path guard** — `install-pi.sh --stt` normalizes `JARVIS_STT_MODEL_DIR`, accepts only a project-owned `models` subdirectory, and refuses to delete an existing incomplete target. A mistyped path cannot turn a model retry into a recursive delete outside the project.

### 3.26.0 live website and device context

- **Private live website view** — `/workspace` now combines a protected isolated-browser preview with an explicit user-selected display share. Say “open Reddit” or another supported website alias to launch it on the JARVIS host; JARVIS shows one short-lived read-only preview and lets you refresh it without cookies. Press **SHARE YOUR SCREEN** when you want a continuous visible website stream. External browser windows are never captured silently.
- **Own-screen fullscreen mode** — the `/workspace` center stage has a browser-native **FULLSCREEN** control. It enlarges only the private JARVIS screen, keeps the selected frame local, and exits with the button or the browser Escape key; it does not grant browser, host, or website control.
- **Explain the current view** — **EXPLAIN VIEW** sends exactly one compressed, user-approved screen frame to the configured local Ollama vision model. The result is shown in the workspace, with a compact five-bullet mode available from **COMPACT VIEW**. The live display stream stays in the browser and is not uploaded continuously.
- **Pi camera context** — the workspace shows a single frame from the selected `/dev/video*` device when the Pi source and camera are configured. It never enumerates or captures an unselected camera, and Windows correctly reports that Pi camera capture is unavailable.
- **Clear website boundary** — JARVIS can open, display, summarize, and locally compact visible pages. It does not remove ads, bypass paywalls, evade logins, or silently submit forms. Interactive browser actions remain a separate one-task PIN approval.

### 3.25.0 deterministic engineering pipeline

- **Architect → Critic → Debugger** — the local `npm run pipeline -- --task "..." --profile full --max-attempts 3` command and protected `/api/engineering/pipeline` route run only fixed, bounded test recipes. The `full` recipe uses deterministic Camoufox media so it is reproducible on a laptop without attached devices; run `npm run pipeline -- --profile camoufox` separately for the real camera/microphone acceptance. Architect records the acceptance plan, Critic accepts or rejects exact command evidence, and Debugger classifies a failure and points to the smallest surgical fix. A failed recipe may be rerun up to the explicit bounded attempt limit, with every attempt recorded; no model output becomes a shell command or patch automatically.
- **Protected workspace visibility** — `/workspace` shows the pipeline state beside the model router. Inputs are workspace-relative and reject `.env`, OAuth, tokens, credentials, `data/`, dependencies, build paths, traversal, oversized patches, and unknown commands. Evidence is redacted before it is returned or recorded.
- **Cross-platform runner** — Windows invokes npm through its bundled Node CLI with `shell:false`, so the same bounded recipes work on Windows, Linux, and the Pi without turning user text into a shell command.
- **Adaptive mic startup** — browser VAD and the Pi double-clap listener learn a short local noise floor before accepting activation, then keep physical microphone evidence separate from provider transcripts.
- **Server-side Stirling PDF lane** — the protected command screen and chat route can compress PDFs, OCR scanned PDFs, and convert PDFs to DOCX through Stirling. Inputs are restricted to configured private roots, the API key is sent only in the Node service's `X-API-KEY` header, and processed files return to the local artifact window.

### 3.24.4 model router visibility

- **Visible model bus** — the private workspace service rail now shows the number of local Ollama models and an explicit `MODEL ROUTER // AUTO SWITCH` row, making specialist routing and Pi-local availability visible during a run.

### 3.24.3 resilient multi-model routing

- **Installed-model auto-selection** — specialist prompts keep their configured model when it is installed, fall back to `JARVIS_MODEL` when needed, and finally select a small installed Pi-friendly model if both configured choices are absent. The selector never downloads a model or calls a cloud provider, and the HUD marks the fallback.
- **Role-aware model recovery** — when a configured specialist tag is missing, the router first checks compatible models already installed locally (for example, the coder lane can use `qwen2.5-coder:7b` and the research lane can use `qwen3:8b`) before using the primary model. The capability matrix exposes the requested tag, installed state, and active fallback so a model switch is visible rather than guessed.
- **Bounded OpenJarvis handoff** — a stalled OpenJarvis chat call now yields to the local Ollama cascade after `OPENJARVIS_CHAT_TIMEOUT_MS` (45 seconds by default) instead of holding the voice/search session for the full model timeout.
- **Bounded local model attempts** — `OLLAMA_CHAT_TIMEOUT_MS` is a total budget shared by the installed-model cascade, so a runner that warms indefinitely yields to the next role-compatible local model and the UI can finish the request.
- **Role-aware model recovery** — when a configured specialist tag is missing, the router first checks compatible models already installed locally (for example, the coder lane can use `qwen2.5-coder:7b` and the research lane can use `qwen3:8b`) before using the primary model. The capability matrix exposes the requested tag, installed state, and active fallback so a model switch is visible rather than guessed.

### 3.24.2 voice evidence diagnostics

- **Physical mic trace** — the protected Voice Core settings panel now shows the speech-shaped gate, signal-to-noise reading, physical onset epoch, and recognition path. Provider text is visibly separated from fresh microphone evidence, so a replayed browser transcript cannot look like a real command.

### 3.24.1 physical voice evidence lock

- **Fresh-mic command boundary** — every focused “Hey JARVIS” command session records the microphone evidence epoch at the moment capture opens. Browser recognition text is accepted only after a new speech-shaped onset from the selected microphone, while delayed final text from that same real utterance remains inside the bounded grace window.
- **Stale-provider quarantine** — recognition buffers replayed after a restart, acknowledgement, or silent interval can no longer overwrite the command transcript just because their confidence is high.

### 3.24 local media deck

- **Host-local music and ambient staging** — JARVIS can queue, stage, pause, resume, skip, stop, and inspect track metadata through chat or the protected settings deck. It keeps a bounded queue/history on the host and never claims to have changed Spotify, YouTube, Discord, or another external service.
- **Media specialist routing** — music, playlist, podcast, and ambient prompts route to the CURATOR role with an optional `MEDIA_MODEL` while preserving the primary-model fallback.
- **Public-social specialist routing** — read-only Instagram, Reddit, Twitch, Discord, YouTube, and GitHub discovery prompts route to the SCOUT role with an optional `SOCIAL_MODEL`. The route is citation-first and cannot log in, post, message, react, upload, remove ads, or bypass a paywall.

### 3.23.1 safer conversational routing

- **Normal questions stay in chat** — phrases such as “answer the question” and “respond with a summary” no longer trigger the outbound-message safety gate. Real email, social, form, and reply actions still require their dedicated approval lane.

### 3.23 host-local analytics

- **Private activity summary** — `/workspace` now shows a bounded 24-hour count of events, wake activity, CPU/RAM, service availability, and local Broadcast Kit activity.
- **Voice-queryable** — ask “show local activity analytics,” “what happened?”, or “how many local events happened today?” to receive the same deterministic host-local snapshot through the monitor route without waiting for a model warm-up.
- **No telemetry upload** — analytics are derived from the existing local event store and current host probes; no new cloud analytics service or external collector is enabled.

### 3.23.1 settings reliability

- **Queued voice auto-tune** — if AUTO-TUNE VOICE GATE is pressed while the protected settings profile is still loading, JARVIS queues the action and applies it after initialization so the final profile load cannot silently overwrite the user’s calibration.

### 3.22 local Broadcast Kit control deck

- **Settings controls** — the protected integrations screen can start a local timer, open a local poll, and queue read-aloud text without requiring a typed chat prompt.
- **Same local-stage boundary** — these controls only update the host-side Broadcast Kit; they do not post to Twitch/YouTube/Discord, send messages, or control OBS.

### 3.21 local Broadcast Kit

- **Dexter-inspired stream companion** — JARVIS now has host-only timers, polls, giveaways, saved replies, chat-command templates, and a read-aloud queue. Say “start a timer…”, “create a poll…”, “start a giveaway…”, “save a reply…”, “add command…”, or “read this aloud…” to stage them locally.
- **No accidental outbound actions** — the kit is explicitly `local-stage`: it does not post to Twitch/YouTube/Discord, send chat messages, or control OBS. External chat and OBS mutation remain separate approval lanes.
- **Inspectable state** — Settings shows live counts for each kit, while `/api/broadcast/state` and `/api/broadcast/action` are session-gated and bounded.
- **Physical-voice truth in the HUD** — a browser provider `speechstart` event no longer changes JARVIS to “hearing” unless the selected microphone also produced recent speech-shaped energy; provider guesses remain rejected and hidden from command flow.

### 3.20 local memory and reminders

- **Host-only notes** — “remember …” and the integrations panel save searchable notes to ignored `data/memory.json`; note contents never enter Google, the browser, or GitHub.
- **Local reminders** — “remind me in 20 minutes to …”, “remind me tomorrow to …”, and explicit times create local reminders. Due reminders are recorded in the activity stream and can be completed or removed from the protected settings screen.
- **Bounded storage** — note/reminder counts, titles, dates, and tags are validated and capped before persistence; this lane has no shell, browser, email, printer, OBS, or external-write access.
- **Resilient keyless lookup** — the dictionary lane falls back to Datamuse when Dictionary API is temporarily unavailable, while preserving both source links.
- **Isolated browser smoke** — Camoufox end-to-end checks use the installed camera and microphone by default, so the verification covers the real laptop path; CI can opt into deterministic devices with the explicit `--fake-media` flag. The report labels that path **Synthetic** so a deterministic pass is never mistaken for physical hardware evidence.
  The synthetic profile uses Camoufox's documented `firefox_user_prefs` fake-media switch and a canvas-backed display stream for the screen-share retry check; it still does not claim that a physical camera, microphone, or display picker was available.
- **OBS browser-source overlay** — Settings can copy a tokenized, read-only `/overlay` URL for OBS. It reports the current scene, live stream health, recording/replay/virtual-camera state, and recent local activity without granting OBS control.

### 3.19 clean-room local routines

- **Multi-purpose routine board** — `/settings#integrations` now lets you schedule local read-only checks for Pi health, Docker, the 3D printer, default-location weather, Google News, Google Calendar, or the full morning briefing.
- **Persistent and inspectable** — routines are stored in the host-only `data/routines.json`, appear in the activity stream, expose their next run and latest result, and can be run, paused, resumed, or removed from the settings screen.
- **Safety boundary** — the scheduler never receives a browser-control grant, operations PIN, email sender, printer/OBS action, or arbitrary shell path. Mutation-like routine prompts are rejected and Calendar/Google routines remain read-only.
- **Matched microphone calibration** — the main listener and Settings sensor screen now share one speech-shaped adaptive gate. It reports bounded signal-to-noise, crest, and speech-shape diagnostics, rejects steady hums, and resets the learned floor when a different microphone is selected.

### 3.18 OBS stream-health lane

- **Readable broadcast health** — the OBS service bus and capability matrix now expose live/idle state, congestion, skipped frames, total frames, and a bounded `GOOD` / `WARNING` / `DEGRADED` health label. JARVIS can report stream trouble before a user asks it to change a scene or output.
- **No new control authority** — health is read-only telemetry. Stream, recording, replay, virtual-camera, scene, mixer, and source changes still use the existing PIN-and-exact-confirmation gate.

### 3.17 local screen link

- **Private local screen** — the `/workspace` screen now has an explicit `SHARE YOUR SCREEN` control. The browser's native display-capture prompt is opened only after that click; the selected video stays in the current browser tab, is never uploaded to JARVIS, and stops automatically when the browser or share control ends it.
- **Protected agent view remains separate** — JARVIS's approved browser frames still use the existing private live-frame path. Starting a local screen share temporarily takes over the center display and restores the agent view when sharing ends.
- **Cross-platform browser primitive** — the feature uses standard `getDisplayMedia` and works on Windows, Linux, Raspberry Pi desktop browsers, and Chromium-based browsers that expose the API over localhost or HTTPS.

A private, Pi-first JARVIS visualization for OpenJarvis, Ollama, Docker, Google connectors, cameras, microphones, and guarded maintenance. The main route is now exactly one fullscreen neural field with no visible words, panels, cards, labels, or command bar.

### 3.16 focused push-to-talk voice

- **Push-to-talk shortcut** — `Ctrl+Space` (or `Cmd+Space` on macOS) opens the same acknowledged, focused 15-second command session as “Hey Jarvis” without requiring an always-on wake listener. It still uses the selected microphone, physical-audio gate, confidence threshold, and delayed-transcript protection.
- **Search-discoverable control** — the command palette lists Push-to-talk Voice so the shortcut is visible without adding permanent clutter to the single-screen HUD.

### 3.15 rejected-transcript voice boundary

- **False-hearing UI fix** — browser recognition results now carry the physical-audio acceptance decision into the dashboard. Rejected provider guesses are not shown in the command window and cannot overwrite typed text, while accepted transcripts keep the existing wake/capture flow.
- **Regression coverage** — the voice controller test suite verifies that a confident transcript with no physical microphone activity is explicitly marked rejected for the UI boundary.

### 3.14 workspace host bridge visibility

- **Own-screen host status** — the private `/workspace` screen now reports the live host-app catalog count and platform beside OpenJarvis, Ollama, Google, OBS, and printer status. The count is produced from the same redacted allow-list used for guarded launches, so the workspace never exposes executable paths or shell commands.
- **Fresh local snapshot** — `/api/workspace/status` refreshes the host catalog without caching secrets and keeps the bridge visibly degraded when no applications are discoverable.
- **Natural app requests** — `open Calculator` and `launch Chrome` now use the host catalog only when a matching app exists; unmatched phrases continue to the normal web/research lane instead of being treated as arbitrary process commands.

### 3.13 clean-room host app bridge

- **Host application catalog** — JARVIS can enumerate the operating system’s own Start Apps (Windows), visible `.desktop` applications (Linux/Pi), or `/Applications` entries (macOS). The browser receives only redacted names, stable opaque IDs, platform, and category; executable paths and desktop-entry commands stay server-side.
- **Explicit launch only** — say `open desktop app Calculator` (or use the equivalent typed command), choose the discovered match, then enter the dashboard PIN and exact `LAUNCH APP` phrase. Unknown IDs, arbitrary paths, shell wrappers, pipes, redirects, and command substitution are rejected.
- **Cross-platform process boundary** — Windows uses the fixed `explorer.exe shell:AppsFolder` target, Linux uses `gio launch` for the allow-listed desktop entry, and macOS uses `open -a`. No arbitrary shell, credential entry, hidden screen control, or login/payment bypass is added.
- **Clean-room boundary** — this is an independent, observable-behavior analogue inspired by the requested desktop-assistant workflow. It does not copy Dexter binaries, source, assets, authentication, or paid-feature gates, and it does not modify the installed Dexter application.

### 3.12 multipurpose specialist routing and Dexter-inspired live context

- **Role-aware local intelligence** — JARVIS automatically routes everyday help, CodeAct work, research, monitoring, memory/files, 3D printing, Google connector, and broadcast requests to GENERAL, CODEACT, RESEARCH, MONITOR, MEMORY, FABRICATOR, CONNECTOR, or BROADCAST. The selected role and model are shown in the orbital HUD and private workspace.
- **Broadcast/OBS lane** — OBS WebSocket v5 is a local-only, read-first capability: JARVIS can report the current scene, studio preview, stream/record/replay/virtual-camera state, scene sources, and audio mixer values. Scene switching, stream/record pause/resume, replay-buffer controls, virtual-camera controls, studio preview take, studio-mode toggles, browser/media-source refreshes, transition selection, filter toggles, source visibility, source mute/unmute, and volume changes require the dashboard PIN plus an exact confirmation phrase. The `BROADCAST` route selects the optional `BROADCAST_MODEL` and falls back safely when it is not installed.
- **Optional model per role** — every role can use its own installed Ollama model, while a missing specialist model safely falls back to the primary model. The HUD marks that fallback instead of hiding it.
- **Private live context** — the workspace retains the selected route, agent, model, and fallback state while an OpenJarvis task is thinking or controlling its isolated browser. It never exposes tokens, cookies, OAuth files, or private browser profiles.
- **Mission inspector** — the command screen’s small neural-field inspector opens a compact pre-flight view of the current route, local model, data sources, capabilities, bounded steps, approvals, and warnings. It is an execution preview only: opening it never runs a tool or grants permission.
- **Bounded thinking cue** — after the local “On it, sir.” acknowledgement, a quiet Web Audio pulse and the neural-field activity state remain active until the response starts or the request fails. If a browser blocks audio, the visual state still exposes the active processing cue and is always cleared on completion.
- **Multi-purpose capability deck** — the private workspace summarizes host-app discovery, local media, broadcast activity, specialist-agent routing, and public-social connection state in one local-first card. Twitch/Discord-style surfaces remain read-only until a separate approved integration exists; no external posts or messages are implied.
- **Capability matrix** — `/workspace` reports voice, camera, screen, browser, Google, research, Office, printer, and Pi-operation availability with approval boundaries and live service status.

### 3.11 private browser, cross-platform workspace, and Office studio

- **Collision-proof browser bridge** — Playwright MCP tools are exposed to OpenJarvis as `jarvis_browser_*`, preventing its incomplete built-in browser tools from shadowing the protected private-browser connection.
- **Automatic private live frames** — navigation, clicks, typing, selections, and key presses refresh a protected screenshot for the dashboard while control is active; the frame is hidden again when the run ends.
- **Its own browser** — JARVIS uses a dedicated Camoufox profile and output folder on Raspberry Pi OS, Ubuntu/Linux, and Windows. It never reuses your personal browser profile, cookies, saved passwords, or extensions.
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
- **Speech-shaped VAD hysteresis** — the microphone gate now requires sustained energy with a peak-to-RMS speech shape, then uses separate attack/release windows. Continuous fans, keyboard rumble, and isolated spikes no longer keep a command capture open or authorize a wake transcript.
- **Wake troubleshooting is visible** — first-run microphone permission can start from the main page, delayed final wake transcripts are accepted within a bounded six-second physical-voice window, and unsupported speech-recognition browsers report an actionable error instead of appearing silently armed.

### 3.9 browser agent, private live control view, and Pi tools

- **Read-only OpenJarvis browser inspection** — browser mode can search, navigate, screenshot, and extract in an isolated profile, but cannot type, click, submit, access files, or run shell commands. In host-control mode, browser/web tools are removed entirely.
- **Private live control view** — the PIN-authenticated dashboard listens to OpenJarvis lifecycle events on loopback and shows protected browser screenshots only while a browser or Pi-control tool is running. The view disappears and clears its last frame when the control run ends.
- **Escape recovery** — if the selected local display is released by Escape or the browser, `/workspace` and `/settings#screen` keep the retry bounded to one attempt, wait 20 seconds, and then ask the browser for the display again. If the browser requires a fresh user gesture, the screen explicitly returns to a click-to-retry state instead of looping permission prompts.
- **Dexter-inspired capability matrix** — the private workspace now reports each JARVIS lane (voice, camera, screen, browser, Google, research, Office, printer, and Pi operations) with live availability, approval requirements, and local/remote boundaries. No secrets are included in the snapshot.
- **No credential leakage to the webpage** — the OpenJarvis API key stays in the Node service, OAuth files stay on the Pi, and neither is added to a browser URL. Live frames are served only through the existing authenticated dashboard session.
- **Opt-in Pi control** — `scripts/setup-openjarvis-pi.sh --host-control` enables shell, code, and Git only for the isolated `jarvis-agent` account inside `/srv/jarvis-workspace`. That service is network-sealed to loopback and has no browser/web tools. Root maintenance remains restricted to the dashboard user's PIN-and-phrase protected allow-list.
- **Stricter wake gate** — a final wake phrase must begin the transcript and coincide with recent physical microphone activity. This blocks middle-of-sentence “Jarvis” matches and silent recognition-provider guesses while keeping `Hey Jarvis`, `Jarvis`, and double-clap activation.

### 3.8 private tools, live screen, and false-hearing repair

- **False commands are rejected** — low-confidence recognition guesses can no longer become the recovered command sentence, and interim “Jarvis” guesses cannot activate the wake session.
- **Background audio no longer holds JARVIS forever** — raw microphone energy is debounced and can extend a command only after the speech recognizer confirms speech; the hard capture deadline never extends indefinitely.
- **Safer noisy-room defaults** — the recommended profile now uses 72% wake sensitivity, 55% minimum recognition confidence, 28% mic sensitivity, and 42% clap sensitivity.
- **Private Google Workspace access** — JARVIS can read Gmail, Calendar, Drive, Tasks, and Contacts through host-only OAuth files. Gmail sending is a separate opt-in approval action; tokens never enter the browser, model prompt, logs, or repository.
- **Guarded public web tools** — “Search the web for …” adds bounded live results and citations to the local model. “Open YouTube” opens a validated public URL on the JARVIS host; localhost, LAN, credential-bearing, and non-HTTP URLs are blocked.
- **User-controlled live screen link** — `/settings#screen` previews the selected display locally. Each AI view requires an explicit ANALYZE SNAPSHOT click and a configured local Ollama vision model; there is no silent or continuous capture. The Pi-balanced starting point is `qwen2.5vl:3b` (pull it with `ollama pull qwen2.5vl:3b`, then set `JARVIS_VISION_MODEL=qwen2.5vl:3b`).
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
- The dashboard browser's optional phrase-bias failure no longer disables recognition. Repeated browser-provider network failures enter audio-only mode without a retry storm and point directly to the explicit on-device language-pack installer in `/settings`.

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
- **Spectrum-aware microphone gate** — the live listener and Settings calibration share a conservative frequency check that rejects narrow low-frequency fan/HVAC/motor hum while keeping normal speech-band energy eligible; the Settings panel exposes the decision as `HUM GATED`, `SPEECH BAND`, or a time-domain fallback.
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
- A direct `open <website>` request also launches that same separate Camoufox profile; it never delegates to the operator's normal browser. The URL is validated first and private-network destinations are rejected.
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
# Optional, explicit 3.2 GB local vision download:
# ./install-pi.sh --vision
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
# Optional, explicit 3.2 GB local vision download:
# ./install-pi.sh --vision
```

The installer requires Node.js **22.15 or newer** because the paired Camoufox
runtime uses Node's current zlib/zstd bindings. It:

1. Installs production Node packages, the paired Camoufox browser, the root-owned Playwright MCP bridge, and FFmpeg/ALSA/V4L2 tools.
2. Creates `.wake-venv`, installs openWakeWord/ONNX Runtime, and downloads the official pretrained wake models once.
3. Generates and prints a private six-digit dashboard/maintenance PIN if `.env` does not already contain one.
4. Installs the fixed root helper and its exact sudoers rule.
5. Adds maintenance-lock conditions to the three allow-listed services.
6. Installs persistent `openjarvis-api.service` and `openjarvis-dashboard.service` units. Both bind only to loopback; OpenJarvis runs under the isolated `jarvis-agent` account with its browser profile and output under `/srv/jarvis-workspace`.

The installer does not silently download a multi-gigabyte vision model. After checking Pi storage and bandwidth, run `./install-pi.sh --vision` (or `./install-pi.sh --vision-model qwen2.5vl:3b`) to pull the selected Ollama tag and write `JARVIS_VISION_MODEL` into the private `.env`. Both the Node installer and the Pi shell installer independently check `ollama list` after the pull and refuse to write the vision setting if the exact tag is missing; the dashboard reports `VISION READY` only after its own local catalog check also succeeds.

Save the generated PIN. It remains only in `~/openjarvis-pi-command-center/.env`. Unlocking the dashboard does not bypass the extra typed confirmation required for maintenance actions.

### Windows or desktop Linux workspace

Windows PowerShell can prepare the same private browser layout without touching your normal browser profile:

```powershell
cd "$env:USERPROFILE\Documents\Codex\2026-10-17\new-bot-im-working-on-called\outputs\openjarvis-pi-command-center"
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
node .\scripts\start-browser-mcp.mjs --check
# Starts only missing local listeners and waits for health checks:
npm.cmd run start:local
```

`start:local` starts Ollama, the configured OpenJarvis virtual environment, and the dashboard with hidden local processes. It prints only the three loopback URLs and service health; credentials stay in `.env` and are never printed.

After changing server code, reload only this project safely with:

```powershell
npm.cmd run restart:local
```

The restart helper stops a listener only when its command line is verified to be this project's `server.mjs`; it refuses to touch an unrelated process on the configured port. Ollama and OpenJarvis are left running.

On non-Pi Linux, use the same Node project and `scripts/start-browser-mcp.mjs`; run `npx camoufox fetch` and `npm run browser:patch` when the paired browser is not installed. The `--check` command validates the Camoufox executable, private profile, output directory, and headless mode without launching an agent session.

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
- Use a normal supported dashboard tab for laptop voice testing. The isolated Camoufox agent browser is intentionally separate; embedded preview browsers may not expose `getUserMedia()` or `SpeechRecognition`, so they can display the neural field but cannot hear a wake phrase.
- After permission has been granted, the main screen can safely auto-start the enabled listener on later visits. Select the exact **Browser / Gesture Camera** in `/settings`; this is also how Ubuntu/Chromium on the Pi selects one camera while leaving other cameras untouched.
- Pi mode uses the selected `/dev/video*` and `plughw:CARD,DEVICE` paths only.
- Person detection runs the TensorFlow.js COCO-SSD model locally. The release ZIP includes it; GitHub installs download the official model shards once during `npm install`, verify their hashes, and then run offline.
- Voice activity and double-clap detection analyze signal levels locally; audio is not saved. Browser speech transcription uses the browser's installed speech-recognition provider and may use the operating-system default microphone even though VAD and clap analysis stay locked to the selected device.
- For a fully local Pi command window, run `./install-pi.sh --stt` once. This installs the small Vosk English model in the project-owned model folder and adds `JARVIS_STT_MODEL_DIR`; after a local wake or double clap, the Pi opens a bounded 15-second command window, ignores the wake phrase and the dashboard's short spoken acknowledgement for the first 1.2 seconds, then waits for about 0.9 seconds of silence and sends the normalized transcript over the loopback callback. Vosk partial results are kept only in the local capture and provide a bounded fallback for short sentences that reach the silence boundary before a finalized segment; overlapping partial/final words are merged once. Raw audio never enters the dashboard or an external provider. Tune `JARVIS_STT_COMMAND_WARMUP_MS`, `JARVIS_STT_COMMAND_TIMEOUT_MS`, and `JARVIS_STT_COMMAND_SILENCE_MS` in `.env` if your speaker or room needs different timing. Leave the model variable blank to keep the wake listener wake-only.
- When that local Vosk window has already produced a sentence, the dashboard routes the bounded command directly after the acknowledgement; it does not require a second browser microphone permission. Wake-only events still open the normal 15-second browser capture window.
- `/api/wake/status` and the Pi Settings diagnostics expose only the bounded capture phase (`LOCAL STT WARMING`, `LOCAL STT LISTENING`, `LOCAL COMMAND SENT`, or timeout/error); they never retain or return the spoken sentence in wake telemetry.
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
PRINTER_CAMERA_URL=
PRINTER_CAMERA_TIMEOUT_MS=8000
PRINTER_CAMERA_DISCOVERY_TIMEOUT_MS=1800
PRINTER_CAMERA_MAX_BYTES=8388608
```

Keep these values only in `.env` on the Pi. If your Fluidd reverse proxy at port `4408` does not forward Moonraker API routes, use Moonraker's direct local address instead, commonly `http://192.168.4.74:7125`. If Moonraker requires an API key, put it in `PRINTER_API_KEY`; it is sent only server-to-printer and never returned to the browser.

To show the printer webcam in the private `/workspace`, JARVIS first tries the standard same-host snapshot paths listed above. Set `PRINTER_CAMERA_URL` only when the printer uses a custom endpoint (not an MJPEG stream URL). The URL must use the same host as `PRINTER_URL`; the protected server fetches one image at a time and the browser receives only the image bytes. If the printer is off or the endpoint returns HTML instead of an image, the card reports **OFFLINE** rather than treating it as a camera feed.

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

Open the authorization URL it prints. The callback travels through the tunnel to the Pi. Keep OAuth client JSON and token files outside this repository; the dashboard reads only their redacted connector state and never exposes tokens.

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

If the protected Settings screen reports **REAUTH REQUIRED**, use **REAUTHORIZE GOOGLE** in `/settings#integrations`. JARVIS starts the same local helper, gives you a one-time consent link, and keeps the callback listener bound to loopback. On a Pi reached over SSH, keep the `8789` tunnel open while the consent tab is active; when Google shows the success page, return to Settings and press **VERIFY GOOGLE**.

The helper accepts a downloaded desktop client or a web client with an explicitly registered loopback redirect. For a web client, register `http://127.0.0.1:8789/` (or `http://localhost:8789/`) in Google Cloud and set `GOOGLE_OAUTH_REDIRECT_URI` to the exact same value in the private `.env`. Non-loopback redirects are rejected, and the client secret stays on the host.

```dotenv
GOOGLE_EMAIL_SEND_ENABLED=true
```

```bash
sudo systemctl restart openjarvis-dashboard
```

Usage example: `Draft an email to friend@example.com saying I will arrive at five.` Review and edit the exact draft, enter the operations PIN, type `SEND EMAIL`, and press **SEND THIS EXACT EMAIL**. Closing the draft sends nothing. Calendar, Drive, Tasks, Contacts, deletion, forwarding, and settings remain read-only.

## Stirling PDF processing

JARVIS can use [Stirling PDF's REST API](https://docs.stirlingpdf.com/Developers/API) as a bounded server-side tool. The supported operations are PDF compression, OCR, repair, and PDF-to-Word conversion. The Node service sends the PDF as multipart form data and keeps the returned file in the private local artifact directory; the browser never receives the Stirling key.

Configure the private host environment (never commit or paste the key into chat or the repository):

```dotenv
STIRLING_URL=https://api.stirling.com
STIRLING_API_KEY=replace-on-the-host-only
STIRLING_INPUT_ROOTS=/home/pi5/jarvis-pdfs
STIRLING_TIMEOUT_MS=60000
STIRLING_MAX_INPUT_BYTES=26214400
```

For a self-hosted Stirling instance, set `STIRLING_URL` to its HTTPS or loopback URL; a key is optional when that server does not require one. The protected endpoint `GET /api/stirling/status` checks health without returning credentials. `POST /api/stirling/process` accepts `{ "operation": "compress|ocr|repair|pdf-to-word", "inputPath": "/allowed/root/file.pdf", "options": {} }` and returns a local artifact descriptor. In chat, say `compress this PDF ".../file.pdf"`, `OCR ".../scan.pdf"`, `repair ".../broken.pdf"`, or `convert ".../file.pdf" to Word`; the path must be inside `STIRLING_INPUT_ROOTS`.

The integration rejects non-PDF files, traversal, `.env`, credential/token/secret paths, oversized files, and arbitrary URLs. A cloud 401 (invalid key), 403 (permission/scope), or 402 (credit limit) is reported as a safe configuration/credit error rather than exposing provider response details.

## Curated public information tools

The GitHub API-list repositories are directories, not credentials. JARVIS now uses a small, reviewed set of public read-only services that do not need API keys by default. It does not blindly import endpoints from a list or place unknown keys in `.env`.

Available requests include:

- weather and three-day forecasts, air quality/AQI, geocoding, OpenFreeMap/MapLibre map metadata, OpenStreetMap links, and nearby places through Overpass (Open-Meteo/OpenStreetMap)
- US active weather alerts (National Weather Service); OpenWeatherMap and WeatherAPI.com are optional weather fallbacks when their keys are supplied
- local time and time zones, sunrise/sunset, exchange rates (Frankfurter), and public holidays (Nager.Date, with a keyless worldwide-feed fallback when the year route has a transient outage)
- USGS earthquakes, ISS position, English definitions, Wikipedia summaries, and cryptocurrency prices

Examples: `What is the weather in Dubai?`, `Show a map of Berlin`, `Find nearby restaurants in Dubai`, `Are there weather alerts in Miami?`, `Convert 20 USD to EUR`, `Define resilient`, `Summarize Wikipedia Raspberry Pi`, or `Where is the ISS?`.

Each lookup is bounded to a short timeout, cached briefly, normalized to a small result, and marked as untrusted evidence before it reaches the local model. Sources are returned in the response so the dashboard can show what was used. Open-Meteo remains the default keyless weather provider; set `PUBLIC_API_WEATHER_PROVIDER=openweather` or `weatherapi` only when the matching optional key is present. To change defaults, set `PUBLIC_API_DEFAULT_LOCATION`, `PUBLIC_API_DEFAULT_COUNTRY`, `PUBLIC_API_TIMEOUT_MS`, or `PUBLIC_API_USER_AGENT` in the Pi-only `.env`. The protected `/settings` route also lets you change the saved default country and city/area (initially United Arab Emirates / Dubai); location-free phrases such as “what is the weather outside?” use that profile, while an explicit place always wins. Keep Nominatim usage light and do not build autocomplete on its public instance; map results include OpenStreetMap attribution.

For direct diagnostics, unlock the dashboard and call `POST /api/public/query` with `{ "prompt": "weather in Dubai" }`. `GET /api/public/catalog` lists the enabled services.

## OpenJarvis and model setup

Expected loopback services:

- OpenJarvis: `http://127.0.0.1:8000`
- Ollama: `http://127.0.0.1:11434`
- Dashboard: `http://127.0.0.1:8787`

One primary model remains the safe default, and the router changes instructions, tools, and visualization without requiring a second download. For a stronger multipurpose setup, each role can optionally point at its own installed Ollama model; JARVIS automatically selects the role model, shows the choice in the HUD/workspace, and falls back to `JARVIS_MODEL` if that optional model is unavailable. The private workspace capability matrix shows which lanes are actually online. The Pi-safe default is `llama3.2:1b`:

```bash
ollama pull llama3.2:1b
```

Set `JARVIS_MODEL=llama3.2:1b` in `.env`. Optional overrides are `GENERAL_MODEL`, `CODING_MODEL`, `REASONING_MODEL`, `MONITOR_MODEL`, `MEMORY_MODEL`, `FABRICATOR_MODEL`, `CONNECTOR_MODEL`, and `BROADCAST_MODEL`. For Pi memory pressure, keep `OLLAMA_MAX_LOADED_MODELS=1`; if the specialist models are too large, leave the overrides blank and the automatic role switch still works with one model.

For local screen understanding on a Pi 5, install the adaptive local vision profile:

```bash
npm run vision:install
# or: ./install-pi.sh --vision
```

The default selector keeps `OLLAMA_MAX_LOADED_MODELS=1` and chooses `qwen2.5vl:3b` (about 3.2 GB, the balanced Pi 5 profile) when the host has at least 6 GiB RAM and 4.5 GiB free storage. A constrained host automatically selects `moondream:1.8b` (about 1.7 GB). Set `JARVIS_VISION_MODEL` or pass `--vision-model` to override the selector explicitly; an explicit tag is never replaced silently.

Use the no-download preflight any time you want to verify a Pi or laptop that already has the model:

```bash
npm run vision:check
```

The installer checks free storage and RAM, reuses an already-installed tag instead of pulling it again, verifies the exact Ollama model catalog entry, and checks `/api/show` for image capability. Both `npm run vision:install` and `./install-pi.sh --vision` fail closed when the selected tag is text-only. If an older Ollama omits capability metadata, a clearly vision-tagged model is reported as **tag fallback / unverified** rather than silently presented as fully verified. The installer writes `JARVIS_VISION_MODEL` and `OLLAMA_MAX_LOADED_MODELS=1` into the private `.env` and never starts a second resident model. Restart the dashboard after installation. `/settings#screen` reports `VISION READY`, `UNSUPPORTED`, `MISSING`, or `UNKNOWN` from that local probe. Screen sharing remains browser-local until you explicitly press `ANALYZE SNAPSHOT`; there is no continuous upload or cloud fallback.

For the optional broadcast lane, enable OBS WebSocket v5 in OBS and set `OBS_WEBSOCKET_URL=ws://127.0.0.1:4455` plus its password in the Pi `.env`. JARVIS rejects non-loopback OBS URLs, never exposes the password to the browser or model, and keeps every mutating action behind the existing PIN-and-phrase approval flow. You can ask for the current mixer or scenes, or type commands such as `pause OBS recording`, `save OBS replay`, `start OBS virtual camera`, `take OBS preview`, `refresh OBS browser source Chat`, `restart OBS media source Intro`, `set OBS transition to Fade`, `enable OBS filter Chroma Key on source Camera`, `mute OBS source Mic/Aux`, `set OBS audio source Mic/Aux volume to -6 dB`, and `disable OBS source Camera in scene Live`; each opens a guarded confirmation instead of acting silently. Dexter's public feature set was used only as a product reference; the installed Dexter binary and protected account/payment code are not modified or copied.

To verify a configured Stirling endpoint end-to-end without uploading a user document, run `npm run smoke:stirling -- --allow-cloud` when using Stirling Cloud. JARVIS creates a one-line synthetic PDF in a temporary directory, performs one selected operation (compression by default), checks the returned file signature, prints a redacted result, and removes the temporary fixture. The hidden Settings integrations panel also has **TEST SYNTHETIC PROCESS**, which performs that same bounded fixture check and records whether the processing key was accepted or rejected. Without `--allow-cloud`, the command refuses to upload when `STIRLING_URL` is the cloud host. Set `STIRLING_SMOKE_OPERATION=ocr`, `repair`, or `pdf-to-word` to exercise another lane.

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

For a real, non-mocked laptop/Pi smoke test, run this from the command-center directory:

```powershell
npm run smoke:live
# Require Google OAuth and a model backend to be healthy:
npm run smoke:live -- --require-google --require-model
# Require the Stirling health endpoint as well (processing still needs a local key/input PDF):
npm run smoke:live -- --require-stirling
```

The smoke test performs the bounded mission preflight (including the Architect → Critic → Debugger plan), read-only Gmail/Calendar/Drive/Tasks/Contacts probes, checks the Stirling health endpoint and operation catalog, exercises every enabled public-information service (retrying transient HTTP 5xx responses once), verifies the dashboard session, and checks real TTS output. Add `--require-stirling-processing` when you explicitly want one synthetic PDF round-trip through the configured Stirling endpoint; it uses a temporary one-line fixture and marks invalid cloud credentials as a real failure. It never sends email or uploads a user PDF unless you separately call the protected Stirling process endpoint with an explicit file path. A non-zero result means a required live dependency is unavailable; it does not turn an unavailable Google token into a false pass.

For a fast local readiness report before the longer smoke test, run:

```powershell
npm.cmd run doctor
# Fail on every warning as well as every required check:
npm.cmd run doctor -- --strict
# Make selected dependencies hard requirements for this run:
npm.cmd run doctor -- --require-openjarvis --require-ollama --require-vision --require-camera --require-mic --require-stirling --require-printer --require-printer-camera
```

`doctor` probes only the local dashboard session and its bounded local status endpoints. It reports Camoufox-only browser configuration, OpenJarvis/Ollama reachability, verified vision capability, Google OAuth availability, Stirling health, Moonraker printer reachability, same-host printer-camera discovery, and Pi ALSA/V4L2 devices when running on Linux. It never prints `.env` values, never calls a public API, and never changes services; optional Google, Stirling, printer, printer-camera, camera, and microphone warnings become failures only when explicitly required. On Windows, the camera and microphone checks remain browser-side; use the real Camoufox smoke test below for physical device evidence.

Fish Audio talkback is bounded by `FISH_AUDIO_TIMEOUT_MS` (30 seconds by default, with one bounded retry) so an unavailable provider cannot leave a normal reply hanging indefinitely. Wake acknowledgements use `FISH_AUDIO_WAKE_TIMEOUT_MS` (12 seconds by default, bounded to 4–60 seconds) so a slow provider cannot block the 15-second command window; JARVIS proceeds to listen and leaves the selected Fish voice unchanged. Settings shows both effective deadlines. Enable the browser voice fallback in Settings when you need local speech during an outage.

For a visible Camoufox end-to-end check of the actual command screen, camera, microphone, gestures, search, Settings, sensor calibration, and Google verification UI, run:

```powershell
npm run smoke:camoufox
```

This opens the installed Camoufox executable with real camera/microphone permissions and never uses fake media devices. It closes Camoufox after the report; no email or other external write is sent.

To include the full local screen-explanation path, including one approved snapshot sent to the configured Ollama vision model, run:

```powershell
npm run smoke:camoufox -- --vision-ui
```

On a CPU-only Pi or laptop, the vision check can take a few minutes while the local model is warm; it remains host-local and does not upload the screen.

For a CI host with no camera or microphone, use `node scripts/camoufox-e2e-smoke.mjs --fake-media`; the explicit flag is test-only and does not change the production browser path.

## Laptop development test

From Windows PowerShell:

```powershell
cd "$env:USERPROFILE\Documents\Codex\2026-10-17\new-bot-im-working-on-called\outputs\openjarvis-pi-command-center"
npm.cmd install
npm.cmd start
```

Open the command screen and `/settings`. Pi-only maintenance and openWakeWord controls correctly stay unavailable on Windows; system telemetry, the UI, live preview, browser camera/person detection, browser microphone level, local double-clap detection, and any reachable OpenJarvis/Ollama services can still be tested.
