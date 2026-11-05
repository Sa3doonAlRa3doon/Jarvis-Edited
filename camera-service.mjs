import 'dotenv/config';
import express from 'express';
import { CameraFrameBroker } from './lib/camera-frame-broker.mjs';
import { binaryAvailable, linuxCameras, runBinary } from './lib/system-probe.mjs';
import { requireInternalServiceAuth } from './lib/local-service-auth.mjs';
import { DEFAULT_LOCAL_PORTS } from './lib/local-ports.mjs';

const app = express();
const port = Number(process.env.JARVIS_CAMERA_BACKEND_PORT || DEFAULT_LOCAL_PORTS.camera);
const token = String(process.env.JARVIS_INTERNAL_SERVICE_TOKEN || '');
const frameBroker = new CameraFrameBroker({
  capture: (device) => runBinary('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'v4l2', '-i', device, '-frames:v', '1', '-vf', 'scale=960:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { encoding: 'buffer', timeout: 9000, maxBuffer: 8 * 1024 * 1024 })
});
app.disable('x-powered-by');
app.get('/health', (_request, response) => response.json({ status: token ? 'ok' : 'degraded', service: 'camera', localOnly: true, authenticationConfigured: Boolean(token) }));
app.use(requireInternalServiceAuth(token));
app.get('/devices', async (_request, response) => {
  const [cameras, ffmpeg] = await Promise.all([linuxCameras(), binaryAvailable('ffmpeg', ['-version'])]);
  response.set('Cache-Control', 'no-store').json({ platform: process.platform, cameras, tools: { ffmpeg } });
});
app.get('/frame', async (request, response) => {
  const requestedDevice = String(request.query.device || '');
  if (process.platform !== 'linux' || !/^\/dev\/video\d+$/.test(requestedDevice)) {
    response.status(400).json({ error: 'Choose a Pi camera returned by the local camera backend.' }); return;
  }
  if (!(await linuxCameras()).some((item) => item.id === requestedDevice)) { response.status(400).json({ error: 'The selected Pi camera is not available.' }); return; }
  try {
    const frame = await frameBroker.frame(requestedDevice);
    response.set({ 'Cache-Control': 'no-store, max-age=0', 'Content-Type': 'image/jpeg', 'Content-Length': frame.length }).send(frame);
  } catch (error) { response.status(503).json({ error: String(error.message || 'Pi camera capture failed.').slice(0, 160) }); }
});

const server = app.listen(port, '127.0.0.1', () => console.log(`JARVIS camera backend listening on 127.0.0.1:${port}`));
function shutdown() { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
