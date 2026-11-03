import net from 'node:net';

export function isLoopbackAddress(value) {
  const address = String(value || '').toLowerCase().replace(/^::ffff:/, '');
  return address === '127.0.0.1' || address === '::1' || address === 'localhost';
}

function normalizeIpAddress(value) {
  let address = String(value || '').trim().toLowerCase().split('%')[0];
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);
  if (address.startsWith('::ffff:') && net.isIPv4(address.slice(7))) address = address.slice(7);
  return net.isIP(address) ? address : '';
}

// The split front end overwrites this header with its socket peer address. The
// API only honors it for loopback peers, so a remote API caller cannot spoof it.
export function rateLimitClientAddress({ remoteAddress = '', proxiedClientAddress = '' } = {}) {
  const remote = normalizeIpAddress(remoteAddress);
  if (isLoopbackAddress(remote)) return normalizeIpAddress(proxiedClientAddress) || remote || 'unknown';
  return remote || 'unknown';
}

// Trust X-Forwarded-For only when the immediate peer is explicitly configured
// as a reverse proxy. The proxy must append the connecting client address.
export function trustedProxyClientAddress({ remoteAddress = '', forwardedFor = '', trustedProxyAddresses = [] } = {}) {
  const remote = normalizeIpAddress(remoteAddress);
  if (!remote) return 'unknown';
  const trusted = new Set((Array.isArray(trustedProxyAddresses) ? trustedProxyAddresses : [])
    .map(normalizeIpAddress).filter(Boolean));
  if (!trusted.has(remote)) return remote;
  const chain = String(forwardedFor || '').slice(0, 1024).split(',').map(normalizeIpAddress).filter(Boolean).slice(-16);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (!trusted.has(chain[index])) return chain[index];
  }
  return remote;
}

// Sliding-window limiter with bounded buckets and no growth after a caller is
// blocked. Refreshing a key moves it to the end for bounded LRU eviction.
export function rateLimitWindow(store, key, {
  now = Date.now(), windowMs = 60_000, maxAttempts = 8, maxBuckets = 2048
} = {}) {
  if (!(store instanceof Map)) throw new TypeError('Rate-limit storage must be a Map.');
  const bucket = String(key || 'unknown').slice(0, 128) || 'unknown';
  const safeNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const safeWindow = Math.max(1, Number(windowMs) || 60_000);
  const safeLimit = Math.max(1, Math.floor(Number(maxAttempts) || 1));
  const safeMaxBuckets = Math.max(1, Math.floor(Number(maxBuckets) || 1));
  const recent = (store.get(bucket) || []).filter((timestamp) => Number.isFinite(timestamp) && timestamp <= safeNow && safeNow - timestamp < safeWindow);
  store.delete(bucket);
  const limited = recent.length >= safeLimit;
  if (!limited) recent.push(safeNow);
  store.set(bucket, recent);
  while (store.size > safeMaxBuckets) store.delete(store.keys().next().value);
  return limited;
}

export function trustedHttpsState({ secure = false, remoteAddress = '', forwardedProto = '' } = {}) {
  if (secure) return true;
  if (!isLoopbackAddress(remoteAddress)) return false;
  return String(forwardedProto || '').split(',')[0].trim().toLowerCase() === 'https';
}

export function privateApiTransportAllowed(input = {}) {
  return isLoopbackAddress(input.remoteAddress) || trustedHttpsState(input);
}
