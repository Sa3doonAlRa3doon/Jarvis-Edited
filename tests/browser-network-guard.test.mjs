import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedHostname, blockedIp, blockedMethod, blockedNavigationScheme, cachedPublicAddresses, rememberPublicAddresses } from '../scripts/browser-network-guard.ts';

test('browser network guard allows public domains and public IPs', () => {
  assert.equal(blockedHostname('example.com'), false);
  assert.equal(blockedHostname('www.google.com.'), false);
  assert.equal(blockedIp('1.1.1.1'), false);
  assert.equal(blockedIp('2606:4700:4700::1111'), false);
});

test('browser network guard blocks local names and non-public IP ranges', () => {
  for (const host of ['localhost', 'pi.local', 'home.arpa', 'service.home.arpa']) {
    assert.equal(blockedHostname(host), true);
  }
  for (const address of ['127.0.0.1', '10.0.0.8', '172.16.0.2', '192.168.4.1', '169.254.1.1', '::1', 'fd00::1']) {
    assert.equal(blockedIp(address), true);
  }
});

test('browser network guard blocks state-changing HTTP methods', () => {
  assert.equal(blockedMethod('GET'), false);
  assert.equal(blockedMethod('HEAD'), false);
  assert.equal(blockedMethod('OPTIONS'), false);
  assert.equal(blockedMethod('POST'), true);
  assert.equal(blockedMethod('PUT'), true);
  assert.equal(blockedMethod('PATCH'), true);
  assert.equal(blockedMethod('DELETE'), true);
});

test('browser network guard blocks non-web navigation schemes but permits embedded resources', () => {
  for (const protocol of ['file:', 'data:', 'javascript:', 'ftp:', 'about:', 'blob:']) {
    assert.equal(blockedNavigationScheme(protocol, true), true, protocol);
  }
  assert.equal(blockedNavigationScheme('https:', true), false);
  assert.equal(blockedNavigationScheme('http:', true), false);
  assert.equal(blockedNavigationScheme('data:', false), false);
  assert.equal(blockedNavigationScheme('blob:', false), false);
});

test('public DNS cache expires entries and enforces a bounded LRU size', () => {
  const cache = new Map();
  rememberPublicAddresses(cache, 'A.example', ['1.1.1.1'], 1000, 2);
  rememberPublicAddresses(cache, 'b.example', ['8.8.8.8'], 1000, 2);
  assert.deepEqual(cachedPublicAddresses(cache, 'a.example', 2000), ['1.1.1.1']);
  rememberPublicAddresses(cache, 'c.example', ['9.9.9.9'], 2000, 2);
  assert.equal(cache.size, 2);
  assert.equal(cache.has('b.example'), false);
  assert.deepEqual(cachedPublicAddresses(cache, 'c.example', 2001), ['9.9.9.9']);
  assert.equal(cachedPublicAddresses(cache, 'a.example', 62_000), null);
});
