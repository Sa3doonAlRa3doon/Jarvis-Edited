import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Camoufox, listInstalled } from 'camoufox';

const DEFAULT_PROFILE_NAME = '.jarvis-camoufox-profile';
let hostContextPromise = null;

function hostContextHealthy(context) {
  if (!context) return false;
  try {
    if (typeof context.isClosed === 'function' && context.isClosed()) return false;
    const browser = typeof context.browser === 'function' ? context.browser() : null;
    if (browser && typeof browser.isConnected === 'function' && !browser.isConnected()) return false;
    return true;
  } catch {
    return false;
  }
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

export function camoufoxEngine() { return 'camoufox'; }

export function camoufoxTargetOs(platform = process.platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

export function camoufoxHeadless({ platform = process.platform, env = process.env } = {}) {
  if (env.JARVIS_BROWSER_HEADLESS !== undefined && env.JARVIS_BROWSER_HEADLESS !== '') {
    return enabled(env.JARVIS_BROWSER_HEADLESS, false);
  }
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return true;
  return false;
}

export function dedicatedCamoufoxProfile({ env = process.env, home = os.homedir() } = {}) {
  const workspace = path.resolve(env.OPENJARVIS_WORKSPACE || path.join(home, '.jarvis-workspace'));
  const configured = String(env.JARVIS_BROWSER_PROFILE || '').trim();
  return path.resolve(configured || path.join(workspace, DEFAULT_PROFILE_NAME));
}

export function installedCamoufoxExecutable({ platform = process.platform, existsSync = fs.existsSync } = {}) {
  const executableName = platform === 'win32' ? 'camoufox.exe' : 'camoufox';
  const installed = listInstalled();
  const active = installed.find((item) => item.isActive) || installed[0];
  const candidate = active?.path ? path.join(active.path, executableName) : '';
  return candidate && existsSync(candidate) ? candidate : '';
}

export async function launchCamoufox({
  headless = camoufoxHeadless(),
  windowsHide = false,
  persistent = false,
  profile = dedicatedCamoufoxProfile(),
  platform = process.platform,
  ...extra
} = {}) {
  const options = {
    headless,
    os: camoufoxTargetOs(platform),
    ...(windowsHide ? { windowsHide: true } : {}),
    ...extra
  };
  if (persistent) {
    fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
    return Camoufox({ ...options, persistent_context: true, user_data_dir: profile });
  }
  return Camoufox(options);
}

export async function getCamoufoxHostContext({ profile = dedicatedCamoufoxProfile(), headless = camoufoxHeadless(), windowsHide = false } = {}) {
  if (hostContextPromise) {
    const existing = await hostContextPromise.catch(() => null);
    if (hostContextHealthy(existing)) return existing;
    hostContextPromise = null;
    try { await existing?.close(); } catch {}
  }
  if (!hostContextPromise) {
    hostContextPromise = launchCamoufox({ persistent: true, profile, headless, windowsHide }).catch(async (error) => {
      // A killed desktop process can leave Firefox's short-lived parent.lock
      // behind. Do not delete it or touch a user profile; retry once in a
      // fresh, still-dedicated JARVIS profile instead.
      // A previous dashboard process can still own the stable profile while
      // Windows is finishing process teardown. Use a per-process recovery
      // profile instead of a shared `-recovery` path, otherwise every restart
      // can collide with the last orphaned Camoufox parent.
      const recoveryProfile = `${profile}-recovery-${process.pid}`;
      return launchCamoufox({ persistent: true, profile: recoveryProfile, headless, windowsHide }).catch(() => { throw error; });
    });
    hostContextPromise.catch(() => { hostContextPromise = null; });
  }
  return hostContextPromise;
}

export async function closeCamoufoxHostContext() {
  const pending = hostContextPromise;
  hostContextPromise = null;
  if (!pending) return;
  try { await (await pending).close(); } catch {}
}
