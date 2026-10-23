import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText, searchCatalog } from '../public/search-utils.js';

const catalog = [
  { id: 'docker', label: 'Docker Matrix', detail: 'Inspect live containers', keywords: 'compose services', priority: 40 },
  { id: 'settings', label: 'Voice Core Settings', detail: 'Microphone and speech controls', keywords: 'wake talkback', priority: 30 },
  { id: 'printer', label: 'Fabricator', detail: '3D printer status and ETA', keywords: 'moonraker klipper print', priority: 20 }
];

test('ranks an exact label ahead of keyword matches', () => {
  const results = searchCatalog(catalog, 'Docker Matrix');
  assert.equal(results[0].id, 'docker');
});

test('finds synonyms and tolerates a small typing mistake', () => {
  assert.equal(searchCatalog(catalog, 'compose')[0].id, 'docker');
  assert.equal(searchCatalog(catalog, 'dockr')[0].id, 'docker');
});

test('preserves multilingual letters while normalizing search text', () => {
  assert.equal(normalizeSearchText('  يا جارفيس!  '), 'يا جارفيس');
});

test('returns high-priority quick actions for an empty query', () => {
  const results = searchCatalog(catalog, '', { limit: 2 });
  assert.deepEqual(results.map((item) => item.id), ['docker', 'settings']);
});
