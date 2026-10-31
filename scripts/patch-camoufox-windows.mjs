import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const isWindows = process.platform === 'win32';
const cacheRoot = path.join(os.homedir(), 'AppData', 'Local', 'camoufox', 'camoufox', 'Cache', 'browsers');
const manifestDependency = /<dependency>\s*<dependentAssembly>\s*<assemblyIdentity\s+type="win32"\s+name="mozglue"\s+version="1\.0\.0\.0"\s+language="\*"\s*\/>\s*<\/dependentAssembly>\s*<\/dependency>/s;

function findExecutables(root) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase() === 'camoufox.exe') found.push(full);
    }
  };
  walk(root);
  return found;
}

function patchExecutable(executable) {
  const original = fs.readFileSync(executable);
  const marker = Buffer.from('<dependency>');
  let offset = 0;
  while (true) {
    const start = original.indexOf(marker, offset);
    if (start < 0) break;
    const endMarker = Buffer.from('</dependency>');
    const end = original.indexOf(endMarker, start);
    if (end < 0) break;
    const endExclusive = end + endMarker.length;
    const candidate = original.subarray(start, endExclusive).toString('utf8');
    if (candidate.includes('name="mozglue"') && manifestDependency.test(candidate)) {
      const backup = `${executable}.jarvis-original`;
      if (!fs.existsSync(backup)) fs.copyFileSync(executable, backup);
      const next = Buffer.from(original);
      next.fill(0x20, start, endExclusive);
      fs.writeFileSync(executable, next);
      return { executable, changed: true, backup };
    }
    offset = endExclusive;
  }
  return { executable, changed: false };
}

if (!isWindows) {
  console.log('Camoufox Windows manifest patch: skipped (non-Windows host).');
  process.exit(0);
}

const executables = findExecutables(cacheRoot);
if (!executables.length) {
  console.log(`Camoufox Windows manifest patch: no downloaded executable under ${cacheRoot}`);
  process.exit(0);
}

let changed = 0;
for (const executable of executables) {
  const result = patchExecutable(executable);
  console.log(`${result.changed ? 'Patched' : 'Already compatible'} ${result.executable}`);
  if (result.changed) changed += 1;
}
console.log(`Camoufox Windows manifest patch complete: ${changed} executable(s) changed.`);
