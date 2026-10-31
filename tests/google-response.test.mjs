import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGoogleResult, summarizeGoogleTool } from '../lib/google-response.mjs';

test('formats bounded Gmail results without exposing connector credentials', () => {
  const text = summarizeGoogleResult({ service: 'gmail', query: 'newer_than:14d', messages: [{ subject: 'Status', from: 'Team <team@example.test>', date: '2026-10-30T08:00:00Z', snippet: 'Project update' }] });
  assert.match(text, /Status/);
  assert.match(text, /Project update/);
  assert.doesNotMatch(text, /Bearer|refresh|client_secret|api[_ -]?key/i);
});

test('returns an immediate safe Google failure message', () => {
  const text = summarizeGoogleTool({ used: true, context: '\nGoogle tool status: unavailable for this request. Exact error: Google OAuth client was deleted or disabled. Explain this honestly and do not invent Google data.' });
  assert.match(text, /couldn't read Google/i);
  assert.match(text, /deleted or disabled/i);
  assert.match(text, /No Google data was changed/);
});

test('handles empty calendar results as a normal read-only response', () => {
  assert.match(summarizeGoogleResult({ service: 'calendar', events: [] }), /no upcoming events/i);
});
