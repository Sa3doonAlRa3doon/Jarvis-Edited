import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

function secretError(message, code = 'EPRIVATESECRET') {
  return Object.assign(new Error(message), { code });
}

async function readPrivateSecret(filePath, validate, { fileSystem = fs } = {}) {
  const before = await fileSystem.lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw secretError('Private secret path must be one regular file and cannot be a link.');
  }
  const noFollow = Number(fsConstants.O_NOFOLLOW) || 0;
  const file = await fileSystem.open(filePath, fsConstants.O_RDONLY | noFollow);
  try {
    const current = await file.stat();
    if (!current.isFile() || current.nlink !== 1 || current.dev !== before.dev || current.ino !== before.ino) {
      throw secretError('Private secret file changed while it was being opened.');
    }
    const value = String(await file.readFile('utf8')).trim();
    if (!validate(value)) throw secretError('Private secret file is empty or invalid.', 'EINVALIDSECRET');
    return value;
  } finally {
    await file.close().catch(() => {});
  }
}

export async function loadOrCreatePrivateSecret(filePath, {
  bytes = 48,
  validate = (value) => /^[A-Za-z0-9_-]{32,256}$/.test(value),
  fileSystem = fs,
  retryDelayMs = 5,
  retryCount = 40
} = {}) {
  const target = path.resolve(filePath);
  const directory = path.dirname(target);
  await fileSystem.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const existing = await readPrivateSecret(target, validate, { fileSystem });
    await fileSystem.chmod(target, 0o600).catch(() => {});
    return existing;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const candidate = crypto.randomBytes(Math.max(24, Math.min(128, Number(bytes) || 48))).toString('base64url');
  let file;
  try {
    file = await fileSystem.open(target, 'wx', 0o600);
    await file.writeFile(`${candidate}\n`);
    await file.sync();
    await file.close();
    file = null;
    return candidate;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let lastError = error;
    for (let attempt = 0; attempt < retryCount; attempt += 1) {
      try {
        const existing = await readPrivateSecret(target, validate, { fileSystem });
        await fileSystem.chmod(target, 0o600).catch(() => {});
        return existing;
      } catch (readError) {
        lastError = readError;
        if (!['ENOENT', 'EINVALIDSECRET'].includes(readError?.code)) throw readError;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    throw lastError;
  } finally {
    await file?.close().catch(() => {});
  }
}
