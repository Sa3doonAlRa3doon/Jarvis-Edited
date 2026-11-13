import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { SERVICE_ENVIRONMENT_KEYS, buildServiceEnvironment, serializeSystemdEnvironment } from '../lib/service-environments.mjs';

const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const outputIndex = args.indexOf('--output');
const sourcePath = sourceIndex >= 0 ? args[sourceIndex + 1] : '';
const outputDirectory = outputIndex >= 0 ? args[outputIndex + 1] : '';
if (!sourcePath || !outputDirectory) {
  throw new Error('Usage: node scripts/write-service-environments.mjs --source FILE --output DIRECTORY');
}

const source = dotenv.parse(await fs.readFile(sourcePath, 'utf8'));
await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
for (const service of Object.keys(SERVICE_ENVIRONMENT_KEYS)) {
  const target = path.join(outputDirectory, `${service}.env`);
  await fs.writeFile(target, serializeSystemdEnvironment(buildServiceEnvironment(source, service)), { mode: 0o600, flag: 'wx' });
}
