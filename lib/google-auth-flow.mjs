import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function clean(value, limit = 260) {
  return String(value ?? '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function defaultCredentialsPath(environment = process.env, home = os.homedir()) {
  const directory = String(environment.GOOGLE_AUTH_DIRECTORY || path.join(home, 'jarvis-google')).trim();
  return path.resolve(String(environment.GOOGLE_CREDENTIALS_PATH || path.join(directory, 'credentials.json')));
}

/**
 * Starts the existing local Desktop OAuth helper and exposes only its consent
 * URL and bounded lifecycle state to the authenticated dashboard. Secrets and
 * token contents stay inside the helper process and its private files.
 */
export class GoogleAuthFlow {
  constructor({
    scriptPath = path.resolve('scripts', 'google-oauth-local.mjs'),
    execPath = process.execPath,
    environment = process.env,
    home = os.homedir(),
    spawnImpl = spawn,
    accessImpl = fs.access,
    onComplete = () => {}
  } = {}) {
    this.scriptPath = scriptPath;
    this.execPath = execPath;
    this.environment = environment;
    this.credentialsPath = defaultCredentialsPath(environment, home);
    this.spawnImpl = spawnImpl;
    this.accessImpl = accessImpl;
    this.onComplete = onComplete;
    this.child = null;
    this.status = 'idle';
    this.url = '';
    this.startedAt = 0;
    this.finishedAt = 0;
    this.error = '';
    this.outputBuffer = '';
  }

  snapshot() {
    return {
      running: Boolean(this.child),
      status: this.status,
      url: this.url,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      finishedAt: this.finishedAt ? new Date(this.finishedAt).toISOString() : null,
      error: this.error
    };
  }

  async start() {
    if (this.child) return this.snapshot();
    try {
      await this.accessImpl(this.credentialsPath);
    } catch {
      throw new Error(`Google Desktop OAuth credentials were not found at ${this.credentialsPath}.`);
    }
    this.url = '';
    this.error = '';
    this.outputBuffer = '';
    this.startedAt = Date.now();
    this.finishedAt = 0;
    this.status = 'starting';
    let child;
    try {
      child = this.spawnImpl(this.execPath, [this.scriptPath], {
        cwd: path.dirname(this.scriptPath),
        env: { ...this.environment },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      this.status = 'failed';
      this.finishedAt = Date.now();
      this.error = clean(error?.message || 'Could not start the Google OAuth helper.');
      throw new Error(this.error);
    }
    this.child = child;
    this.status = 'waiting-for-consent';
    const capture = (chunk) => {
      this.outputBuffer = `${this.outputBuffer}${String(chunk || '')}`.slice(-24_000);
      const match = this.outputBuffer.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?[^\s"'<>]+/i);
      if (match) this.url = match[0].replace(/[),.;]+$/, '');
    };
    child.stdout?.setEncoding?.('utf8');
    child.stdout?.on?.('data', capture);
    child.stderr?.setEncoding?.('utf8');
    child.stderr?.on?.('data', (chunk) => { this.error = clean(chunk); });
    child.once?.('error', (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.status = 'failed';
      this.finishedAt = Date.now();
      this.error = clean(error?.message || 'Google OAuth helper failed to start.');
    });
    child.once?.('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.status = code === 0 ? 'completed' : 'failed';
      this.finishedAt = Date.now();
      if (code && !this.error) this.error = `Google OAuth helper exited with code ${code}.`;
      if (code) this.url = '';
      if (code === 0) {
        try { this.onComplete(); } catch {}
      }
    });
    // Give the helper a short bounded window to print the consent URL before
    // the HTTP response is returned. This avoids a race where Settings shows
    // “started” but has no link yet, while never keeping the request open for
    // the full OAuth interaction.
    await new Promise((resolve) => {
      let settled = false;
      let interval;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      };
      const timeout = setTimeout(finish, 800);
      interval = setInterval(() => { if (this.url || !this.child) finish(); }, 25);
    });
    return this.snapshot();
  }

  stop() {
    if (this.child && !this.child.killed) this.child.kill?.('SIGTERM');
    this.child = null;
    this.status = 'stopped';
    this.finishedAt = Date.now();
    this.url = '';
    return this.snapshot();
  }
}

export { defaultCredentialsPath };
