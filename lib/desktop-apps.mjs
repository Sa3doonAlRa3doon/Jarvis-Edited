import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// A deliberately small, allow-listed bridge for launching apps that the host
// itself exposes.  It is not a general shell or desktop-control endpoint:
// callers can only launch an app returned by discover(), and the server still
// requires its normal dashboard PIN and exact confirmation phrase.

const MAX_APPS = 160;
const CACHE_MS = 15_000;
const FIELD_CODES = /%[fFuUdDnNickvm%]/g;
const UNSAFE_LAUNCHERS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'python', 'python3', 'node', 'nodejs', 'perl', 'ruby', 'wscript', 'cscript', 'osascript', 'env', 'env.exe', 'busybox', 'flatpak-spawn', 'pkexec', 'sudo']);

function clean(value, limit = 240) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, limit);
}

function truthyDesktopValue(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function stableId(platform, identity) {
  return `app:${crypto.createHash('sha256').update(`${platform}:${identity}`).digest('hex').slice(0, 20)}`;
}

function publicApp(platform, identity, name, category = 'APPLICATION') {
  const label = clean(name, 120);
  if (!label) return null;
  return Object.freeze({ id: stableId(platform, identity), name: label, category: clean(category, 60) || 'APPLICATION', platform });
}

export function parseWindowsApps(payload) {
  let rows;
  try { rows = Array.isArray(payload) ? payload : payload ? [payload] : []; } catch { rows = []; }
  const seen = new Set(); const apps = [];
  for (const row of rows) {
    const name = clean(row?.Name, 120); const appId = clean(row?.AppID, 240);
    if (!name || !appId || seen.has(appId.toLowerCase())) continue;
    seen.add(appId.toLowerCase());
    apps.push({ ...publicApp('win32', appId, name), target: { type: 'windows-app', appId } });
    if (apps.length >= MAX_APPS) break;
  }
  return apps.filter(Boolean);
}

function parseDesktopValue(line) {
  const index = line.indexOf('=');
  return index > 0 ? line.slice(index + 1).trim() : '';
}

export function tokenizeExec(command) {
  const source = clean(command, 1000).replace(FIELD_CODES, '').trim();
  if (!source) return [];
  // Desktop Exec strings use a small quoting grammar.  Keep this tokenizer
  // conservative: it never interprets a shell, pipes, redirects, or command
  // substitution.  If a field is malformed we reject the entry.
  const tokens = []; let token = ''; let quote = ''; let escaped = false;
  for (const char of source) {
    if (escaped) { token += char; escaped = false; continue; }
    if (char === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ''; else token += char; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) { if (token) { tokens.push(token); token = ''; } continue; }
    token += char;
  }
  if (escaped || quote) return [];
  if (token) tokens.push(token);
  if (!tokens.length) return [];
  const launcher = tokens[0].split(/[\\/]/).pop().toLowerCase();
  if (UNSAFE_LAUNCHERS.has(launcher) || tokens.some((item) => !item || /[|;&`]/.test(item) || item.includes('&&') || item.includes('||') || item.includes('$('))) return [];
  return tokens.slice(0, 24);
}

export function parseDesktopEntry(content, filePath, platform = 'linux') {
  const lines = String(content || '').split(/\r?\n/);
  let inDesktopEntry = false; const values = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) { inDesktopEntry = line === '[Desktop Entry]'; continue; }
    if (!inDesktopEntry) continue;
    const index = line.indexOf('='); if (index <= 0) continue;
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  if (values.Type && values.Type !== 'Application') return null;
  if (truthyDesktopValue(values.NoDisplay) || truthyDesktopValue(values.Hidden)) return null;
  const name = values.Name || values['Name[en_US]'] || '';
  const exec = tokenizeExec(values.Exec || '');
  if (!name || !exec.length) return null;
  const absolute = path.resolve(filePath);
  return { ...publicApp(platform, absolute, name, values.Categories?.split(';')[0] || 'APPLICATION'), target: { type: 'desktop-entry', filePath: absolute, exec } };
}

async function readDesktopFiles(root) {
  const output = [];
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.desktop')) continue;
    const filePath = path.join(root, entry.name);
    try { const parsed = parseDesktopEntry(await fs.readFile(filePath, 'utf8'), filePath); if (parsed) output.push(parsed); } catch {}
  }
  return output;
}

function runCommand(command, args, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = ''; let settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Desktop app command timed out.')); }, timeoutMs);
    child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; }); child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(error));
    child.on('close', (code, signal) => code === 0 ? finish(null, { code, signal, stdout, stderr }) : finish(new Error(clean(stderr || `Desktop app command exited with ${code ?? signal}`, 320))));
  });
}

async function discoverWindows(run) {
  const script = 'Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress';
  try { const result = await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]); return parseWindowsApps(JSON.parse(result.stdout || '[]')); } catch { return []; }
}

async function discoverLinux(homeDir) {
  const roots = ['/usr/share/applications', '/usr/local/share/applications', path.join(homeDir, '.local', 'share', 'applications')];
  const entries = (await Promise.all(roots.map(readDesktopFiles))).flat(); const seen = new Set();
  return entries.filter((item) => { if (!item || seen.has(item.name.toLowerCase())) return false; seen.add(item.name.toLowerCase()); return true; }).slice(0, MAX_APPS);
}

async function discoverMac(homeDir) {
  const roots = ['/Applications', path.join(homeDir, 'Applications')]; const apps = []; const seen = new Set();
  for (const root of roots) {
    let entries = []; try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue;
      const name = entry.name.slice(0, -4); const identity = path.join(root, entry.name);
      if (seen.has(name.toLowerCase())) continue; seen.add(name.toLowerCase());
      apps.push({ ...publicApp('darwin', identity, name), target: { type: 'mac-app', name } });
      if (apps.length >= MAX_APPS) return apps;
    }
  }
  return apps;
}

export function redactedApps(apps) {
  return (Array.isArray(apps) ? apps : []).map(({ id, name, category, platform }) => ({ id, name, category, platform }));
}

export class DesktopAppBridge {
  constructor({ platform = process.platform, homeDir = os.homedir(), runner = runCommand, cacheMs = CACHE_MS } = {}) {
    this.platform = platform; this.homeDir = homeDir; this.runner = runner; this.cacheMs = cacheMs; this.cache = null; this.refreshedAt = 0;
  }

  async discover({ force = false } = {}) {
    if (!force && this.cache && Date.now() - this.refreshedAt < this.cacheMs) return this.cache;
    let apps = [];
    if (this.platform === 'win32') apps = await discoverWindows(this.runner);
    else if (this.platform === 'linux') apps = await discoverLinux(this.homeDir);
    else if (this.platform === 'darwin') apps = await discoverMac(this.homeDir);
    this.cache = { platform: this.platform, apps, refreshedAt: new Date().toISOString() }; this.refreshedAt = Date.now();
    return this.cache;
  }

  async list(options = {}) { const result = await this.discover(options); return { platform: result.platform, refreshedAt: result.refreshedAt, apps: redactedApps(result.apps) }; }

  async launch(appId) {
    const result = await this.discover({ force: true }); const app = result.apps.find((item) => item.id === String(appId || ''));
    if (!app) throw new Error('That desktop app is not in the current allow-list. Refresh the app list and choose one of the displayed apps.');
    if (app.target.type === 'windows-app') await this.runner('explorer.exe', [`shell:AppsFolder\\${app.target.appId}`]);
    else if (app.target.type === 'desktop-entry') await this.runner('gio', ['launch', app.target.filePath]);
    else if (app.target.type === 'mac-app') await this.runner('open', ['-a', app.target.name]);
    else throw new Error('Unsupported desktop app target.');
    return { ok: true, app: { id: app.id, name: app.name, category: app.category, platform: app.platform } };
  }
}

