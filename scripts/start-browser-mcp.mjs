#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { browserRequestToUpstream, browserResponseToClient, MCP_TOOL_PREFIX } from './mcp-prefix.mjs';
import { listInstalled } from 'camoufox';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const cli = [
  path.join(projectRoot, 'node_modules', '@playwright', 'mcp', 'cli.js'),
  path.join(here, 'node_modules', '@playwright', 'mcp', 'cli.js')
].find((candidate) => fs.existsSync(candidate));
const networkGuard = path.join(here, 'browser-network-guard.ts');

function enabled(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

const installed = listInstalled();
const activeCamoufox = installed.find((item) => item.isActive) || installed[0];
const executablePath = activeCamoufox?.path ? path.join(activeCamoufox.path, process.platform === 'win32' ? 'camoufox.exe' : 'camoufox') : '';
if (!cli) throw new Error('Playwright MCP is not installed beside the launcher or in the project. Run npm install first.');
if (!fs.existsSync(networkGuard)) throw new Error(`The browser network guard is missing at ${networkGuard}.`);
if (!executablePath) throw new Error('Camoufox is not installed. Run npx camoufox fetch, then npm run browser:patch.');

const workspace = path.resolve(process.env.OPENJARVIS_WORKSPACE || path.join(os.homedir(), '.jarvis-workspace'));
const profile = path.resolve(process.env.JARVIS_BROWSER_PROFILE || path.join(workspace, '.jarvis-browser-profile'));
const output = path.resolve(process.env.JARVIS_BROWSER_OUTPUT || path.join(workspace, 'browser-output'));
const liveFrame = path.resolve(process.env.JARVIS_BROWSER_LIVE_FRAME_FILE || path.join(workspace, 'jarvis-live.png'));
const liveFrameRelative = path.relative(workspace, liveFrame);
if (!liveFrameRelative || liveFrameRelative === '..' || liveFrameRelative.startsWith(`..${path.sep}`) || path.isAbsolute(liveFrameRelative)) {
  throw new Error('JARVIS_BROWSER_LIVE_FRAME_FILE must be a file inside OPENJARVIS_WORKSPACE.');
}
const liveFrameName = liveFrameRelative.split(path.sep).join('/');
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.dirname(liveFrame), { recursive: true, mode: 0o700 });
try { fs.rmSync(liveFrame, { force: true }); } catch {}

const args = [
  cli,
  '--browser=firefox',
  `--executable-path=${executablePath}`,
  `--user-data-dir=${profile}`,
  `--output-dir=${output}`,
  `--init-page=${networkGuard}`,
  '--block-service-workers',
  '--no-webmcp',
  '--codegen=none',
  '--output-max-size=52428800',
  '--viewport-size=1440x900',
  '--snapshot-mode=full'
];
if (enabled(process.env.JARVIS_BROWSER_HEADLESS, true)) args.push('--headless');

if (process.argv.includes('--check')) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    platform: process.platform,
    browser: 'camoufox',
    executable: path.basename(executablePath),
    profile,
    output,
    liveFrame,
    headless: args.includes('--headless'),
    toolPrefix: MCP_TOOL_PREFIX
  })}\n`);
  process.exit(0);
}

const child = spawn(process.execPath, args, { cwd: workspace, env: process.env, stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const captureAfter = new Map();
const heldResponses = new Map();
let captureSequence = 0;
let liveFrameCleanupTimer = 0;
const materialTools = new Set([
  'jarvis_browser_navigate', 'jarvis_browser_navigate_back', 'jarvis_browser_click',
  'jarvis_browser_type', 'jarvis_browser_select_option', 'jarvis_browser_press_key'
]);

function messageId(payload) {
  if (!payload || !Object.hasOwn(payload, 'id')) return '';
  return `${typeof payload.id}:${String(payload.id)}`;
}

function handleClientLine(line) {
  try {
    const payload = JSON.parse(line);
    if (payload?.method === 'tools/call' && materialTools.has(String(payload.params?.name || ''))) {
      captureAfter.set(messageId(payload), true);
    }
  } catch {}
  return browserRequestToUpstream(line);
}

function handleChildLine(line) {
  let payload;
  try { payload = JSON.parse(line); } catch { return browserResponseToClient(line); }
  const id = messageId(payload);
  if (id.startsWith('string:jarvis-live-frame:')) {
    const held = heldResponses.get(id);
    if (!held) return null;
    clearTimeout(held.replyTimer);
    clearTimeout(held.expiryTimer);
    heldResponses.delete(id);
    if (!payload.error && payload.result?.isError !== true) {
      clearTimeout(liveFrameCleanupTimer);
      liveFrameCleanupTimer = setTimeout(() => {
        try { fs.rmSync(liveFrame, { force: true }); } catch {}
      }, 60_000);
      liveFrameCleanupTimer.unref?.();
    }
    return held.line;
  }
  if (captureAfter.has(id)) {
    captureAfter.delete(id);
    const succeeded = !payload.error && payload.result?.isError !== true;
    if (succeeded) {
      const captureId = `jarvis-live-frame:${++captureSequence}`;
      const captureKey = `string:${captureId}`;
      const held = { line: browserResponseToClient(line), replyTimer: 0, expiryTimer: 0 };
      held.replyTimer = setTimeout(() => {
        if (heldResponses.get(captureKey) !== held || held.line == null) return;
        if (!process.stdout.destroyed) process.stdout.write(`${held.line}\n`);
        held.line = null;
        held.expiryTimer = setTimeout(() => heldResponses.delete(captureKey), 60_000);
        held.expiryTimer.unref?.();
      }, 12_000);
      held.replyTimer.unref?.();
      heldResponses.set(captureKey, held);
      child.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0', id: captureId, method: 'tools/call',
        params: { name: 'browser_take_screenshot', arguments: { type: 'png', filename: liveFrameName } }
      })}\n`);
      return null;
    }
  }
  return browserResponseToClient(line);
}

function forwardClientLines(input) {
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  reader.on('line', (line) => {
    if (!child.stdin.destroyed) child.stdin.write(`${handleClientLine(line)}\n`);
  });
  reader.on('close', () => { if (!child.stdin.destroyed) child.stdin.end(); });
}

function forwardChildLines(input) {
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  reader.on('line', (line) => {
    const forwarded = handleChildLine(line);
    if (forwarded != null && !process.stdout.destroyed) process.stdout.write(`${forwarded}\n`);
  });
}

forwardClientLines(process.stdin);
forwardChildLines(child.stdout);
child.stdin.on('error', () => {});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('exit', (code, signal) => {
  clearTimeout(liveFrameCleanupTimer);
  for (const held of heldResponses.values()) {
    clearTimeout(held.replyTimer);
    clearTimeout(held.expiryTimer);
    if (held.line != null && !process.stdout.destroyed) process.stdout.write(`${held.line}\n`);
  }
  heldResponses.clear();
  process.exitCode = signal ? 1 : Number(code || 0);
});
child.once('error', (error) => { console.error(`JARVIS browser MCP failed: ${error.message}`); process.exitCode = 1; });
