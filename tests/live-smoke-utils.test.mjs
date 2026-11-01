import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLoopbackBaseUrl, validCameraSmokeFrame } from '../lib/live-smoke-utils.mjs';

test('real-camera smoke accepts only loopback dashboard origins', () => {
  for (const origin of ['http://localhost:8788', 'http://127.0.0.1:8788', 'http://[::1]:8788']) {
    assert.doesNotThrow(() => assertLoopbackBaseUrl(origin));
  }
  for (const origin of ['https://example.com', 'http://192.168.4.123:8788', 'not a url']) {
    assert.throws(() => assertLoopbackBaseUrl(origin), /localhost/);
  }
});

test('real-camera smoke accepts bounded image responses and rejects invalid payloads', () => {
  assert.equal(validCameraSmokeFrame({ status: 200, contentType: 'image/jpeg; charset=binary', byteLength: 4096 }), true);
  assert.equal(validCameraSmokeFrame({ status: 200, contentType: 'image/png', byteLength: 128 }), true);
  assert.equal(validCameraSmokeFrame({ status: 200, contentType: 'text/html', byteLength: 4096 }), false);
  assert.equal(validCameraSmokeFrame({ status: 503, contentType: 'image/jpeg', byteLength: 4096 }), false);
  assert.equal(validCameraSmokeFrame({ status: 200, contentType: 'image/jpeg', byteLength: 127 }), false);
  assert.equal(validCameraSmokeFrame({ status: 200, contentType: 'image/jpeg', byteLength: 2_500_001 }), false);
});
