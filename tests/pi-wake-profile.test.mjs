import test from 'node:test';
import assert from 'node:assert/strict';
import { piWakeEnergyFloor, piWakeListenerEnabled } from '../lib/pi-wake-profile.mjs';

test('treats the Pi listener as intentionally disabled on non-Linux hosts', () => {
  assert.equal(piWakeListenerEnabled('win32', 'true'), false);
  assert.equal(piWakeListenerEnabled('darwin', undefined), false);
});

test('honors an explicit listener disable without making backend health appear degraded', () => {
  assert.equal(piWakeListenerEnabled('linux', 'false'), false);
  assert.equal(piWakeListenerEnabled('linux', '0'), false);
  assert.equal(piWakeListenerEnabled('linux', 'off'), false);
});

test('enables the Pi listener by default and accepts standard true values', () => {
  assert.equal(piWakeListenerEnabled('linux', undefined), true);
  assert.equal(piWakeListenerEnabled('linux', ''), true);
  assert.equal(piWakeListenerEnabled('linux', 'yes'), true);
  assert.equal(piWakeListenerEnabled('linux', '1'), true);
});

test('keeps the Pi wake energy floor at its configured baseline for default sensitivity', () => {
  assert.equal(piWakeEnergyFloor(0.28, 0.0035), 0.0035);
});

test('lower mic sensitivity thresholds make the Pi wake gate more sensitive', () => {
  assert.ok(piWakeEnergyFloor(0.01, 0.0035) < piWakeEnergyFloor(0.28, 0.0035));
  assert.ok(piWakeEnergyFloor(0.8, 0.0035) > piWakeEnergyFloor(0.28, 0.0035));
});

test('preserves a custom Pi energy floor as the slider adjustment anchor', () => {
  assert.equal(piWakeEnergyFloor(0.28, 0.01), 0.01);
  assert.ok(piWakeEnergyFloor(0.01, 0.01) < 0.01);
});

test('bounds invalid and extreme Pi wake profile values', () => {
  assert.equal(piWakeEnergyFloor(Number.NaN, Number.NaN), 0.0035);
  assert.equal(piWakeEnergyFloor(-10, 0), 0.0005);
  assert.equal(piWakeEnergyFloor(10, 1), 0.05);
});
