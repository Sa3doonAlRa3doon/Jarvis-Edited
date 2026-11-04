import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trustedProxyClientAddress, trustedProxyHttpsState } from './lib/request-security.mjs';
import { DEFAULT_LOCAL_PORTS } from './lib/local-ports.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || DEFAULT_LOCAL_PORTS.dashboard);
const apiHost = process.env.API_HOST || '127.0.0.1';
const apiPort = Number(process.env.API_PORT || DEFAULT_LOCAL_PORTS.api);
const internalServiceToken = String(process.env.JARVIS_INTERNAL_SERVICE_TOKEN || '');
const trustedProxyAddresses = String(process.env.TRUSTED_DASHBOARD_PROXY_IPS || '').split(',').map((value) => value.trim()).filter(Boolean);
const publicDir = path.join(root, 'public');

app.disable('x-powered-by');
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'dashboard', localOnly: true }));
app.use((request, response, next) => {
  const scriptPolicy = request.path === '/settings' ? "'self' 'unsafe-eval' 'wasm-unsafe-eval'" : "'self' 'wasm-unsafe-eval'";
  response.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), on-device-speech-recognition=(self), geolocation=()',
    'Content-Security-Policy': `default-src 'self'; script-src ${scriptPolicy}; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'`
  });
  next();
});

app.get('/settings', (_request, response) => response.sendFile(path.join(publicDir, 'settings.html')));
app.get('/workspace', (_request, response) => response.sendFile(path.join(publicDir, 'workspace.html')));
app.use(express.static(publicDir, {
  etag: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders: (response, file) => {
    // Revalidate application code after a deployment; retain the longer cache
    // for large, unchanged local model assets on the Pi.
    if (/\.(?:html|js|css)$/i.test(file)) response.setHeader('Cache-Control', 'no-cache');
  }
}));

// Keep the browser on one same-origin URL while the API stays private on Pi loopback.
// Streaming API responses (SSE) and audio/file bodies are piped without buffering.
app.use((request, response) => {
  const forwardedProto = trustedProxyHttpsState({
    secure: request.secure,
    remoteAddress: request.socket.remoteAddress,
    forwardedProto: request.get('X-Forwarded-Proto'),
    trustedProxyAddresses
  }) ? 'https' : 'http';
  const headers = {
    ...request.headers,
    host: request.get('host'),
    'x-forwarded-proto': forwardedProto,
    'x-jarvis-proxy-token': internalServiceToken,
    // Replace caller input; the API verifies this front end's token as well.
    'x-jarvis-client-address': trustedProxyClientAddress({
      remoteAddress: request.socket.remoteAddress,
      forwardedFor: request.get('X-Forwarded-For'),
      trustedProxyAddresses
    })
  };
  const proxy = http.request({ hostname: apiHost, port: apiPort, method: request.method, path: request.originalUrl, headers });
  proxy.on('response', (upstream) => {
    response.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(response);
  });
  proxy.on('error', () => {
    if (!response.headersSent) response.status(503).json({ error: 'JARVIS back end is unavailable.', backend: 'offline' });
    else response.destroy();
  });
  request.pipe(proxy);
  response.on('close', () => proxy.destroy());
});

const server = app.listen(port, host, () => {
  console.log(`JARVIS front end listening at http://${host}:${port}; private API at http://${apiHost}:${apiPort}`);
});
function shutdown() { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
