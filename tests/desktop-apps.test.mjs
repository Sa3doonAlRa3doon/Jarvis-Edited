import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DesktopAppBridge, parseDesktopEntry, parseWindowsApps, redactedApps, tokenizeExec } from '../lib/desktop-apps.mjs';

test('parses a desktop entry without turning it into a shell command', () => {
  const app = parseDesktopEntry('[Desktop Entry]\nType=Application\nName=Notes\nExec=/usr/bin/notes %U\nCategories=Office;\n', '/usr/share/applications/notes.desktop');
  assert.equal(app.name, 'Notes');
  assert.deepEqual(app.target.exec, ['/usr/bin/notes']);
  assert.equal(redactedApps([app])[0].target, undefined);
  assert.deepEqual(tokenizeExec('sh -c "echo unsafe"'), []);
  assert.deepEqual(tokenizeExec('/usr/bin/notes; rm -rf /'), []);
  assert.equal(parseDesktopEntry('[Desktop Entry]\nType=Application\nHidden=true\nName=Hidden\nExec=hidden', '/tmp/hidden.desktop'), null);
});

test('normalizes Windows Start Apps and launches only a discovered app id', async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push({ command, args });
    return { stdout: JSON.stringify([{ Name: 'Calculator', AppID: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' }, { Name: 'Calculator', AppID: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' }]), stderr: '' };
  };
  const bridge = new DesktopAppBridge({ platform: 'win32', runner });
  const list = await bridge.list({ force: true });
  assert.equal(list.apps.length, 1);
  assert.equal(list.apps[0].name, 'Calculator');
  assert.equal(list.apps[0].target, undefined);
  await bridge.launch(list.apps[0].id);
  assert.equal(calls.at(-1).command, 'explorer.exe');
  assert.deepEqual(calls.at(-1).args, ['shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App']);
  await assert.rejects(() => bridge.launch('app:not-discovered'), /not in the current allow-list/);
});

test('unknown platforms expose an empty catalog instead of executable input', async () => {
  const bridge = new DesktopAppBridge({ platform: 'plan9', runner: async () => { throw new Error('must not run'); } });
  assert.deepEqual((await bridge.list()).apps, []);
});

test('launches the exact approved Linux Exec vector without reopening the desktop file', async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-desktop-apps-'));
  const appDir = path.join(homeDir, '.local', 'share', 'applications');
  const entry = path.join(appDir, 'notes.desktop');
  const calls = [];
  try {
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(entry, '[Desktop Entry]\nType=Application\nName=Notes\nExec=/usr/bin/notes --private %U\n');
    const bridge = new DesktopAppBridge({ platform: 'linux', homeDir, runner: async (command, args) => { calls.push({ command, args }); return { stdout: '', stderr: '' }; } });
    const listed = await bridge.list({ force: true });
    const app = listed.apps.find((item) => item.name === 'Notes');
    assert.ok(app);
    await bridge.launch(app.id);
    assert.deepEqual(calls, [{ command: '/usr/bin/notes', args: ['--private'] }]);
  } finally {
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});

test('rejects a previously approved Linux app id after its desktop entry changes', async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-desktop-apps-swap-'));
  const appDir = path.join(homeDir, '.local', 'share', 'applications');
  const entry = path.join(appDir, 'notes.desktop');
  const calls = [];
  try {
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(entry, '[Desktop Entry]\nType=Application\nName=Notes\nExec=/usr/bin/notes\n');
    const bridge = new DesktopAppBridge({ platform: 'linux', homeDir, runner: async (command, args) => { calls.push({ command, args }); return { stdout: '', stderr: '' }; } });
    const listed = await bridge.list({ force: true });
    const approved = listed.apps.find((item) => item.name === 'Notes');
    assert.ok(approved);
    await fs.writeFile(entry, '[Desktop Entry]\nType=Application\nName=Notes\nExec=/usr/bin/different-command\n');
    await assert.rejects(() => bridge.launch(approved.id), /not in the current allow-list/);
    assert.deepEqual(calls, []);
  } finally {
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});

