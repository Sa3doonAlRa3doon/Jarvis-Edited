import dns from 'node:dns/promises';
import net from 'node:net';

const SAFE_BROWSER_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function blockedMethod(method: string) {
  return !SAFE_BROWSER_METHODS.has(String(method || '').toUpperCase());
}

export function blockedNavigationScheme(protocol: string, isNavigationRequest: boolean) {
  return isNavigationRequest && !['http:', 'https:'].includes(String(protocol).toLowerCase());
}

const cache = new Map<string, { expiresAt: number; addresses: string[] }>();
const CACHE_MS = 60_000;
const MAX_CACHE_ENTRIES = 512;

export function cachedPublicAddresses(cacheStore: Map<string, { expiresAt: number; addresses: string[] }>, hostname: string, now = Date.now()) {
  const key = String(hostname || '').toLowerCase();
  const entry = cacheStore.get(key);
  if (!entry || entry.expiresAt <= now) {
    if (entry) cacheStore.delete(key);
    return null;
  }
  cacheStore.delete(key);
  cacheStore.set(key, entry);
  return entry.addresses;
}

export function rememberPublicAddresses(
  cacheStore: Map<string, { expiresAt: number; addresses: string[] }>,
  hostname: string,
  addresses: string[],
  now = Date.now(),
  maxEntries = MAX_CACHE_ENTRIES
) {
  const key = String(hostname || '').toLowerCase();
  const safeLimit = Math.max(1, Math.floor(Number(maxEntries) || MAX_CACHE_ENTRIES));
  for (const [entryKey, entry] of cacheStore) {
    if (entry.expiresAt <= now) cacheStore.delete(entryKey);
  }
  cacheStore.delete(key);
  cacheStore.set(key, { expiresAt: now + CACHE_MS, addresses: [...addresses] });
  while (cacheStore.size > safeLimit) cacheStore.delete(cacheStore.keys().next().value as string);
}

export function blockedIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

export function blockedIp(address: string) {
  const normalized = address.toLowerCase().split('%')[0];
  if (net.isIPv4(normalized)) return blockedIpv4(normalized);
  if (!net.isIPv6(normalized)) return true;
  if (normalized === '::' || normalized === '::1') return true;
  if (/^(?:fc|fd|ff)/.test(normalized) || /^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? blockedIpv4(mapped) : false;
}

export function blockedHostname(hostname: string) {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return value === 'localhost' || value.endsWith('.localhost') || value === 'local' || value.endsWith('.local') ||
    value === 'home.arpa' || value.endsWith('.home.arpa') || (net.isIP(value) ? blockedIp(value) : false);
}

async function publicAddresses(hostname: string) {
  const key = hostname.toLowerCase();
  const cached = cachedPublicAddresses(cache, key);
  if (cached) return cached;
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map((record) => record.address);
  if (!addresses.length || addresses.some(blockedIp)) throw new Error('Private or unresolved browser destination blocked.');
  rememberPublicAddresses(cache, key, addresses);
  return addresses;
}

export default async ({ page }: { page: any }) => {
  await page.context().route('**/*', async (route: any) => {
    try {
      const url = new URL(route.request().url());
      if (blockedMethod(route.request().method())) {
        await route.abort('blockedbyclient');
        return;
      }
      if (blockedNavigationScheme(url.protocol, route.request().isNavigationRequest())) {
        await route.abort('blockedbyclient');
        return;
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        await route.continue();
        return;
      }
      if (blockedHostname(url.hostname)) throw new Error('Private browser destination blocked.');
      if (!net.isIP(url.hostname)) await publicAddresses(url.hostname);
      await route.continue();
    } catch {
      await route.abort('blockedbyclient');
    }
  });
};
