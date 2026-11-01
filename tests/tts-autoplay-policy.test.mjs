import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresBrowserTtsGesture } from '../public/tts-autoplay-policy.js';

test('browser TTS waits for a gesture by default on an unactivated page', () => {
  assert.equal(requiresBrowserTtsGesture({ userActivationAvailable: true, hasBeenActive: false, allowAutoplay: false }), true);
});

test('Pi kiosk configuration permits the browser TTS attempt before a gesture', () => {
  assert.equal(requiresBrowserTtsGesture({ userActivationAvailable: true, hasBeenActive: false, allowAutoplay: true }), false);
});

test('active pages and browsers without user activation support retain existing behavior', () => {
  assert.equal(requiresBrowserTtsGesture({ userActivationAvailable: true, hasBeenActive: true, allowAutoplay: false }), false);
  assert.equal(requiresBrowserTtsGesture({ userActivationAvailable: false, hasBeenActive: false, allowAutoplay: false }), false);
});
