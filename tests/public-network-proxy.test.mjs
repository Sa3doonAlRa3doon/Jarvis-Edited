import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createPublicNetworkProxy, isPublicNetworkAddress, resolvePublicNetworkAddress } from '../lib/public-network-proxy.mjs';

function requestThroughProxy(proxy, url, { auth = true, method = 'GET' } = {}) {
  const authorization = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
  const target = new URL(proxy.server);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname, port: Number(target.port), method, path: url,
      headers: auth ? { 'Proxy-Authorization': `Basic ${authorization}` } : {}
    }, (response) => {
      let body = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.once('error', reject); request.end();
  });
}

test('public address gate rejects private, reserved and mapped-private ranges', () => {
  for (const address of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '169.254.1.2', '172.20.1.1', '192.168.1.1', '192.0.2.4', '198.51.100.4', '203.0.113.4', '224.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:192.168.1.4', '2001:db8::1', '2002:c0a8:0101::1']) {
    assert.equal(isPublicNetworkAddress(address), false, `${address} must be blocked`);
  }
  for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPublicNetworkAddress(address), true, `${address} should be allowed`);
});

test('hostname resolution rejects mixed DNS answers and times out', async () => {
  await assert.rejects(() => resolvePublicNetworkAddress('rebind.example', async () => [
    { address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }
  ]), /private or unresolved/i);
  await assert.rejects(() => resolvePublicNetworkAddress('slow.example', () => new Promise(() => {}), 30), /timed out/i);
});

test('authenticated proxy pins the public DNS answer at the socket boundary', async () => {
  const upstream = http.createServer((_request, response) => { response.end('pinned response'); });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  const connects = [];
  const proxy = await createPublicNetworkProxy({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    connect: (options, callback) => { connects.push(options); return net.connect({ host: '127.0.0.1', port: address.port }, callback); }
  });
  try {
    const result = await requestThroughProxy(proxy, 'http://public.example/resource');
    assert.equal(result.status, 200);
    assert.equal(result.body, 'pinned response');
    assert.equal(connects[0].host, '93.184.216.34');
    assert.equal(connects[0].port, 80);
  } finally {
    await proxy.close();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('proxy requires a per-process credential and refuses private DNS results', async () => {
  let connects = 0;
  const proxy = await createPublicNetworkProxy({ lookup: async () => [{ address: '127.0.0.1', family: 4 }], connect: () => { connects += 1; throw new Error('must not connect'); } });
  try {
    const unauthenticated = await requestThroughProxy(proxy, 'http://public.example/', { auth: false });
    assert.equal(unauthenticated.status, 407);
    const denied = await requestThroughProxy(proxy, 'http://public.example/');
    assert.equal(denied.status, 403);
    assert.equal(connects, 0);
  } finally { await proxy.close(); }
});

test('MCP-compatible unauthenticated loopback mode still refuses private DNS results', async () => {
  let connects = 0;
  const proxy = await createPublicNetworkProxy({
    allowUnauthenticated: true,
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    connect: () => { connects += 1; throw new Error('must not connect'); }
  });
  try {
    const denied = await requestThroughProxy(proxy, 'http://rebound.example/metadata', { auth: false });
    assert.equal(denied.status, 403);
    assert.equal(connects, 0);
  } finally { await proxy.close(); }
});

test('HTTPS CONNECT pins the validated address and tunnels data', async () => {
  const upstream = net.createServer((socket) => { socket.write('tunnel-ready'); });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  const connects = [];
  const proxy = await createPublicNetworkProxy({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    connect: (options) => { connects.push(options); return net.connect({ host: '127.0.0.1', port: address.port }); }
  });
  try {
    const client = net.connect(Number(new URL(proxy.server).port), '127.0.0.1');
    const response = await new Promise((resolve, reject) => {
      let value = '';
      client.setEncoding('utf8');
      client.on('data', (chunk) => { value += chunk; if (value.includes('tunnel-ready')) resolve(value); });
      client.once('error', reject);
      client.once('connect', () => client.write(`CONNECT public.example:443 HTTP/1.1\r\nHost: public.example:443\r\nProxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}\r\n\r\n`));
      setTimeout(() => reject(new Error('CONNECT proxy response timed out.')), 1_000).unref?.();
    });
    assert.match(response, /200 Connection Established/);
    assert.equal(connects[0].host, '93.184.216.34');
    assert.equal(connects[0].port, 443);
    client.destroy();
  } finally {
    await proxy.close();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
