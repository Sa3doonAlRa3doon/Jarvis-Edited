import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetDirectory = path.join(project, 'public', 'models', 'coco-ssd');
const baseUrl = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2';

const assets = [
  ['group1-shard1of5', 4194304, '0e7af0f713e98521252321f7f84892c31cefccccec3ac64c84e5065b75ed5646'],
  ['group1-shard2of5', 4194304, '74cc6cfc2c4510c9cd81b8ad4cebf6f6a8f305119bb365ce0eb96276da38519a'],
  ['group1-shard3of5', 4194304, '50383033f893eae136392a403e8f70ade5efd90867df5695c4ca5ac640e14f38'],
  ['group1-shard4of5', 4194304, 'd856dc534c780068bbf6c666ce1516df2c8433d87578aa31fcdf197de7058cc2'],
  ['group1-shard5of5', 1257312, '3d356f1fb6dfca6af78c56db34d9326706d0196e303f9de6b04f236ca79ed309']
];

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function isValid(target, size, sha256) {
  try {
    const data = await readFile(target);
    return data.length === size && digest(data) === sha256;
  } catch {
    return false;
  }
}

await mkdir(targetDirectory, { recursive: true });

for (const [name, size, sha256] of assets) {
  const target = path.join(targetDirectory, name);
  if (await isValid(target, size, sha256)) {
    console.log(`Verified local vision asset: ${name}`);
    continue;
  }

  const response = await fetch(`${baseUrl}/${name}`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Could not download ${name}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length !== size || digest(data) !== sha256) {
    throw new Error(`Integrity check failed for ${name}`);
  }

  const temporary = `${target}.download`;
  await rm(temporary, { force: true });
  await writeFile(temporary, data, { mode: 0o600 });
  await rename(temporary, target);
  console.log(`Installed official vision asset: ${name}`);
}
