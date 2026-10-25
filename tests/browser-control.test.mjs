import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserControlStore, interactiveBrowserIntent, restrictedBrowserIntent } from '../lib/browser-control.mjs';

test('detects interactive browser tasks without gating ordinary research', () => {
  assert.equal(interactiveBrowserIntent('Use the browser to click the pricing tab'), true);
  assert.equal(interactiveBrowserIntent('Go to example.com in the browser and select Products'), true);
  assert.equal(interactiveBrowserIntent('Open Gmail and click the inbox tab'), true);
  assert.equal(interactiveBrowserIntent('Go to example.com and click Documentation'), true);
  assert.equal(interactiveBrowserIntent('Search the web for Raspberry Pi news'), false);
});

test('blocks browser tasks that need dedicated high-impact approvals', () => {
  assert.equal(restrictedBrowserIntent('Use the browser to enter my password'), 'secrets-or-sensitive-data');
  assert.equal(restrictedBrowserIntent('Use the website to buy this item'), 'financial-action');
  assert.equal(restrictedBrowserIntent('Use the browser to upload my passport'), 'secrets-or-sensitive-data');
  assert.equal(restrictedBrowserIntent('Use the browser to click the documentation tab'), '');
});

test('browser grants are exact-task, one-time, and expiring', () => {
  let now = 1_000;
  const store = new BrowserControlStore({ ttlMs: 500, now: () => now });
  const request = store.create('Use the browser to click Docs');
  const grant = store.approve(request.id);
  assert.throws(() => store.approve(request.id), /expired|already used/i);
  assert.throws(() => store.claim(grant.token, 'Use the browser to click Pricing'), /does not match/i);
  assert.deepEqual(store.claim(grant.token, 'Use the browser to click Docs'), { task: 'Use the browser to click Docs', approved: true });
  assert.throws(() => store.claim(grant.token, 'Use the browser to click Docs'), /missing|expired|does not match/i);
  const expiring = store.create('Use the browser to click About'); now += 600;
  assert.throws(() => store.approve(expiring.id), /expired|already used/i);
});
