import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInternalServiceAuth } from './lib/local-service-auth.mjs';
import { DEFAULT_LOCAL_PORTS } from './lib/local-ports.mjs';
import { SerializedPrivateFile } from './lib/private-file-writer.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.JARVIS_SETTINGS_BACKEND_PORT || DEFAULT_LOCAL_PORTS.settings);
const token = String(process.env.JARVIS_INTERNAL_SERVICE_TOKEN || '');
const dataDirectory = path.resolve(process.env.JARVIS_DATA_DIR || path.join(root, 'data'));
const settingsPath = path.join(dataDirectory, 'settings.json');
const settingsWriter = new SerializedPrivateFile(settingsPath);

app.disable('x-powered-by');
app.use(express.json({ limit: '128kb', strict: true }));
app.get('/health', (_request, response) => response.json({ status: token ? 'ok' : 'degraded', service: 'settings', localOnly: true, authenticationConfigured: Boolean(token) }));
app.get('/settings', requireInternalServiceAuth(token), async (_request, response) => {
  try {
    const value = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings document.');
    response.set('Cache-Control', 'no-store').json(value);
  } catch (error) {
    if (error?.code === 'ENOENT') { response.set('Cache-Control', 'no-store').json({}); return; }
    response.status(500).json({ error: 'Could not read the local settings file.' });
  }
});
app.put('/settings', requireInternalServiceAuth(token), async (request, response) => {
  const value = request.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) { response.status(400).json({ error: 'Settings must be a JSON object.' }); return; }
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > 128 * 1024) { response.status(413).json({ error: 'Settings document is too large.' }); return; }
  try {
    await settingsWriter.write(serialized);
    await fs.chmod(settingsPath, 0o600).catch(() => {});
    response.json({ ok: true });
  } catch {
    response.status(500).json({ error: 'Could not save local settings.' });
  }
});

const server = app.listen(port, '127.0.0.1', () => console.log(`JARVIS settings backend listening on 127.0.0.1:${port}`));
function shutdown() { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
