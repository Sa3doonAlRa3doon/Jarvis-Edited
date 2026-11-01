import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import { pipeline } from 'node:stream';

const LOOPBACK = '127.0.0.1';
const MAX_HTTP_RESPONSE_BYTES = 32 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 4_000;

function blockedIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c <= 2) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

export function isPublicNetworkAddress(value) {
  const address = String(value || '').toLowerCase().split('%')[0];
  if (net.isIPv4(address)) return !blockedIpv4(address);
  if (!net.isIPv6(address)) return false;
  if (address.startsWith('::ffff:')) {
    const mapped = address.slice('::ffff:'.length);
    return net.isIPv4(mapped) && !blockedIpv4(mapped);
  }
  // Only global-unicast IPv6 (2000::/3) is accepted. This also rejects
  // unspecified, loopback, link-local, ULA, multicast, and reserved ranges.
  return /^[23]/.test(address) && !address.startsWith('2001:db8:') && !address.startsWith('2001:0:') && !address.startsWith('2002:');
}

export async function resolvePublicNetworkAddress(hostname, lookup = dns.lookup, timeoutMs = DNS_TIMEOUT_MS) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === 'local' || host.endsWith('.local') || host === 'home.arpa' || host.endsWith('.home.arpa')) {
    throw new Error('Private browser destination blocked.');
  }
  let records;
  if (net.isIP(host)) records = [{ address: host, family: net.isIP(host) }];
  else {
    let timer;
    try {
      records = await Promise.race([
        Promise.resolve().then(() => lookup(host, { all: true, verbatim: true })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Public website DNS lookup timed out.')), timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  }
  if (!records.length || records.some((record) => !isPublicNetworkAddress(record.address))) throw new Error('Private or unresolved browser destination blocked.');
  return records[0];
}

function sameSecret(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function hasProxyAuth(request, expected) {
  const value = String(request.headers['proxy-authorization'] || '');
  return value.startsWith('Basic ') && sameSecret(value.slice(6), expected);
}

function respond(response, status, message) {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });
  response.end(message);
}

function publicHeaders(source, host) {
  const headers = { ...source, host, connection: 'close' };
  for (const name of ['proxy-authorization', 'proxy-connection', 'connection', 'keep-alive', 'upgrade', 'te', 'trailer']) delete headers[name];
  return headers;
}

export async function createPublicNetworkProxy({ lookup = dns.lookup, port = 0, connect = net.connect, allowUnauthenticated = false } = {}) {
  const username = crypto.randomBytes(18).toString('hex');
  const password = crypto.randomBytes(32).toString('hex');
  const expectedAuth = Buffer.from(`${username}:${password}`).toString('base64');
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    sockets.add(request.socket);
    request.socket.once('close', () => sockets.delete(request.socket));
    if (!allowUnauthenticated && !hasProxyAuth(request, expectedAuth)) {
      response.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="JARVIS public web"', Connection: 'close', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    void (async () => {
      let target;
      try { target = new URL(request.url); } catch { respond(response, 400, 'Invalid proxy request.'); return; }
      if (target.protocol !== 'http:' || target.username || target.password || target.port && target.port !== '80') { respond(response, 403, 'Only public HTTP port 80 is allowed.'); return; }
      let destination;
      try { destination = await resolvePublicNetworkAddress(target.hostname, lookup); }
      catch { respond(response, 403, 'Private or unresolved browser destination blocked.'); return; }
      const agent = new http.Agent({ keepAlive: false });
      agent.createConnection = (options, callback) => connect({ ...options, host: destination.address, family: destination.family }, callback);
      const upstream = http.request({
        hostname: destination.address,
        family: destination.family,
        port: 80,
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: publicHeaders(request.headers, target.host),
        agent,
        timeout: CONNECT_TIMEOUT_MS
      }, (upstreamResponse) => {
        const headers = { ...upstreamResponse.headers, connection: 'close' };
        for (const name of ['proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'keep-alive', 'upgrade']) delete headers[name];
        response.writeHead(upstreamResponse.statusCode || 502, headers);
        let bytes = 0;
        upstreamResponse.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_HTTP_RESPONSE_BYTES) { upstreamResponse.destroy(); response.destroy(); }
        });
        // The browser can cancel navigation while an upstream body is still
        // streaming. pipeline() owns both error paths so a late socket write
        // cannot become an unhandled ERR_STREAM_WRITE_AFTER_END and crash the
        // JARVIS dashboard process.
        pipeline(upstreamResponse, response, (error) => {
          if (error && !response.destroyed) response.destroy();
        });
        upstreamResponse.once('close', () => agent.destroy());
      });
      upstream.once('timeout', () => upstream.destroy(new Error('Public web connection timed out.')));
      upstream.once('error', (error) => { agent.destroy(); respond(response, 502, String(error?.message || 'Public web connection failed.').slice(0, 180)); });
      request.pipe(upstream);
      request.once('aborted', () => upstream.destroy());
      response.once('close', () => { if (!response.writableEnded) upstream.destroy(); });
    })().catch(() => respond(response, 502, 'Public web request failed.'));
  });

  server.on('connect', (request, client, head) => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    void (async () => {
      if (!allowUnauthenticated && !hasProxyAuth(request, expectedAuth)) {
        client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="JARVIS public web"\r\nConnection: close\r\n\r\n');
        return;
      }
      let target;
      try { target = new URL(`https://${request.url}`); } catch { client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return; }
      if (target.username || target.password || target.port && target.port !== '443') { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
      let destination;
      try { destination = await resolvePublicNetworkAddress(target.hostname, lookup); }
      catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
      const remote = connect({ host: destination.address, family: destination.family, port: 443 });
      sockets.add(remote);
      remote.once('close', () => sockets.delete(remote));
      const timer = setTimeout(() => remote.destroy(new Error('Public web connection timed out.')), CONNECT_TIMEOUT_MS);
      remote.once('connect', () => {
        clearTimeout(timer);
        client.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: JARVIS\r\n\r\n');
        if (head.length) remote.write(head);
        remote.pipe(client);
        client.pipe(remote);
      });
      remote.once('error', () => { clearTimeout(timer); if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'); });
      client.once('close', () => { clearTimeout(timer); remote.destroy(); });
    })().catch(() => { if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'); });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: LOOPBACK, port }, resolve);
  });
  const address = server.address();
  const serverUrl = `http://${LOOPBACK}:${address.port}`;
  let closed = false;
  return {
    server: serverUrl,
    username,
    password,
    playwrightProxy: { server: serverUrl, username, password, bypass: '' },
    cliProxyUrl: `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${LOOPBACK}:${address.port}`,
    unauthenticatedCliProxyUrl: serverUrl,
    async close() {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

let sharedProxyPromise = null;

export function getPublicNetworkProxy() {
  if (!sharedProxyPromise) sharedProxyPromise = createPublicNetworkProxy().catch((error) => { sharedProxyPromise = null; throw error; });
  return sharedProxyPromise;
}

export async function closePublicNetworkProxy() {
  const pending = sharedProxyPromise;
  sharedProxyPromise = null;
  if (!pending) return;
  try { await (await pending).close(); } catch {}
}
