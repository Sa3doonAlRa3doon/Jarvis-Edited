import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ALLOWED_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.sh', '.css', '.html',
  '.yaml', '.yml', '.toml', '.sql', '.csv', '.pdf', '.stl', '.3mf', '.gcode', '.blend', '.scad'
]);
const BLOCKED_NAMES = /(^\.|node_modules|__pycache__|\.git|data|dist|build|coverage|credentials?|client_secret|token|oauth|secret|private|\.env|\.pem$|\.key$)/i;

function nodeId(rootIndex, relativePath) {
  return crypto.createHash('sha256').update(`${rootIndex}:${relativePath}`).digest('hex').slice(0, 16);
}

function configuredRoots(projectRoot, rawRoots = '') {
  const requested = String(rawRoots || '').split(path.delimiter).map((item) => item.trim()).filter(Boolean);
  return (requested.length ? requested : [projectRoot]).map((item) => path.resolve(item));
}

export async function buildKnowledgeIndex({ projectRoot, roots = '', maxDepth = 4, maxNodes = 180 } = {}) {
  const resolvedRoots = configuredRoots(projectRoot, roots);
  const nodes = [];
  const links = [];

  async function walk(root, rootIndex, absolute, relative = '', depth = 0, parentId = null) {
    if (nodes.length >= maxNodes || depth > maxDepth) return;
    let stats;
    try { stats = await fs.lstat(absolute); } catch { return; }
    if (stats.isSymbolicLink()) return;
    const name = relative ? path.basename(absolute) : path.basename(root) || `ROOT ${rootIndex + 1}`;
    if (relative && BLOCKED_NAMES.test(name)) return;
    const isDirectory = stats.isDirectory();
    if (!isDirectory && !ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())) return;
    const id = nodeId(rootIndex, relative || '.');
    nodes.push({
      id, parentId, name, type: isDirectory ? (depth === 0 ? 'root' : 'folder') : 'file',
      extension: isDirectory ? '' : path.extname(name).toLowerCase().slice(1),
      path: relative ? `${path.basename(root)}/${relative.split(path.sep).join('/')}` : path.basename(root),
      size: isDirectory ? 0 : stats.size,
      modifiedAt: stats.mtime.toISOString(), depth
    });
    if (parentId) links.push({ source: parentId, target: id });
    if (!isDirectory || depth >= maxDepth || nodes.length >= maxNodes) return;
    let entries;
    try { entries = await fs.readdir(absolute, { withFileTypes: true }); } catch { return; }
    entries.sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (nodes.length >= maxNodes) break;
      if (entry.isSymbolicLink() || BLOCKED_NAMES.test(entry.name)) continue;
      await walk(root, rootIndex, path.join(absolute, entry.name), path.join(relative, entry.name), depth + 1, id);
    }
  }

  for (let index = 0; index < resolvedRoots.length && nodes.length < maxNodes; index += 1) {
    await walk(resolvedRoots[index], index, resolvedRoots[index]);
  }
  return {
    nodes, links,
    summary: { roots: resolvedRoots.length, nodes: nodes.length, files: nodes.filter((item) => item.type === 'file').length, folders: nodes.filter((item) => item.type !== 'file').length },
    generatedAt: new Date().toISOString(),
    privacy: 'Names and metadata only. Hidden, secret, credential, token, key, data, build, and dependency paths are excluded.'
  };
}
