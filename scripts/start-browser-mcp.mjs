#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

function executableCandidates() {
  const configured = process.env.JARVIS_BROWSER_EXECUTABLE;
  if (configured) return [configured];
  if (process.platform === 'win32') {
    return [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe')
    ];
  }
  if (process.platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  const names = ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'microsoft-edge'];
  return names.map((name) => spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim()).filter(Boolean);
}

const executablePath = executableCandidates().find((candidate) => candidate && fs.existsSync(candidate));
if (!cli) throw new Error('Playwright MCP is not installed beside the launcher or in the project. Run npm install first.');
if (!fs.existsSync(networkGuard)) throw new Error(`The browser network guard is missing at ${networkGuard}.`);
if (!executablePath) throw new Error('No supported Chromium, Chrome, or Edge executable was found. Set JARVIS_BROWSER_EXECUTABLE.');

const workspace = path.resolve(process.env.OPENJARVIS_WORKSPACE || path.join(os.homedir(), '.jarvis-workspace'));
const profile = path.resolve(process.env.JARVIS_BROWSER_PROFILE || path.join(workspace, '.jarvis-browser-profile'));
const output = path.resolve(process.env.JARVIS_BROWSER_OUTPUT || path.join(workspace, 'browser-output'));
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
fs.mkdirSync(output, { recursive: true, mode: 0o700 });

const args = [
  cli,
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
    executable: path.basename(executablePath),
    profile,
    output,
    headless: args.includes('--headless')
  })}\n`);
  process.exit(0);
}

const child = spawn(process.execPath, args, { cwd: workspace, env: process.env, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('exit', (code, signal) => process.exitCode = signal ? 1 : Number(code || 0));
child.once('error', (error) => { console.error(`JARVIS browser MCP failed: ${error.message}`); process.exitCode = 1; });
