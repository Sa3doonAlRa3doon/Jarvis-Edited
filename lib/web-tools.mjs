import dns from 'node:dns/promises';
import net from 'node:net';
import { camoufoxHeadless, closeCamoufoxHostContext, dedicatedCamoufoxProfile, getCamoufoxHostContext } from './camoufox-browser.mjs';

function clean(value, limit = 1200) {
  return String(value ?? '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function decodeXml(value) {
  return clean(value, 5000)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19);
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (!net.isIPv6(address)) return true;
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.');
}

export async function validatePublicUrl(value, { lookup = dns.lookup } = {}) {
  let url;
  try { url = new URL(String(value)); }
  catch { throw new Error('That is not a valid website address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP or HTTPS websites are allowed.');
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase())) throw new Error('Local and private network addresses are blocked by the web tool.');
  const addresses = net.isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Local and private network addresses are blocked by the web tool.');
  return url;
}

const WEBSITE_ALIASES = Object.freeze({
  youtube: 'https://www.youtube.com/', google: 'https://www.google.com/', gmail: 'https://mail.google.com/',
  github: 'https://github.com/', reddit: 'https://www.reddit.com/', instagram: 'https://www.instagram.com/',
  'google news': 'https://news.google.com/', news: 'https://news.google.com/',
  discord: 'https://discord.com/app', calendar: 'https://calendar.google.com/', drive: 'https://drive.google.com/'
});

export function websiteFromPrompt(prompt) {
  const match = String(prompt || '').trim().match(/^(?:please\s+)?open\s+(?:the\s+)?(.+?)(?:\s+(?:website|site|page))?(?:\s+and\s+(?:show|display|view)(?:\s+me)?(?:\s+(?:the\s+)?(?:page|website|site))?)?[.!?]*$/i);
  if (!match) return '';
  let target = clean(match[1], 300).toLowerCase();
  target = target.replace(/\s+(?:website|site|page)$/i, '').trim();
  if (WEBSITE_ALIASES[target]) return WEBSITE_ALIASES[target];
  if (/^https?:\/\//i.test(target)) return target;
  if (/^(?:www\.)?[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(target)) return `https://${target.replace(/^www\./i, 'www.')}`;
  if (/^[a-z0-9-]{2,40}$/i.test(target)) return `https://www.${target}.com/`;
  return '';
}

export function isWebResearchPrompt(prompt) {
  return /\b(search (?:the )?(?:web|internet|online)|web search|look (?:it|this|that|.+) up online|find online|latest (?:news|information|updates?)|today'?s news|current news|browse (?:the )?(?:web|internet))\b/i.test(String(prompt || ''));
}

export function webSearchQuery(prompt) {
  return clean(prompt, 500)
    .replace(/\b(?:please|jarvis|search|browse|look|find|the|web|internet|online|for|up|tell|me|about)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 220) || clean(prompt, 220);
}

export async function boundedFetch(url, { fetchImpl = globalThis.fetch, lookup = dns.lookup, timeoutMs = 12_000, maxRedirects = 3, method = 'GET', body, headers: extraHeaders = {} } = {}) {
  let current = await validatePublicUrl(url, { lookup });
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), method, body, headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/html;q=0.7', 'User-Agent': process.env.PUBLIC_API_USER_AGENT || 'JARVIS-Private-Web-Tool/1.0', ...extraHeaders } });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = await validatePublicUrl(new URL(response.headers.get('location'), current).href, { lookup });
      continue;
    }
    if (!response.ok) throw new Error(`Web request returned HTTP ${response.status}.`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > 2_000_000) throw new Error('Web response was too large.');
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Web response was too large.');
    return { url: current.href, text };
  }
  throw new Error('Website redirected too many times.');
}

export async function searchWeb(prompt, options = {}) {
  const query = webSearchQuery(prompt);
  const endpoint = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
  const { text } = await boundedFetch(endpoint, options);
  const results = [];
  for (const item of text.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = item[1];
    const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const description = decodeXml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    if (!title || !/^https?:\/\//i.test(link)) continue;
    try { await validatePublicUrl(link, { lookup: options.lookup || dns.lookup }); }
    catch { continue; }
    results.push({ title: clean(title, 220), url: link, snippet: clean(description, 420) });
    if (results.length >= 6) break;
  }
  if (!results.length) throw new Error('The web search returned no readable results.');
  return { query, results, citations: results.map((result) => result.url), context: `\nLive public web search results. Cite only these URLs and do not claim pages were read beyond their snippets:\n${JSON.stringify(results).slice(0, 12_000)}` };
}

/**
 * Open a public URL in JARVIS's dedicated browser profile.
 *
 * This intentionally does not call explorer.exe/open/xdg-open: those commands
 * delegate to the operator's personal browser profile and can leak cookies,
 * history, extensions, or page state into the JARVIS workflow. Read-only URL
 * validation still blocks private networks before a browser is launched.
 */
export async function openWebsiteOnHost(url, { platform = process.platform, lookup = dns.lookup, contextFactory = getCamoufoxHostContext } = {}) {
  const safe = await validatePublicUrl(url, { lookup });
  const profile = dedicatedCamoufoxProfile();
  const options = { profile, headless: camoufoxHeadless({ platform }), windowsHide: false };
  let context = await contextFactory(options);
  try {
    const pages = context.pages().filter((candidate) => !candidate.isClosed?.());
    const page = pages[0] || await context.newPage();
    await page.goto(safe.href, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    return { url: safe.href, profile, isolated: true, scheduled: true, engine: 'camoufox', pageTitle: clean(await page.title().catch(() => ''), 180) };
  } catch (error) {
    // A persistent Camoufox window can disappear during a desktop restart.
    // Drop only JARVIS's dedicated cached context and retry once; never fall
    // back to the user's personal browser or reuse its cookies.
    if (contextFactory === getCamoufoxHostContext && /(?:target page|context|browser).*closed/i.test(String(error?.message || error))) {
      await closeCamoufoxHostContext();
      context = await contextFactory(options);
      const page = (context.pages().find((candidate) => !candidate.isClosed?.())) || await context.newPage();
      await page.goto(safe.href, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      return { url: safe.href, profile, isolated: true, scheduled: true, engine: 'camoufox', pageTitle: clean(await page.title().catch(() => ''), 180) };
    }
    throw error;
  }
}
