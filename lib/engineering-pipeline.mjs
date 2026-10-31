import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ENGINEERING_ROLES = Object.freeze(['ARCHITECT', 'CRITIC', 'DEBUGGER']);
export const ENGINEERING_PROFILES = Object.freeze(['unit', 'check', 'camoufox', 'live', 'full']);
export const PIPELINE_MAX_TASK_LENGTH = 2_000;
export const PIPELINE_MAX_OUTPUT_LENGTH = 12_000;
export const PIPELINE_MAX_ATTEMPTS = 3;

const SAFE_EDIT_ROOTS = Object.freeze(['lib', 'public', 'scripts', 'tests']);
const SAFE_EDIT_FILES = Object.freeze(['README.md', 'package.json', 'package-lock.json']);
const BLOCKED_PARTS = /^(?:\.env(?:\..*)?|data|node_modules|\.git|\.voice-browser-qa|credentials?|tokens?|secrets?|oauth|private|dist|build)$/i;
const SECRET_PATTERNS = Object.freeze([
  /(Bearer\s+)[A-Za-z0-9._~+\-/]+=*/gi,
  /((?:api[_-]?key|client[_-]?secret|password|token|authorization|refresh[_-]?token)\s*[:=]\s*)[^\s,;"']+/gi,
  /\b(sk|GOCSPX|AIza|ghp|github_pat|xox[baprs])-?[A-Za-z0-9_\-]{12,}\b/gi,
  /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi
]);

const PROFILE_COMMANDS = Object.freeze({
  unit: Object.freeze([{ name: 'unit tests', command: 'npm', args: ['test'] }]),
  check: Object.freeze([{ name: 'full static and unit checks', command: 'npm', args: ['run', 'check'] }]),
  // Keep the fixed engineering recipe non-interactive. The smoke harness
  // still exercises real camera/microphone tracks, but headless mode prevents
  // a hidden Windows desktop window or display permission prompt from leaving
  // the Architect → Critic → Debugger run waiting forever.
  camoufox: Object.freeze([{ name: 'real Camoufox smoke', command: 'npm', args: ['run', 'smoke:camoufox', '--', '--headless'] }]),
  live: Object.freeze([{ name: 'live local smoke', command: 'npm', args: ['run', 'smoke:live', '--', '--require-vision', '--skip-tts'] }]),
  full: Object.freeze([
    { name: 'full static and unit checks', command: 'npm', args: ['run', 'check'] },
    { name: 'deterministic Camoufox smoke', command: 'npm', args: ['run', 'smoke:camoufox', '--', '--headless', '--fake-media'] },
    { name: 'live local smoke', command: 'npm', args: ['run', 'smoke:live', '--', '--require-vision', '--skip-tts'] }
  ])
});

function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }

export function redactSecrets(value, limit = PIPELINE_MAX_OUTPUT_LENGTH) {
  let text = String(value ?? '').replace(/\0/g, '');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, (match, prefix = '') => `${prefix}[REDACTED]`);
  return text.slice(0, limit);
}

export function normalizePipelineTask(value) {
  const raw = String(value ?? '');
  if (raw.length > PIPELINE_MAX_TASK_LENGTH) throw new Error(`Pipeline task must be ${PIPELINE_MAX_TASK_LENGTH} characters or fewer.`);
  const task = redactSecrets(raw, PIPELINE_MAX_TASK_LENGTH).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!task) throw new Error('Pipeline task is required.');
  return task;
}

export function normalizePipelineProfile(value = 'check') {
  const profile = String(value || 'check').trim().toLowerCase();
  if (!ENGINEERING_PROFILES.includes(profile)) throw new Error(`Unknown pipeline profile. Use one of: ${ENGINEERING_PROFILES.join(', ')}.`);
  return profile;
}

export function safeWorkspacePath(projectRoot, candidate) {
  const root = path.resolve(String(projectRoot || '.'));
  const supplied = String(candidate || '').trim();
  if (!supplied || path.isAbsolute(supplied)) throw new Error('Pipeline paths must be non-empty workspace-relative paths.');
  const resolved = path.resolve(root, supplied);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Pipeline path escapes the project workspace.');
  const pieces = relative.split(path.sep);
  if (pieces.some((piece) => BLOCKED_PARTS.test(piece))) throw new Error('Pipeline cannot access secret, dependency, build, or runtime paths.');
  const normalized = pieces.join('/');
  const allowed = SAFE_EDIT_FILES.includes(normalized) || SAFE_EDIT_ROOTS.some((rootName) => normalized === rootName || normalized.startsWith(`${rootName}/`));
  if (!allowed) throw new Error('Pipeline path is outside the allow-listed source and test folders.');
  return normalized;
}

export function validatePatchPath(projectRoot, candidate) { return safeWorkspacePath(projectRoot, candidate); }

export function validatePatch(projectRoot, patch = {}) {
  const files = Array.isArray(patch.files) ? patch.files : [patch];
  if (!files.length || files.length > 24) throw new Error('A pipeline patch must contain between one and 24 files.');
  return files.map((file) => {
    const relativePath = validatePatchPath(projectRoot, file.path);
    const content = String(file.content ?? '');
    if (content.length > 120_000) throw new Error('Each pipeline patch file is limited to 120,000 characters.');
    if (/\0/.test(content)) throw new Error('Pipeline patches cannot contain NUL bytes.');
    return { path: relativePath, content };
  });
}

export function profileCommands(profile) {
  return PROFILE_COMMANDS[normalizePipelineProfile(profile)].map((item) => ({ name: item.name, command: item.command, args: [...item.args] }));
}

export function normalizePipelineRequest(input = {}, projectRoot = process.cwd()) {
  const task = normalizePipelineTask(input.task);
  const profile = normalizePipelineProfile(input.profile);
  const files = Array.isArray(input.files) ? input.files.map((file) => validatePatchPath(projectRoot, file)) : [];
  const maxAttempts = Math.round(clamp(input.maxAttempts ?? 1, 1, PIPELINE_MAX_ATTEMPTS));
  return { task, profile, files, maxAttempts };
}

export function createPipelineRun(request, id = `eng-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`) {
  const normalized = { task: request.task, profile: normalizePipelineProfile(request.profile), files: [...(request.files || [])], maxAttempts: Math.round(clamp(request.maxAttempts ?? 1, 1, PIPELINE_MAX_ATTEMPTS)) };
  return {
    id, task: normalized.task, profile: normalized.profile, files: normalized.files,
    status: 'queued', phase: 'ARCHITECT', attempts: 0, maxAttempts: normalized.maxAttempts,
    startedAt: null, finishedAt: null, roles: {}, commands: [], findings: [], history: []
  };
}

export function architectPlan(run) {
  return {
    role: 'ARCHITECT', status: 'complete', task: run.task,
    plan: 'Run only the selected fixed test recipe, inspect its bounded output, and return evidence without modifying source files.',
    acceptance: ['All selected commands exit 0.', 'No secrets or protected paths appear in evidence.', 'Any failure is handed to DEBUGGER with its exact bounded output.'],
    allowedCommands: profileCommands(run.profile).map(({ name }) => name),
    allowedEditRoots: [...SAFE_EDIT_ROOTS, ...SAFE_EDIT_FILES]
  };
}

export function classifyFailure(output = '') {
  const text = redactSecrets(output, PIPELINE_MAX_OUTPUT_LENGTH);
  const location = text.match(/(?:at\s+)?((?:[A-Za-z]:)?[^\s:]+\.(?:m?js|cjs|py|json|html|css))(?:[:(](\d+))?(?:[:](\d+))?/i);
  const kind = /(?:assert|test\s+failed|expected.*received)/i.test(text) ? 'test-failure'
    : /(?:syntaxerror|parse error|unexpected token)/i.test(text) ? 'syntax-error'
      : /(?:timeout|timed out|exceeded)/i.test(text) ? 'timeout'
        : /(?:eaddrinuse|econnrefused|connection)/i.test(text) ? 'runtime-connectivity'
          : 'command-failure';
  return { kind, location: location ? { file: redactSecrets(location[1], 240), line: Number(location[2]) || null, column: Number(location[3]) || null } : null, message: text.split(/\r?\n/).filter(Boolean).slice(-8).join('\n') || 'The fixed command failed without diagnostic output.' };
}

export function critiqueCommand(commandResult) {
  const output = redactSecrets(commandResult?.output || '');
  const passed = Number(commandResult?.exitCode) === 0 && commandResult?.timedOut !== true;
  return {
    role: 'CRITIC', status: passed ? 'accept' : 'reject',
    findings: passed ? [] : [
      'The fixed command did not complete successfully.',
      ...(commandResult?.timedOut ? ['The bounded timeout expired; no retry was started automatically.'] : [])
    ],
    evidence: output,
    failure: passed ? null : classifyFailure(output)
  };
}

export function debuggerReport(commandResult, criticResult) {
  const failure = criticResult?.failure || classifyFailure(commandResult?.output || '');
  return {
    role: 'DEBUGGER', status: 'surgical-fix-required', failure,
    instruction: `Inspect only ${failure.location?.file || 'the fixed command output'}${failure.location?.line ? ` at line ${failure.location.line}` : ''}. Propose the smallest source/test change, then rerun the same fixed recipe. Do not rewrite the project or execute a new command.`
  };
}

export function finishPipelineRun(run, commandResults = []) {
  const commands = commandResults.map((item) => ({ ...item, output: redactSecrets(item.output || '') }));
  const failed = commands.find((item) => Number(item.exitCode) !== 0 || item.timedOut === true);
  const critic = critiqueCommand(failed || commands.at(-1) || { exitCode: 1, output: 'No command result was produced.' });
  const result = { ...run, status: failed ? 'needs-fix' : 'passed', phase: failed ? 'DEBUGGER' : 'COMPLETE', commands, roles: { ...run.roles, CRITIC: critic }, findings: critic.findings, finishedAt: new Date().toISOString(), history: [...run.history, { role: 'CRITIC', status: critic.status }] };
  if (failed) result.roles.DEBUGGER = debuggerReport(failed, critic);
  return result;
}

export function redactRun(run) {
  return JSON.parse(redactSecrets(JSON.stringify(run), 200_000));
}
