import assert from 'node:assert/strict';
import test from 'node:test';
import { isLinuxCameraCaptureName } from '../lib/system-probe.mjs';

test('keeps physical camera nodes and filters Pi ISP and codec endpoints', () => {
  assert.equal(isLinuxCameraCaptureName('Integrated Camera: Integrated C'), true);
  assert.equal(isLinuxCameraCaptureName('Lenovo FHD Webcam Audio: Lenovo'), true);
  assert.equal(isLinuxCameraCaptureName('pispbe-output'), false);
  assert.equal(isLinuxCameraCaptureName('rpi-hevc-dec'), false);
  assert.equal(isLinuxCameraCaptureName('rpivid'), false);
  assert.equal(isLinuxCameraCaptureName(''), false);
});
