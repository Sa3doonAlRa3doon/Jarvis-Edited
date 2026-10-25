import test from 'node:test';
import assert from 'node:assert/strict';
import { isWebResearchPrompt, openWebsiteOnHost, searchWeb, validatePublicUrl, websiteFromPrompt } from '../lib/web-tools.mjs';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('recognizes explicit website actions and public web research prompts', () => {
  assert.equal(websiteFromPrompt('open YouTube'), 'https://www.youtube.com/');
  assert.equal(websiteFromPrompt('please open example.com'), 'https://example.com');
  assert.equal(isWebResearchPrompt('Search the web for Raspberry Pi updates'), true);
  assert.equal(isWebResearchPrompt('write a poem'), false);
});

test('blocks localhost and private network destinations', async () => {
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1:8787', { lookup: publicLookup }), /private network/i);
  await assert.rejects(() => validatePublicUrl('http://192.168.4.74/', { lookup: publicLookup }), /private network/i);
  await assert.rejects(() => validatePublicUrl('file:///etc/passwd', { lookup: publicLookup }), /HTTP or HTTPS/i);
});

test('parses bounded RSS search results and preserves citations', async () => {
  const rss = '<?xml version="1.0"?><rss><channel><item><title>Pi update</title><link>https://example.com/pi</link><description>New local features.</description></item></channel></rss>';
  const result = await searchWeb('search the web for Pi updates', {
    lookup: publicLookup,
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, async text() { return rss; } })
  });
  assert.equal(result.results[0].title, 'Pi update');
  assert.deepEqual(result.citations, ['https://example.com/pi']);
});

test('opens only the validated URL through a fixed platform executable', async () => {
  const calls = [];
  const spawnImpl = (command, args, options) => { calls.push({ command, args, options }); return { unref() {} }; };
  const result = await openWebsiteOnHost('https://example.com/path', { platform: 'win32', spawnImpl, lookup: publicLookup });
  assert.equal(result.scheduled, true);
  assert.deepEqual(calls[0].args, ['https://example.com/path']);
  assert.equal(calls[0].command, 'explorer.exe');
});
