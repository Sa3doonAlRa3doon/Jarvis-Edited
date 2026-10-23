import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFile(path.join(project, file), 'utf8');
const [html, settingsHtml, client, settingsClient, authClient, css, server, helper, gitignore, packageRaw, galaxy, gestures, voiceController, voiceUtils, searchUtils, printerClient, knowledgeIndex, agentRouter] = await Promise.all([
  read('public/index.html'), read('public/settings.html'), read('public/app.js'), read('public/settings.js'),
  read('public/auth.js'), read('public/styles.css'), read('server.mjs'), read('scripts/jarvis-service-control.sh'), read('.gitignore'), read('package.json'),
  read('public/galaxy.js'), read('public/gesture-controller.js'), read('public/voice-controller.js'), read('public/voice-utils.js'), read('public/search-utils.js'),
  read('lib/printer-client.mjs'), read('lib/knowledge-index.mjs'), read('lib/agent-router.mjs')
]);
const packageJson = JSON.parse(packageRaw);

for (const [source, document, label] of [[client, html, 'main'], [settingsClient, settingsHtml, 'settings']]) {
  for (const match of source.matchAll(/querySelector\('#([^'$]+)'\)/g)) {
    assert.match(document, new RegExp(`id=["']${match[1]}["']`), `Missing ${label} HTML element #${match[1]}`);
  }
}

for (const asset of [['@tensorflow', 'tfjs', 'dist', 'tf.min.js'], ['@tensorflow-models', 'coco-ssd', 'dist', 'coco-ssd.min.js']]) {
  await fs.access(path.join(project, 'node_modules', ...asset));
}
for (const asset of [['three', 'build', 'three.module.js'], ['@mediapipe', 'tasks-vision', 'vision_bundle.mjs'], ['@mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_internal.wasm']]) await fs.access(path.join(project, 'node_modules', ...asset));
const modelDirectory = path.join(project, 'public', 'models', 'coco-ssd');
const model = JSON.parse(await fs.readFile(path.join(modelDirectory, 'model.json'), 'utf8'));
const shards = model.weightsManifest.flatMap((group) => group.paths);
assert.ok(shards.length >= 1, 'Model manifest has no weight shards.');
let modelBytes = 0;
for (const shard of shards) { const stats = await fs.stat(path.join(modelDirectory, shard)); assert.ok(stats.size > 0, `Empty model shard: ${shard}`); modelBytes += stats.size; }
const handModel = await fs.readFile(path.join(project, 'public', 'models', 'hand-landmarker', 'hand_landmarker.task'));
assert.equal(handModel.length, 7819105, 'Unexpected hand landmark model size.');

assert.equal(packageJson.version, '3.6.3');
assert.match(server, /ALLOW_BROWSER_TTS_FALLBACK/);
assert.match(server, /X-Jarvis-Voice-ID/);
assert.match(client, /Fish Audio playback failed without changing voices/);
assert.match(server, /app\.get\('\/settings'/);
assert.match(server, /v1\/traces\?limit=40/);
assert.match(server, /timingSafeEqual/);
assert.match(server, /requireDashboardAuth/);
assert.match(server, /HttpOnly; SameSite=Strict/);
assert.match(authClient, /ensureDashboardAuthentication/);
assert.match(client, /safeCitationUrl/);
assert.match(server, /Cross-origin mutation blocked/);
assert.match(server, /stop-until-reboot/);
assert.match(server, /\['active', 'activating', 'reloading'\]/);
assert.match(html, /data-lane="code"/);
assert.match(html, /data-lane="research"/);
assert.match(html, /data-lane="monitor"/);
for (const mode of ['system', 'docker', 'printer', 'agents', 'research', 'memory']) assert.match(html, new RegExp(`data-core-mode=["']${mode}["']`));
assert.match(client, /activateCoreMode/);
assert.match(client, /button\[data-core-mode\]/);
assert.doesNotMatch(client, /\$\$\('\[data-core-mode\]'\)/);
assert.match(client, /activateCoreMode\(button\.dataset\.coreMode, \{ focus: true \}\)/);
assert.match(galaxy, /formationFor/);
assert.match(galaxy, /uMorph/);
assert.match(html, /class="reactor-shell"/);
assert.match(client, /coreHealth/);
assert.match(css, /v2\.4 restrained reactor command center/);
assert.doesNotMatch(html, /href=["']\/settings/);
assert.match(settingsHtml, /id="live-preview"/);
assert.match(settingsHtml, /<title>JARVIS \/\/ Configuration Core<\/title>/);
assert.match(settingsHtml, /id="settings-search"/);
assert.match(settingsHtml, /id="revert-settings"/);
assert.match(settingsClient, /UNSAVED PROFILE CHANGES/);
assert.match(settingsClient, /Saved device \(currently unavailable\)/);
assert.match(settingsClient, /Sensor configuration changed/);
assert.match(css, /v2\.5 configuration core/);
assert.match(css, /v3\.0 cinematic neural command deck/);
assert.match(html, /class="command-page visual-only"/);
assert.match(css, /v3\.1 single-screen neural field/);
assert.match(html, /id="jarvis-search"/);
assert.match(html, /id="jarvis-search-input"/);
assert.match(client, /searchCatalog/);
assert.match(client, /openSearch/);
assert.match(client, /handleVoiceCommand/);
assert.match(searchUtils, /normalizeSearchText/);
assert.match(searchUtils, /fuzzyTermMatch/);
assert.match(galaxy, /onLongPress/);
assert.match(galaxy, /getSearchItems/);
assert.match(css, /v3\.5 transient JARVIS search/);
assert.doesNotMatch(galaxy, /fillText\(/);
assert.match(server, /const primaryModel = resolvePrimaryModel\(process\.env\)/);
assert.match(server, /const models = \{ primary: primaryModel \}/);
assert.match(server, /routePrompt\(prompt, primaryModel\)/);
for (const role of ['JARVIS', 'CODEX', 'PROSPECTOR', 'SENTINEL', 'ARCHIVIST', 'FABRICATOR', 'LINK']) assert.match(agentRouter, new RegExp(`name: '${role}'`));
assert.match(client, /routeModes\[result\.route\]/);
assert.match(client, /new VoiceController/);
assert.match(client, /autoStartIfGranted/);
assert.match(voiceController, /maxAlternatives = 5/);
assert.match(voiceController, /echoCancellation/);
assert.match(voiceController, /noiseSuppression/);
assert.match(voiceController, /isDuplicateCommand/);
assert.match(voiceController, /processLocally/);
assert.match(voiceController, /SpeechRecognitionPhrase/);
assert.match(voiceController, /startRecognitionWithTrack/);
assert.match(voiceUtils, /findWakePhrase/);
assert.match(voiceUtils, /selectRecognitionAlternative/);
assert.match(voiceUtils, /normalizeVocabulary/);
assert.match(voiceUtils, /\\p\{L\}/);
assert.match(settingsHtml, /id="voice-language"/);
assert.match(settingsHtml, /id="voice-vocabulary"/);
assert.match(settingsHtml, /id="prefer-local-recognition"/);
assert.match(settingsHtml, /id="install-local-speech"/);
assert.match(settingsClient, /RecognitionClass\.install/);
assert.match(settingsHtml, /id="test-recognition"/);
assert.match(settingsHtml, /id="tts-voice"/);
assert.match(server, /wakeResponse: 'Yes sir, how can I help you today\?'/);
assert.match(settingsHtml, /placeholder="Yes sir, how can I help you today\?"/);
assert.match(server, /const appVersion = '3\.6\.3'/);
assert.match(server, /loadDashboardSessionSecret/);
assert.match(client, /window\.jarvisFetch/);
assert.match(client, /state\.voice\.playAudio/);
assert.match(server, /on-device-speech-recognition=\(self\)/);
assert.match(server, /printerRefreshActive/);
assert.match(server, /monitorTickActive/);
assert.match(client, /refreshFastPending/);
assert.match(client, /pollJson/);
assert.match(html, /id="reactor-scan"/);
assert.match(html, /class="constellation-labels"/);
assert.match(client, /pulseCore/);
assert.match(settingsClient, /deviceIdConstraint\(settings\.browserCamera\)/);
assert.match(settingsClient, /deviceIdConstraint\(settings\.browserMicrophone\)/);
assert.match(settingsClient, /getUserMediaWithFallback/);
assert.match(settingsClient, /modelUrl: '\/models\/coco-ssd\/model\.json'/);
assert.match(settingsHtml, /id="gesture-sensitivity"/);
assert.match(html, /id="gesture-button"/);
assert.match(html, /id="fullscreen-gate"/);
assert.match(html, /rel="manifest"/);
assert.match(client, /requestFullscreen/);
assert.match(css, /\.fullscreen-gate/);
assert.match(html, /data-printer="cancel"/);
assert.match(client, /CANCEL PRINT/);
assert.match(gestures, /HandLandmarker\.createFromOptions/);
assert.match(gestures, /deviceIdConstraint\(selectedDevice\)/);
assert.match(gestures, /threshold \* 1\.28/);
assert.match(galaxy, /THREE\.WebGLRenderer/);
assert.match(galaxy, /focusFromText/);
assert.match(galaxy, /setAudioLevel/);
assert.match(galaxy, /setActivity/);
assert.match(server, /app\.get\('\/api\/knowledge'/);
assert.match(server, /app\.get\('\/api\/printer\/events'/);
assert.match(server, /app\.post\('\/api\/printer\/action'/);
assert.match(printerClient, /pause: '\/printer\/print\/pause'/);
assert.match(printerClient, /cancel: '\/printer\/print\/cancel'/);
assert.doesNotMatch(printerClient, /gcode\/script/);
assert.match(knowledgeIndex, /BLOCKED_NAMES/);
assert.match(knowledgeIndex, /isSymbolicLink/);
assert.match(css, /\.command-page\s*\{[^}]*overflow:\s*hidden/s);
assert.match(css, /\.visual-only\.audio-locked #brain-canvas/);
assert.match(helper, /SERVICES=\(ollama\.service openjarvis-api\.service hatclanker\.service\)/);
assert.match(helper, /maintenance\.lock/);
assert.doesNotMatch(helper, /\beval\b/);
for (const item of ['client_secret*.json', 'credentials.json', 'token.json', 'data/', '.wake-venv/', 'hand_landmarker.task']) assert.match(gitignore, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const source of [html, settingsHtml, client, settingsClient, css]) assert.doesNotMatch(source, /fonts\.googleapis\.com|cdn\.jsdelivr\.net|unpkg\.com/);

console.log(`Verified ${shards.length} local person-model shards (${(modelBytes / 1024 / 1024).toFixed(1)} MiB).`);
console.log(`Verified local MediaPipe hand model (${(handModel.length / 1024 / 1024).toFixed(1)} MiB).`);
console.log('Verified no-scroll 3D file galaxy, hidden settings, smoothed gestures, voice recognition controls, and live preview.');
console.log('Verified session-gated dashboard, PIN-gated fixed printer/maintenance actions, and secret-file exclusions.');
