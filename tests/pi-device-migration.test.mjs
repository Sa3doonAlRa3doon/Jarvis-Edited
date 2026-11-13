import assert from 'node:assert/strict';
import test from 'node:test';
import { planPiDeviceMigration } from '../lib/pi-device-migration.mjs';

const cameras = [
  { id: '/dev/v4l/by-id/usb-Lenovo-video-index0', label: 'Lenovo FHD Webcam — stable USB camera' },
  { id: '/dev/v4l/by-id/usb-Integrated-video-index0', label: 'Integrated Camera — stable USB camera' }
];
const microphones = [
  { id: 'alsa:CARD=Audio,DEV=0,NAME=Lenovo_FHD_Webcam_Audio', label: 'Lenovo FHD Webcam Audio — stable ALSA input' }
];

test('migrates legacy main, printer, and microphone selections by physical role', () => {
  const result = planPiDeviceMigration({
    settings: { piCamera: '/dev/video2', printerPiCamera: '/dev/video0', piMicrophone: 'plughw:2,0', wakeWord: true },
    cameras, microphones
  });
  assert.equal(result.next.piCamera, cameras[0].id);
  assert.equal(result.next.printerPiCamera, cameras[1].id);
  assert.equal(result.next.piMicrophone, microphones[0].id);
  assert.equal(result.next.wakeWord, true);
  assert.deepEqual(result.changes.map((item) => item.field), ['piCamera', 'printerPiCamera', 'piMicrophone']);
  assert.deepEqual(result.warnings, []);
});

test('preserves explicit stable selections and never enables an unconfigured printer camera', () => {
  const settings = { piCamera: cameras[0].id, printerPiCamera: '', piMicrophone: microphones[0].id };
  const result = planPiDeviceMigration({ settings, cameras, microphones });
  assert.deepEqual(result.next, settings);
  assert.deepEqual(result.changes, []);
});

test('reports unavailable legacy selections without inventing devices', () => {
  const result = planPiDeviceMigration({
    settings: { piCamera: '/dev/video8', printerPiCamera: '/dev/video9', piMicrophone: 'plughw:9,0' },
    cameras: [], microphones: []
  });
  assert.deepEqual(result.changes, []);
  assert.equal(result.warnings.length, 3);
});
