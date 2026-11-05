import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function atomicPrivateWrite(filePath, content, { fileSystem = fs } = {}) {
  const target = path.resolve(filePath);
  const directory = path.dirname(target);
  await fileSystem.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(directory, `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    await fileSystem.writeFile(temporaryPath, content, { mode: 0o600, flag: 'wx' });
    await fileSystem.rename(temporaryPath, target);
  } finally {
    await fileSystem.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export class SerializedPrivateFile {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.options = options;
    this.tail = Promise.resolve();
  }

  write(content) {
    const operation = this.tail.then(() => atomicPrivateWrite(this.filePath, content, this.options));
    this.tail = operation.catch(() => {});
    return operation;
  }
}
