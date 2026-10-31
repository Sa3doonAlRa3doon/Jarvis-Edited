import assert from 'node:assert/strict';
import test from 'node:test';
import { localStatusIntent, localStatusRoute, summarizeLocalStatus } from '../lib/local-response.mjs';

test('routes single-domain read-only status requests to the fast local lane', () => {
  assert.equal(localStatusIntent('What is my 3D printer status?'), 'printer');
  assert.equal(localStatusIntent('How many Docker containers are running?'), 'docker');
  assert.equal(localStatusIntent('Show my CPU, RAM, disk, and service health.'), 'host');
  assert.equal(localStatusRoute('printer'), 'FABRICATOR');
});

test('does not swallow mutations or cross-domain requests', () => {
  assert.equal(localStatusIntent('Stop the printer'), null);
  assert.equal(localStatusIntent('Check the printer and weather in Dubai'), null);
  assert.equal(localStatusIntent('Open Gmail and show my CPU'), null);
});

test('summarizes offline and local status without secrets or fabricated metrics', () => {
  assert.match(summarizeLocalStatus('printer', { printer: { online: false } }), /offline/i);
  assert.match(summarizeLocalStatus('docker', { docker: { available: false, containers: [] } }), /unavailable/i);
  const summary = summarizeLocalStatus('host', { metrics: { cpu: { percent: 17 }, memory: { percent: 43 }, disk: { percent: 61 }, gpu: { available: false }, temperature: 42.5 }, services: { ollama: { online: true } } });
  assert.match(summary, /CPU 17%/);
  assert.match(summary, /RAM 43%/);
  assert.match(summary, /services 1\/1 online/);
  assert.match(summary, /temperature 42\.5°C/);
  assert.doesNotMatch(summary, /token|password|secret|device id/i);
});

