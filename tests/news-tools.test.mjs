import test from 'node:test';
import assert from 'node:assert/strict';
import { isGoogleNewsPrompt, newsQuery, searchGoogleNews } from '../lib/news-tools.mjs';

const rss = `<?xml version="1.0"?><rss><channel><item><title>Pi update - Example News</title><link>https://news.google.com/rss/articles/example</link><pubDate>Sat, 25 Oct 2026 08:00:00 GMT</pubDate><source>Example News</source></item></channel></rss>`;
const lookup = async () => [{ address: '8.8.8.8', family: 4 }];
const fetchImpl = async () => new Response(rss, { status: 200, headers: { 'content-type': 'application/rss+xml' } });

test('recognizes Google News requests and extracts a bounded query', () => {
  assert.equal(isGoogleNewsPrompt('Show Google News about Raspberry Pi'), true);
  assert.equal(isGoogleNewsPrompt('Explain a Raspberry Pi'), false);
  assert.equal(newsQuery('Show Google News about Raspberry Pi'), 'Raspberry Pi');
});

test('returns current RSS headlines with citations', async () => {
  const result = await searchGoogleNews('Google News about Raspberry Pi', { fetchImpl, lookup });
  assert.equal(result.results.length, 1); assert.equal(result.results[0].source, 'Example News'); assert.equal(result.citations.length, 1);
});
