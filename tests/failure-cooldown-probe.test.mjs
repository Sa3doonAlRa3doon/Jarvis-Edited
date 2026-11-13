import assert from 'node:assert/strict';
import test from 'node:test';
import { createFailureCooldownProbe } from '../lib/failure-cooldown-probe.mjs';

test('backs off repeated failed probes without hiding the failure', async () => {
  let clock = 1_000;
  let attempts = 0;
  const probe = createFailureCooldownProbe({
    now: () => clock,
    cooldownMs: 5_000,
    load: async () => { attempts += 1; throw new Error('HTTP 503'); }
  });

  const first = await probe.probe();
  assert.equal(first.state, 'unavailable');
  assert.equal(first.error, 'HTTP 503');
  assert.equal(first.nextAttemptAt, 6_000);
  assert.equal(attempts, 1);

  clock = 2_000;
  const skipped = await probe.probe();
  assert.equal(skipped.state, 'cooldown');
  assert.equal(skipped.error, 'HTTP 503');
  assert.equal(skipped.skipped, true);
  assert.equal(attempts, 1);

  clock = 6_000;
  await probe.probe();
  assert.equal(attempts, 2);
});

test('successful probes clear the failure cooldown', async () => {
  let clock = 10_000;
  let fail = true;
  const probe = createFailureCooldownProbe({
    now: () => clock,
    cooldownMs: 2_000,
    load: async () => {
      if (fail) throw new Error('temporary failure');
      return { entries: 4 };
    }
  });

  await probe.probe();
  fail = false;
  clock = 12_000;
  const recovered = await probe.probe();
  assert.equal(recovered.state, 'ready');
  assert.deepEqual(recovered.value, { entries: 4 });
  assert.equal(recovered.error, null);
  assert.equal(recovered.nextAttemptAt, 0);
});

test('deduplicates concurrent probe attempts', async () => {
  let attempts = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const probe = createFailureCooldownProbe({
    now: () => 50_000,
    load: async () => { attempts += 1; await pending; return { entries: 2 }; }
  });

  const first = probe.probe();
  const second = probe.probe();
  await Promise.resolve();
  assert.equal(attempts, 1);
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left.value, { entries: 2 });
  assert.deepEqual(right.value, { entries: 2 });
  assert.equal(attempts, 1);
});
