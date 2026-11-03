import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserActionLoopGuard, guardBrowserToolRequest } from '../lib/browser-action-loop-guard.mjs';

test('warns at the repeat limit and blocks the next identical browser action', () => {
  const guard = new BrowserActionLoopGuard({ maxIdenticalCalls: 2, windowMs: 10_000 });
  assert.deepEqual(guard.checkCall('jarvis_browser_click', { ref: '17' }, 1), { blocked: false, warned: false, reason: '' });
  assert.equal(guard.checkCall('jarvis_browser_click', { ref: '17' }, 2).warned, true);
  const blocked = guard.checkCall('jarvis_browser_click', { ref: '17' }, 3);
  assert.equal(blocked.blocked, true);
  assert.match(blocked.reason, /after 2 repeats/);
});

test('canonicalizes argument key order and keeps distinct actions independent', () => {
  const guard = new BrowserActionLoopGuard({ maxIdenticalCalls: 1 });
  guard.checkCall('jarvis_browser_click', { ref: '17', element: 'Continue' }, 1);
  assert.equal(guard.checkCall('jarvis_browser_click', { element: 'Continue', ref: '17' }, 2).blocked, true);
  assert.equal(guard.checkCall('jarvis_browser_click', { ref: '18', element: 'Continue' }, 3).blocked, false);
  assert.equal(guard.checkCall('jarvis_browser_navigate', { url: 'https://example.com' }, 4).blocked, false);
});

test('canonicalizes arrays in their original order', () => {
  const guard = new BrowserActionLoopGuard({ maxIdenticalCalls: 1 });
  guard.checkCall('jarvis_browser_select_option', { values: ['first', 'second'] }, 1);
  assert.equal(guard.checkCall('jarvis_browser_select_option', { values: ['first', 'second'] }, 2).blocked, true);
  assert.equal(guard.checkCall('jarvis_browser_select_option', { values: ['second', 'first'] }, 3).blocked, false);
});

test('expires old repeats and supports an explicit reset', () => {
  const guard = new BrowserActionLoopGuard({ maxIdenticalCalls: 1, windowMs: 1_000 });
  guard.checkCall('jarvis_browser_click', { ref: '17' }, 1);
  assert.equal(guard.checkCall('jarvis_browser_click', { ref: '17' }, 2_000).blocked, false);
  assert.equal(guard.checkCall('jarvis_browser_click', { ref: '17' }, 2_001).blocked, true);
  guard.reset();
  assert.equal(guard.checkCall('jarvis_browser_click', { ref: '17' }, 2_002).blocked, false);
});

test('does not recurse through oversized or deeply nested tool arguments', () => {
  const guard = new BrowserActionLoopGuard({ maxIdenticalCalls: 1 });
  const large = { text: 'x'.repeat(40_000) };
  assert.equal(guard.checkCall('jarvis_browser_type', large, 1).blocked, false);
  let deep = {};
  let cursor = deep;
  for (let i = 0; i < 40; i += 1) { cursor.next = {}; cursor = cursor.next; }
  assert.equal(guard.checkCall('jarvis_browser_click', deep, 2).blocked, false);
});

test('returns a protocol-shaped MCP error only for a blocked guarded browser call', () => {
  const guard = new BrowserActionLoopGuard({ maxIdenticalCalls: 1 });
  const tools = new Set(['jarvis_browser_click']);
  const call = (name, id) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { ref: '8' } } });
  assert.equal(guardBrowserToolRequest(call('jarvis_browser_snapshot', 1), guard, tools), null);
  assert.equal(guardBrowserToolRequest(call('jarvis_browser_click', 2), guard, tools).localResponse, null);
  const blocked = guardBrowserToolRequest(call('jarvis_browser_click', 3), guard, tools);
  assert.equal(blocked.localResponse.id, 3);
  assert.equal(blocked.localResponse.result.isError, true);
  assert.match(blocked.localResponse.result.content[0].text, /stopped the same browser action after 1 repeats/);
});
