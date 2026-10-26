import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedHostname, blockedIp, blockedMethod } from '../scripts/browser-network-guard.ts';

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
