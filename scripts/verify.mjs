import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFile(path.join(project, file), 'utf8');
const [html, settingsHtml, client, settingsClient, authClient, css, server, helper, gitignore, packageRaw] = await Promise.all([
  read('public/index.html'), read('public/settings.html'), read('public/app.js'), read('public/settings.js'),
  read('public/auth.js'), read('public/styles.css'), read('server.mjs'), read('scripts/jarvis-service-control.sh'), read('.gitignore'), read('package.json')
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
const modelDirectory = path.join(project, 'public', 'models', 'coco-ssd');
const model = JSON.parse(await fs.readFile(path.join(modelDirectory, 'model.json'), 'utf8'));
const shards = model.weightsManifest.flatMap((group) => group.paths);
assert.ok(shards.length >= 1, 'Model manifest has no weight shards.');
let modelBytes = 0;
for (const shard of shards) { const stats = await fs.stat(path.join(modelDirectory, shard)); assert.ok(stats.size > 0, `Empty model shard: ${shard}`); modelBytes += stats.size; }

assert.equal(packageJson.version, '2.0.0');
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
assert.doesNotMatch(html, /href=["']\/settings/);
assert.match(settingsHtml, /id="live-preview"/);
assert.match(settingsClient, /exact:\s*settings\.browserCamera/);
assert.match(settingsClient, /exact:\s*settings\.browserMicrophone/);
assert.match(settingsClient, /modelUrl: '\/models\/coco-ssd\/model\.json'/);
assert.match(css, /\.command-page\s*\{[^}]*overflow:\s*hidden/s);
assert.match(helper, /SERVICES=\(ollama\.service openjarvis-api\.service hatclanker\.service\)/);
assert.match(helper, /maintenance\.lock/);
assert.doesNotMatch(helper, /\beval\b/);
for (const item of ['client_secret*.json', 'credentials.json', 'token.json', 'data/', '.wake-venv/']) assert.match(gitignore, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const source of [html, settingsHtml, client, settingsClient, css]) assert.doesNotMatch(source, /fonts\.googleapis\.com|cdn\.jsdelivr\.net|unpkg\.com/);

console.log(`Verified ${shards.length} local person-model shards (${(modelBytes / 1024 / 1024).toFixed(1)} MiB).`);
console.log('Verified no-scroll command screen, hidden settings route, exact device selection, and live preview.');
console.log('Verified session-gated dashboard, PIN-gated fixed maintenance allow-list, and secret-file exclusions.');
