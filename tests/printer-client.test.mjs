import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMoonrakerStatus } from '../lib/printer-client.mjs';

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
