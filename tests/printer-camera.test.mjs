import test from 'node:test';
import assert from 'node:assert/strict';
import { PrinterCameraClient, normalizePrinterCameraUrl, printerCameraCandidates } from '../lib/printer-camera.mjs';

function response({ status = 200, type = 'image/jpeg', bytes = Buffer.from([0xff, 0xd8, 0xff]) } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': type, 'content-length': String(bytes.length) }),
    arrayBuffer: async () => bytes
  };
}

test('scopes printer camera snapshots to the configured printer host', () => {
  assert.equal(normalizePrinterCameraUrl('http://192.168.4.74:8080/?action=snapshot', 'http://192.168.4.74:4408'), 'http://192.168.4.74:8080/?action=snapshot');
  assert.throws(() => normalizePrinterCameraUrl('http://192.168.4.75:8080/snapshot', 'http://192.168.4.74:4408'), /same host/);
  assert.throws(() => normalizePrinterCameraUrl('http://user:pass@192.168.4.74:8080/snapshot', 'http://192.168.4.74:4408'), /credential-free/);
});

test('builds bounded same-host Fluidd and Mainsail snapshot candidates', () => {
  assert.deepEqual(printerCameraCandidates('http://192.168.4.74:4408'), [
    'http://192.168.4.74:4408/webcam/?action=snapshot',
    'http://192.168.4.74:4408/webcam2/?action=snapshot',
    'http://192.168.4.74:4409/webcam/?action=snapshot',
    'http://192.168.4.74:4409/webcam2/?action=snapshot'
  ]);
  assert.deepEqual(printerCameraCandidates('not-a-url'), []);
});

test('returns a bounded image snapshot and never exposes the configured URL', async () => {
  const calls = [];
  const client = new PrinterCameraClient({
    url: 'http://192.168.4.74:8080/snapshot', printerBaseUrl: 'http://192.168.4.74:4408', apiKey: 'private-key',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response(); }
  });
  assert.equal(client.configured, true);
  assert.equal(client.snapshot().host, '192.168.4.74');
  assert.equal(JSON.stringify(client.snapshot()).includes('private-key'), false);
  const frame = await client.frame();
  assert.equal(frame.contentType, 'image/jpeg');
  assert.equal(frame.buffer.length, 3);
  assert.equal(calls[0].options.headers['X-Api-Key'], 'private-key');
});

test('rejects non-image camera responses', async () => {
  const client = new PrinterCameraClient({
    url: 'http://127.0.0.1:8080/snapshot', printerBaseUrl: 'http://127.0.0.1:4408',
    fetchImpl: async () => response({ type: 'text/html', bytes: Buffer.from('<html>') })
  });
  await assert.rejects(() => client.frame(), /did not return/);
});

test('caps streamed camera bodies before buffering them', async () => {
  const client = new PrinterCameraClient({
    url: 'http://127.0.0.1:8080/snapshot', printerBaseUrl: 'http://127.0.0.1:4408', maxBytes: 64 * 1024,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(64 * 1024 + 1)); controller.close(); } })
    })
  });
  await assert.rejects(() => client.frame(), /exceeds the configured size limit/);
});

test('auto-discovers the first responding same-host snapshot and reuses its bounded frame', async () => {
  const calls = [];
  const client = new PrinterCameraClient({
    printerBaseUrl: 'http://192.168.4.74:4408',
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith('/webcam/?action=snapshot')) return response({ status: 404, type: 'text/plain', bytes: Buffer.from('missing') });
      return response({ type: 'image/png', bytes: Buffer.from([137, 80, 78, 71]) });
    }
  });
  assert.equal(client.configured, false);
  const frame = await client.frame();
  assert.equal(frame.contentType, 'image/png');
  assert.equal(frame.buffer.length, 4);
  assert.deepEqual(calls.slice(0, 2), [
    'http://192.168.4.74:4408/webcam/?action=snapshot',
    'http://192.168.4.74:4408/webcam2/?action=snapshot'
  ]);
  assert.equal(client.snapshot().discovery, 'found');
  assert.equal(client.snapshot().host, '192.168.4.74');
  assert.equal(client.snapshot().autoDiscovery, false);
});

test('retries bounded auto-discovery after a printer was offline', async () => {
  let online = false;
  const calls = [];
  const client = new PrinterCameraClient({
    printerBaseUrl: 'http://192.168.4.74:4408',
    discoveryTimeoutMs: 500,
    fetchImpl: async (url) => {
      calls.push(url);
      if (!online) return response({ status: 503, type: 'text/plain', bytes: Buffer.from('offline') });
      return response({ type: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) });
    }
  });
  const first = await client.discover();
  assert.equal(first.configured, false);
  assert.equal(client.snapshot().discovery, 'not-found');
  online = true;
  const second = await client.discover({ retry: true });
  assert.equal(second.configured, true);
  assert.equal(client.snapshot().discovery, 'found');
  assert.equal(calls.length, 5);
});
