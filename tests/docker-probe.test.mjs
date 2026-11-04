import assert from 'node:assert/strict';
import test from 'node:test';
import { createDockerSummaryProbe } from '../lib/system-probe.mjs';

test('concurrent dashboard and chat callers share one Docker collection', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const read = createDockerSummaryProbe({ run: async (command, args) => {
    calls.push([command, args[0]]);
    if (args[0] === 'version') { await gate; return '28'; }
    if (args[0] === 'ps') return JSON.stringify({ ID: 'abc', Names: 'assistant', State: 'running' });
    if (args[0] === 'stats') return JSON.stringify({ Name: 'assistant', CPUPerc: '2.5%' });
    return JSON.stringify({ Type: 'Images', TotalCount: 4 });
  } });
  const readers = Array.from({ length: 12 }, () => read());
  release();
  const results = await Promise.all(readers);
  assert.equal(calls.length, 4);
  assert.ok(results.every((result) => result.containers[0].cpu === '2.5%' && result.disk[0].TotalCount === 4));
  await read();
  assert.equal(calls.length, 4);
});

test('container metrics refresh frequently while daemon-wide disk scans refresh once per minute', async () => {
  let time = 1000;
  const calls = [];
  const read = createDockerSummaryProbe({ now: () => time, run: async (_command, args) => { calls.push(args[0]); return args[0] === 'version' ? '28' : ''; } });
  const first = await read();
  time += 6000;
  const second = await read();
  assert.equal(calls.filter((item) => item === 'stats').length, 2);
  assert.equal(calls.filter((item) => item === 'system').length, 1);
  assert.equal(first.diskSampledAt, second.diskSampledAt);
  assert.notEqual(first.sampledAt, second.sampledAt);
  time += 60_000;
  const third = await read();
  assert.equal(calls.filter((item) => item === 'system').length, 2);
  assert.notEqual(second.diskSampledAt, third.diskSampledAt);
});

test('Docker outages retry after the bounded sample expires without leaking command errors', async () => {
  let time = 1000;
  let available = false;
  let calls = 0;
  const read = createDockerSummaryProbe({ now: () => time, run: async (_command, args) => {
    calls += 1;
    if (!available) throw new Error('private daemon details');
    return args[0] === 'version' ? '28' : '';
  } });
  const failed = await read();
  assert.equal(failed.available, false);
  assert.ok(!JSON.stringify(failed).includes('private'));
  available = true;
  await read();
  assert.equal(calls, 1);
  time += 5001;
  assert.equal((await read()).available, true);
  assert.equal(calls, 5);
});

test('a failed disk scan preserves current containers and does not reuse expired disk data', async () => {
  let time = 1000;
  let failDisk = false;
  const read = createDockerSummaryProbe({ now: () => time, run: async (_command, args) => {
    if (args[0] === 'version') return '28';
    if (args[0] === 'ps') return JSON.stringify({ ID: 'abc', Names: 'assistant', State: 'running' });
    if (args[0] === 'system') {
      if (failDisk) throw new Error('disk unavailable');
      return JSON.stringify({ Type: 'Images', TotalCount: 4 });
    }
    return '';
  } });
  assert.equal((await read()).disk.length, 1);
  time += 60_001;
  failDisk = true;
  const failed = await read();
  assert.equal(failed.containers.length, 1);
  assert.deepEqual(failed.disk, []);
  assert.equal(failed.diskSampledAt, null);
  assert.equal(failed.error, 'Docker disk statistics unavailable');
});

test('a failed container listing is reported as unavailable instead of an empty healthy engine', async () => {
  const read = createDockerSummaryProbe({ run: async (_command, args) => {
    if (args[0] === 'ps') throw new Error('private daemon error');
    return args[0] === 'version' ? '28' : '';
  } });
  const snapshot = await read();
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.error, 'Docker container list unavailable');
  assert.ok(!JSON.stringify(snapshot).includes('private'));
});
