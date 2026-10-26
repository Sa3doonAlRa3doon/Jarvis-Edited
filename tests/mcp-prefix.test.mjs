import test from 'node:test';
import assert from 'node:assert/strict';
import { browserRequestToUpstream, browserResponseToClient, prefixToolName, stripToolPrefix } from '../scripts/mcp-prefix.mjs';

test('prefixes Playwright tool discovery to avoid OpenJarvis native collisions', () => {
  const response = browserResponseToClient(JSON.stringify({
    jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'browser_navigate' }, { name: 'browser_click' }] }
  }));
  assert.deepEqual(JSON.parse(response).result.tools.map((tool) => tool.name), [
    'jarvis_browser_navigate', 'jarvis_browser_click'
  ]);
});

test('strips only the private prefix from forwarded tool calls', () => {
  const request = browserRequestToUpstream(JSON.stringify({
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'jarvis_browser_navigate', arguments: { url: 'https://example.com' } }
  }));
  const parsed = JSON.parse(request);
  assert.equal(parsed.params.name, 'browser_navigate');
  assert.equal(parsed.params.arguments.url, 'https://example.com');
  assert.equal(prefixToolName('jarvis_browser_click'), 'jarvis_browser_click');
  assert.equal(stripToolPrefix('browser_click'), 'browser_click');
});

test('passes non-JSON diagnostics through unchanged', () => {
  assert.equal(browserResponseToClient('diagnostic text'), 'diagnostic text');
  assert.equal(browserRequestToUpstream('diagnostic text'), 'diagnostic text');
});

test('emits ASCII-safe JSON for the Windows OpenJarvis stdio transport', () => {
  const line = browserResponseToClient(JSON.stringify({ jsonrpc: '2.0', id: 3, result: { content: 'Example → ready ✅' } }));
  assert.match(line, /\\u2192/);
  assert.doesNotMatch(line, /→|✅/u);
  assert.equal(JSON.parse(line).result.content, 'Example → ready ✅');
});
