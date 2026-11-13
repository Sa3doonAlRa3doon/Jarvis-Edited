import assert from 'node:assert/strict';
import test from 'node:test';
import { openJarvisMemoryDetail, openJarvisMemoryLabel } from '../public/openjarvis-status.js';

test('labels ready and unavailable native memory states honestly', () => {
  assert.equal(openJarvisMemoryLabel({ memory: { entries: 7 } }), '7 ITEMS');
  assert.equal(openJarvisMemoryLabel({ memoryStatus: { state: 'cooldown' } }), 'NATIVE RETRY');
  assert.equal(openJarvisMemoryLabel({ memoryStatus: { state: 'unavailable' } }), 'NATIVE OFFLINE');
  assert.equal(openJarvisMemoryLabel({}), 'LOCAL');
});

test('bounds the surfaced native memory error detail', () => {
  const detail = openJarvisMemoryDetail({ memoryStatus: { error: `  HTTP 503\n${'x'.repeat(240)}  ` } });
  assert.ok(detail.startsWith('HTTP 503 '));
  assert.equal(detail.length, 180);
});
