import dns from 'node:dns/promises';
import net from 'node:net';

const SAFE_BROWSER_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function blockedMethod(method: string) {
  return !SAFE_BROWSER_METHODS.has(String(method || '').toUpperCase());
}

const cache = new Map<string, { expiresAt: number; addresses: string[] }>();
const CACHE_MS = 60_000;

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
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.addresses;
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map((record) => record.address);
  if (!addresses.length || addresses.some(blockedIp)) throw new Error('Private or unresolved browser destination blocked.');
  cache.set(key, { addresses, expiresAt: Date.now() + CACHE_MS });
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
