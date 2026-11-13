import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMoonrakerStatus, PrinterClient } from '../lib/printer-client.mjs';

function response(payload = {}, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('normalizes an active Moonraker print and computes metadata ETA', () => {
  const status = normalizeMoonrakerStatus({ result: { status: {
    print_stats: { state: 'printing', filename: 'prototype.3mf', print_duration: 1200 },
    virtual_sdcard: { progress: .25 }, display_status: { progress: .25 },
    extruder: { temperature: 212.4, target: 215 }, heater_bed: { temperature: 59.8, target: 60 },
    toolhead: { position: [10, 20, 3.4] }
  } } }, { result: { estimated_time: 4800, size: 4000000, layer_count: 220 } });
  assert.equal(status.online, true);
  assert.equal(status.state, 'printing');
  assert.equal(status.progress, .25);
  assert.equal(status.remaining, 3600);
  assert.equal(status.temperatures.nozzleTarget, 215);
  assert.equal(status.metadata.layerCount, 220);
});

test('falls back to progress based ETA and handles completed jobs', () => {
  const printing = normalizeMoonrakerStatus({ result: { status: { print_stats: { state: 'printing', print_duration: 900 }, virtual_sdcard: { progress: .5 } } } });
  assert.equal(printing.remaining, 900);
  const complete = normalizeMoonrakerStatus({ result: { status: { print_stats: { state: 'complete', print_duration: 1800 }, virtual_sdcard: { progress: 1 } } } });
  assert.equal(complete.remaining, 0);
});

test('rejects unsafe printer URLs and keeps credentials in the API-key header', async () => {
  assert.throws(() => new PrinterClient({ baseUrl: 'file:///tmp/printer' }), /http or https/);
  assert.throws(() => new PrinterClient({ baseUrl: 'http://user:password@192.168.4.74:4408/' }), /embedded credentials/);
  const calls = [];
  const client = new PrinterClient({
    baseUrl: 'http://192.168.4.74:4408/#/', apiKey: 'private-key',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ result: { status: {} } }); }
  });
  const status = await client.status();
  assert.equal(status.online, true);
  assert.equal(calls[0].url.startsWith('http://192.168.4.74:4408/printer/objects/query?'), true);
  assert.equal(calls[0].options.headers['X-Api-Key'], 'private-key');
});

test('coalesces concurrent printer polls and tolerates unavailable metadata', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const client = new PrinterClient({
    baseUrl: 'http://192.168.4.74:4408',
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes('/printer/objects/query')) {
        await gate;
        return response({ result: { status: { print_stats: { state: 'printing', filename: 'part.gcode', print_duration: 60 }, virtual_sdcard: { progress: .1 } } } });
      }
      return response({ error: 'missing' }, 404);
    }
  });
  const first = client.status();
  const second = client.status();
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  assert.equal(a.online, true);
  assert.equal(a.filename, 'part.gcode');
  assert.equal(calls.filter((url) => url.includes('/printer/objects/query')).length, 1);
  assert.equal(calls.filter((url) => url.includes('/server/files/metadata')).length, 1);
});

test('refreshes printer status after a control action instead of reusing an older poll', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let queryCount = 0;
  const client = new PrinterClient({
    baseUrl: 'http://192.168.4.74:4408',
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method || 'GET' });
      if (url.endsWith('/printer/print/pause')) return response({ result: 'ok' });
      queryCount += 1;
      if (queryCount === 1) await gate;
      return response({ result: { status: { print_stats: { state: queryCount === 1 ? 'printing' : 'paused' } } } });
    }
  });
  const oldPoll = client.status();
  const action = client.action('pause');
  release();
  await oldPoll;
  const updated = await action;
  assert.equal(updated.state, 'paused');
  assert.equal(queryCount, 2);
  assert.equal(calls.some((call) => call.url.endsWith('/printer/print/pause') && call.method === 'POST'), true);
});
