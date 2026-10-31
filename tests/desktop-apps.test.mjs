import assert from 'node:assert/strict';
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

