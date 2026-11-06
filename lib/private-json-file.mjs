import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';

function privateFileError(message) {
  return Object.assign(new Error(message), { code: 'EPRIVATEFILE' });
}

export async function readPrivateJsonFile(filePath, { fileSystem = fs } = {}) {
  const before = await fileSystem.lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw privateFileError('Private JSON path must be one regular file and cannot be a link.');
  }
  const file = await fileSystem.open(filePath, fsConstants.O_RDONLY | (Number(fsConstants.O_NOFOLLOW) || 0));
  try {
    const current = await file.stat();
    if (!current.isFile() || current.nlink !== 1 || current.dev !== before.dev || current.ino !== before.ino) {
      throw privateFileError('Private JSON file changed while it was being opened.');
    }
    return JSON.parse(await file.readFile('utf8'));
  } finally {
    await file.close().catch(() => {});
  }
}
