import assert from 'node:assert/strict';
import test from 'node:test';
import { isLinuxCameraCaptureName, isLinuxCameraDeviceId, isStableLinuxCameraLinkName } from '../lib/system-probe.mjs';

test('keeps physical camera nodes and filters Pi ISP and codec endpoints', () => {
  assert.equal(isLinuxCameraCaptureName('Integrated Camera: Integrated C'), true);
  assert.equal(isLinuxCameraCaptureName('Lenovo FHD Webcam Audio: Lenovo'), true);
  assert.equal(isLinuxCameraCaptureName('pispbe-output'), false);
  assert.equal(isLinuxCameraCaptureName('rpi-hevc-dec'), false);
  assert.equal(isLinuxCameraCaptureName('rpivid'), false);
  assert.equal(isLinuxCameraCaptureName(''), false);
});

test('accepts only stable index-zero USB links or bounded legacy video nodes', () => {
  assert.equal(isStableLinuxCameraLinkName('usb-Sonix_Technology_Co.__Ltd._Lenovo_FHD_Webcam_Audio_SN0001-video-index0'), true);
  assert.equal(isStableLinuxCameraLinkName('usb-camera-video-index1'), false);
  assert.equal(isLinuxCameraDeviceId('/dev/v4l/by-id/usb-Sonix_Technology_Co.__Ltd._Lenovo_FHD_Webcam_Audio_SN0001-video-index0'), true);
  assert.equal(isLinuxCameraDeviceId('/dev/video2'), true);
  assert.equal(isLinuxCameraDeviceId('/dev/v4l/by-id/../../etc/passwd'), false);
  assert.equal(isLinuxCameraDeviceId('/tmp/video2'), false);
});
