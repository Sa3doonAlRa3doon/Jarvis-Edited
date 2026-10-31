import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReadOnlyFallback } from '../lib/read-only-fallback.mjs';

test('formats mixed read-only evidence without inventing unavailable Google data', () => {
  const content = buildReadOnlyFallback({
    prompt: 'Check printer, weather, and Gmail',
    assignments: [
      { label: '3D FABRICATOR', agent: 'FABRICATOR', model: 'printer-local' },
      { label: 'PUBLIC DATA', agent: 'PROSPECTOR', model: 'research-local' },
      { label: 'GOOGLE WORKSPACE', agent: 'LINK', model: 'jarvis-local' }
    ],
    dataBlocks: [
      { source: 'local-printer-readonly', value: { online: true, state: 'printing', progress: 0.42, remaining: 1800, filename: 'part.gcode' } },
      { source: 'public-api-weather-untrusted', value: { service: 'weather', location: { name: 'Dubai' }, current: { temperatureC: 31, feelsLikeC: 33, humidityPercent: 50, windKph: 12, condition: 'clear sky' }, daily: [] } },
      { source: 'google-gmail-untrusted', value: { unavailable: true, error: 'Google OAuth client was deleted or disabled.' } }
    ]
  });
  assert.match(content, /deterministic|timed out/i);
  assert.match(content, /3D FABRICATOR/);
  assert.match(content, /Dubai/);
  assert.match(content, /Google/i);
  assert.match(content, /deleted or disabled/);
  assert.doesNotMatch(content, /message subject|invented/i);
});

test('states when no explicit evidence exists', () => {
  const content = buildReadOnlyFallback({ prompt: 'Tell me something' });
  assert.match(content, /No tool evidence was available/);
});

