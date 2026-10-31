import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePublicResult } from '../lib/public-response.mjs';

test('formats a location-free weather result without model synthesis', () => {
  const text = summarizePublicResult({ used: true, service: 'weather', result: { location: { name: 'Dubai' }, current: { temperatureC: 31, feelsLikeC: 33, humidityPercent: 40, windKph: 12, condition: 'clear sky' }, daily: [] } });
  assert.match(text, /Weather for Dubai/);
  assert.match(text, /31°C/);
});

test('formats keyless GitHub research as bounded text', () => {
  const text = summarizePublicResult({ used: true, service: 'github', query: 'voice assistant', result: { repositories: [{ fullName: 'example/assistant', stars: 42, description: 'Local assistant' }] } });
  assert.match(text, /example\/assistant/);
  assert.match(text, /42 stars/);
});

test('returns an immediate public-provider failure message', () => {
  const text = summarizePublicResult({ used: true, service: 'weather', context: 'Public service weather is currently unavailable: timeout' });
  assert.match(text, /couldn't get weather/i);
  assert.match(text, /timeout/);
});
