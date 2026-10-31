#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PIPELINE_MAX_OUTPUT_LENGTH, architectPlan, createPipelineRun, finishPipelineRun,
  normalizePipelineRequest, redactRun, redactSecrets, profileCommands
} from '../lib/engineering-pipeline.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TIMEOUT_MS = 300_000;

function parseArgs(argv) {
  const args = { profile: 'check', json: false, task: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') args.json = true;
    else if (value === '--task') args.task = argv[++index] || '';
    else if (value === '--profile') args.profile = argv[++index] || '';
    else if (value === '--max-attempts') args.maxAttempts = argv[++index] || '';
    else throw new Error(`Unknown pipeline argument: ${value}`);
  }
  return args;
}

export function runFixedCommand(spec, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    // Windows cannot spawn a .cmd file with shell:false (Node reports EINVAL).
    // Invoke npm's bundled CLI through the current Node executable instead; the
    // command and arguments remain fixed and never pass through a shell.
    const npmCli = process.platform === 'win32'
      ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : null;
    const executable = process.platform === 'win32' && spec.command === 'npm' ? process.execPath : spec.command;
    const args = process.platform === 'win32' && spec.command === 'npm' ? [npmCli, ...spec.args] : spec.args;
    // Tests must exercise their explicit fixtures, not credentials inherited
    // from the running dashboard's dotenv environment. In particular, the
    // Stirling no-key test relies on the constructor's safe empty default.
    // Keep the child local and deterministic without ever printing or passing
    // provider credentials into a test recipe.
    const childEnv = { ...process.env, CI: '1', STIRLING_API_KEY: '' };
    const child = spawn(executable, args, {
      cwd: projectRoot, env: childEnv, shell: false, windowsHide: true
    });
    let output = ''; let timedOut = false; let settled = false;
    const append = (chunk) => { output = `${output}${String(chunk || '')}`.slice(-PIPELINE_MAX_OUTPUT_LENGTH); };
    child.stdout?.on('data', append); child.stderr?.on('data', append);
    let timeoutKiller = null;
    const timer = setTimeout(() => {
      timedOut = true;
      // On Windows, killing the npm Node process alone leaves cmd/Camoufox
      // descendants alive. That used to leave the Architect pipeline waiting
      // forever after its bounded timeout. Terminate the whole process tree,
      // then resolve even if a descendant has already lost its parent handle.
      if (process.platform === 'win32' && child.pid) {
        timeoutKiller = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        timeoutKiller.once('close', () => finish(1, 'TIMEOUT'));
        setTimeout(() => finish(1, 'TIMEOUT'), 1_000).unref?.();
      } else {
        try { child.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 750).unref?.();
        finish(1, 'TIMEOUT');
      }
    }, timeoutMs);
    const finish = (exitCode, signal = null) => {
      if (settled) return; settled = true; clearTimeout(timer);
      resolve({ name: spec.name, command: [spec.command, ...spec.args].join(' '), exitCode: Number.isInteger(exitCode) ? exitCode : 1, signal, timedOut, output: redactSecrets(output) });
    };
    child.on('error', (error) => { append(`\n${error.name}: ${error.message}`); finish(1); });
    child.on('close', finish);
  });
}

export async function runEngineeringPipeline(input, { onUpdate = () => {}, timeoutMs = DEFAULT_TIMEOUT_MS, runId, runCommand = runFixedCommand } = {}) {
  const request = normalizePipelineRequest(input, projectRoot);
  let run = createPipelineRun(request, runId);
  run = { ...run, status: 'running', phase: 'CRITIC', startedAt: new Date().toISOString(), roles: { ARCHITECT: architectPlan(run) }, history: [{ role: 'ARCHITECT', status: 'complete' }] };
  onUpdate(redactRun(run));
  const attemptHistory = [];
  let lastReport = null;
  for (let attempt = 1; attempt <= request.maxAttempts; attempt += 1) {
    run = { ...run, status: 'running', phase: 'CRITIC', attempts: attempt, commands: [] };
    onUpdate(redactRun(run));
    const results = [];
    for (const command of profileCommands(request.profile)) {
      const result = { ...(await runCommand(command, { timeoutMs, attempt })), attempt };
      results.push(result);
      onUpdate(redactRun({ ...run, commands: results }));
      if (result.exitCode !== 0 || result.timedOut) break;
    }
    const report = finishPipelineRun(run, results);
    lastReport = report;
    attemptHistory.push({
      attempt,
      status: report.status,
      phase: report.phase,
      commands: report.commands,
      critic: report.roles.CRITIC,
      debugger: report.roles.DEBUGGER || null
    });
    if (report.status === 'passed') {
      // A transient failure on an earlier bounded attempt is still useful in
      // attemptHistory, but it must not make the final accepted run look like
      // it still needs a debugger or source edit. Keep the evidence in the
      // history and expose the final role state accurately.
      const finalRoles = {
        ...report.roles,
        DEBUGGER: {
          role: 'DEBUGGER',
          status: 'not-needed',
          note: attempt > 1 ? 'A later bounded retry passed; no source change was required.' : 'All selected commands passed on the first attempt.'
        }
      };
      return redactRun({
        ...report,
        roles: finalRoles,
        attempts: attempt,
        maxAttempts: request.maxAttempts,
        attemptHistory,
        history: [...report.history, { role: 'PIPELINE', status: 'passed', attempt }]
      });
    }
    const retrying = attempt < request.maxAttempts;
    run = {
      ...report,
      status: retrying ? 'retrying' : 'needs-fix',
      phase: retrying ? 'CRITIC' : 'DEBUGGER',
      attempts: attempt,
      maxAttempts: request.maxAttempts,
      attemptHistory,
      history: [...report.history, { role: 'DEBUGGER', status: 'surgical-fix-required', attempt }, ...(retrying ? [{ role: 'PIPELINE', status: 'retrying', attempt }] : [])]
    };
    onUpdate(redactRun(run));
    if (!retrying) return redactRun(run);
  }
  return redactRun(lastReport || run);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = await runEngineeringPipeline({ task: args.task || 'Run the bounded local engineering checks.', profile: args.profile, maxAttempts: args.maxAttempts });
  const serialized = JSON.stringify(report, null, 2);
  if (args.json) process.stdout.write(`${serialized}\n`);
  else {
    process.stdout.write(`ENGINEERING PIPELINE // ${report.status.toUpperCase()} // ${report.profile}\n`);
    process.stdout.write(`ARCHITECT: ${report.roles.ARCHITECT.status}\nCRITIC: ${report.roles.CRITIC?.status || 'running'}\nDEBUGGER: ${report.roles.DEBUGGER?.status || 'not needed'}\n`);
    process.stdout.write(`${serialized}\n`);
  }
  return report.status === 'passed' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`ENGINEERING PIPELINE // REJECTED // ${redactSecrets(error.message)}\n`); process.exitCode = 2; });
}
