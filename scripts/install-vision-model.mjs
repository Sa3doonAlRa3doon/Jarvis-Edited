import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectVisionCapability } from '../lib/ollama-vision.mjs';
import { isVisionModelTag, selectVisionModel } from '../lib/vision-model-profile.mjs';

const configuredModel = String(process.env.JARVIS_VISION_MODEL || '').trim();
if (configuredModel && !isVisionModelTag(configuredModel)) throw new Error('JARVIS_VISION_MODEL contains unsupported characters.');
const checkOnly = process.argv.includes('--check') || process.argv.includes('--check-only');
const unsupportedArgs = process.argv.slice(2).filter((arg) => !['--check', '--check-only'].includes(arg));
if (unsupportedArgs.length) throw new Error(`Unsupported argument: ${unsupportedArgs[0]}. Use --check to verify without downloading.`);

const command = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
const envPath = path.resolve(process.env.JARVIS_ENV_PATH || path.join(process.cwd(), '.env'));
const residentModelLimit = String(process.env.OLLAMA_MAX_LOADED_MODELS || '1').trim() || '1';
const ollamaBaseUrl = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

function formatGiB(bytes) { return `${(Number(bytes) / 1024 ** 3).toFixed(1)} GiB`; }

function runOllama(args, { inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    if (inherit) {
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code: code ?? 1, signal, stdout: '', stderr: '' }));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code: code ?? 1, signal, stdout, stderr }));
  });
}

function installedModelNames(output) {
  return String(output || '')
    .replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0] || '')
    .filter(Boolean);
}

async function fetchOllamaJson(pathname, body) {
  try {
    const response = await fetch(`${ollamaBaseUrl}${pathname}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    return { __error: String(error?.message || 'Ollama HTTP probe failed').slice(0, 160) };
  }
}

async function availableBytes(location) {
  if (typeof fs.statfs !== 'function') return null;
  try {
    const stats = await fs.statfs(location);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch { return null; }
}

async function persistEnvValue(file, key, value) {
  let source = '';
  try { source = await fs.readFile(file, 'utf8'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(source) ? source.replace(pattern, line) : `${source.replace(/\s*$/, '')}${source.trim() ? '\n' : ''}${line}\n`;
  await fs.writeFile(file, next, { mode: 0o600 });
  if (process.platform !== 'win32') await fs.chmod(file, 0o600).catch(() => {});
}

async function main() {
  const free = await availableBytes(process.cwd());
  const ram = Number(os.totalmem());
  const selection = selectVisionModel({ configured: configuredModel, totalRamBytes: ram, freeBytes: free });
  const model = selection.model;
  if (free != null && free < selection.minFreeBytes) {
    throw new Error(`Not enough free storage for ${model}: ${formatGiB(free)} available; keep at least ${formatGiB(selection.minFreeBytes)} free before downloading.`);
  }
  if (ram > 0 && ram < selection.minRamBytes) {
    console.warn(`Warning: this host has ${formatGiB(ram)} RAM. Keep OLLAMA_MAX_LOADED_MODELS=1 and avoid loading another large model beside ${model}.`);
  }
  console.log(`Vision preflight // platform=${process.platform} arch=${process.arch} ram=${formatGiB(ram)}${free == null ? '' : ` free=${formatGiB(free)}`} model=${model} profile=${selection.profile} reason=${selection.reason}`);
  if (checkOnly) console.log(`Check-only mode // no model download and no environment changes.`);
  let pullResult;
  let listResult;
  try { listResult = await runOllama(['list']); }
  catch (error) {
    console.error(`Could not start Ollama: ${error.message}. Install Ollama and run this command on the Pi.`);
    process.exitCode = 1;
    return;
  }
  let installed = listResult.code === 0 && installedModelNames(listResult.stdout).includes(model);
  if (listResult.code !== 0) {
    console.error(`Ollama model catalog could not be read (exit ${listResult.code}). The environment was not changed.`);
    if (listResult.stderr.trim()) console.error(`Ollama reported: ${listResult.stderr.trim().slice(0, 240)}`);
    process.exitCode = 1;
    return;
  }
  if (!installed && !checkOnly) {
    console.log(`Pulling local vision model ${model}. Expected download is about ${formatGiB(selection.downloadBytes)} for the ${selection.profile} profile.`);
    try { pullResult = await runOllama(['pull', model], { inherit: true }); }
    catch (error) {
      console.error(`Could not start Ollama: ${error.message}. Install Ollama and run this command on the Pi.`);
      process.exitCode = 1;
      return;
    }
    const exitCode = pullResult.signal ? 1 : pullResult.code;
    if (pullResult.signal) { console.error(`Ollama pull stopped by ${pullResult.signal}.`); process.exitCode = 1; return; }
    if (exitCode !== 0) { console.error(`Ollama could not pull ${model} (exit ${exitCode}).`); process.exitCode = exitCode || 1; return; }
    listResult = await runOllama(['list']);
    installed = listResult.code === 0 && installedModelNames(listResult.stdout).includes(model);
  } else if (installed) {
    console.log(`Local model already installed: ${model}`);
  }
  if (!installed) {
    console.error(`Vision model ${model} was not found in the local model catalog. ${checkOnly ? 'Run npm run vision:install to download it.' : 'The environment was not changed.'}`);
    process.exitCode = 1;
    return;
  }
  const details = await fetchOllamaJson('/api/show', { model });
  const capability = inspectVisionCapability(details.__error ? null : details, model);
  if (capability.capable === false) {
    console.error(`Installed model ${model} does not advertise image input (${capability.capabilities.join(', ') || 'text-only metadata'}). Choose a vision tag such as qwen2.5vl:3b.`);
    process.exitCode = 1;
    return;
  }
  if (capability.verified) console.log(`Vision capability verified by Ollama: ${capability.capabilities.join(', ')}`);
  else console.warn(`Vision tag is installed, but Ollama metadata could not verify image input (${details.__error || 'older Ollama metadata'}); JARVIS will use the tag fallback.`);
  if (checkOnly) {
    console.log(`Vision check passed: ${model}`);
    return;
  }
  await persistEnvValue(envPath, 'JARVIS_VISION_MODEL', model);
  await persistEnvValue(envPath, 'OLLAMA_MAX_LOADED_MODELS', residentModelLimit);
  console.log(`Vision model ready: ${model}`);
  console.log(`Configured JARVIS_VISION_MODEL and OLLAMA_MAX_LOADED_MODELS in ${envPath}. Restart the command center.`);
}

main().catch((error) => { console.error(`Vision install stopped: ${String(error?.message || error).slice(0, 320)}`); process.exitCode = 1; });
