import assert from 'node:assert/strict';
import test from 'node:test';
import { isLinuxMicrophoneDeviceId, normalizeAlsaIdentity, parseAlsaCaptureDevices, stableLinuxMicrophoneId } from '../lib/system-probe.mjs';

test('builds a bounded stable ALSA microphone identity', () => {
  assert.equal(normalizeAlsaIdentity('Lenovo FHD Webcam Audio'), 'Lenovo_FHD_Webcam_Audio');
  assert.equal(
    stableLinuxMicrophoneId('Audio', 0, 'Lenovo FHD Webcam Audio'),
    'alsa:CARD=Audio,DEV=0,NAME=Lenovo_FHD_Webcam_Audio'
  );
  assert.equal(stableLinuxMicrophoneId('', 0, 'Lenovo'), '');
  assert.equal(stableLinuxMicrophoneId('Audio', 999, 'Lenovo'), '');
});

test('accepts stable and legacy microphones but rejects command-shaped input', () => {
  assert.equal(isLinuxMicrophoneDeviceId('alsa:CARD=Audio,DEV=0,NAME=Lenovo_FHD_Webcam_Audio'), true);
  assert.equal(isLinuxMicrophoneDeviceId('plughw:2,0'), true);
  assert.equal(isLinuxMicrophoneDeviceId('alsa:CARD=Audio;rm,DEV=0,NAME=Lenovo'), false);
  assert.equal(isLinuxMicrophoneDeviceId('default'), false);
});

test('parses the Pi arecord listing into a stable identity with a legacy alias', () => {
  const devices = parseAlsaCaptureDevices('card 2: Audio [Lenovo FHD Webcam Audio], device 0: USB Audio [USB Audio]');
  assert.deepEqual(devices, [{
    id: 'alsa:CARD=Audio,DEV=0,NAME=Lenovo_FHD_Webcam_Audio',
    legacyIds: ['plughw:2,0'],
    label: 'Lenovo FHD Webcam Audio / device 0 — stable ALSA input (USB Audio [USB Audio])'
  }]);
});
