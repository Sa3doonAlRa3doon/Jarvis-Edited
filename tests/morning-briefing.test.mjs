import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMorningBriefing, isMorningBriefingPrompt } from '../lib/morning-briefing.mjs';

test('recognizes explicit morning and daily briefing requests without hijacking ordinary updates', () => {
  assert.equal(isMorningBriefingPrompt('Give me a morning briefing'), true);
  assert.equal(isMorningBriefingPrompt('start my daily digest'), true);
  assert.equal(isMorningBriefingPrompt('Good morning'), true);
  assert.equal(isMorningBriefingPrompt('start my day'), true);
  assert.equal(isMorningBriefingPrompt('What is the weather update?'), false);
  assert.equal(isMorningBriefingPrompt('show Docker status'), false);
});

test('builds a bounded read-only briefing with available and unavailable sections', () => {
  const report = buildMorningBriefing({
    location: 'Dubai',
    metrics: { cpu: { percent: 12.4 }, memory: { percent: 44.9 } },
    services: { ollama: { online: true }, openjarvis: { online: true } },
    weather: { result: { location: { name: 'Dubai' }, current: { temperatureC: 29, condition: 'clear sky', humidityPercent: 48 } }, citations: ['https://weather.example.test'] },
    news: { query: 'technology', results: [{ title: 'Bounded headline', url: 'https://news.example.test/item' }], citations: ['https://news.example.test/item'] },
    calendar: null,
    docker: { containers: [{ state: 'running' }, { state: 'exited' }] },
    printer: { configured: true, online: true, state: 'printing', progress: 0.25, remaining: 3661, filename: 'test.gcode' }
  });
  assert.match(report.content, /Good morning/);
  assert.match(report.content, /CPU 12%/);
  assert.match(report.content, /Weather in Dubai/);
  assert.match(report.content, /Calendar: Google Calendar is not currently connected/);
  assert.match(report.content, /Printer: printing, 25%, ETA 1h 01m/);
  assert.equal(report.sections.length, 6);
  assert.deepEqual(report.citations, ['https://weather.example.test', 'https://news.example.test/item']);
});

test('includes only a bounded upcoming calendar agenda when Google is connected', () => {
  const report = buildMorningBriefing({
    calendar: {
      result: {
        events: [
          { title: 'Design review', start: '2026-10-30T09:00:00+04:00', url: 'https://www.google.com/calendar/event?eid=abc_123' },
          { title: 'Focus block', start: '2026-10-31', url: '' },
          { title: 'Third event', start: '2026-11-01T11:00:00Z', url: '' },
          { title: 'Fourth event', start: '2026-11-02T11:00:00Z', url: '' }
        ]
      },
      citations: ['https://www.google.com/calendar/event?eid=abc_123']
    }
  });
  assert.match(report.content, /Calendar: 4 upcoming events\./);
  assert.match(report.content, /Design review/);
  assert.match(report.content, /Focus block/);
  assert.match(report.content, /Third event/);
  assert.doesNotMatch(report.content, /Fourth event/);
  assert.deepEqual(report.citations, ['https://www.google.com/calendar/event?eid=abc_123']);
});

