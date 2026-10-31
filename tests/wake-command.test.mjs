import test from 'node:test';
import assert from 'node:assert/strict';
import { hasWakeCommand, MAX_WAKE_COMMAND_LENGTH, normalizeWakeCommand } from '../public/wake-command.js';

test('normalizes a verified local wake command without changing its words', () => {
  assert.equal(normalizeWakeCommand('  what\n is   the printer status?  '), 'what is the printer status?');
});

test('rejects empty wake payloads so wake-only events still open capture', () => {
  assert.equal(hasWakeCommand('   '), false);
  assert.equal(hasWakeCommand(null), false);
  assert.equal(hasWakeCommand('weather in Dubai'), true);
});

test('bounds wake commands before they enter the dashboard router', () => {
  const value = normalizeWakeCommand('x'.repeat(MAX_WAKE_COMMAND_LENGTH + 80));
  assert.equal(value.length, MAX_WAKE_COMMAND_LENGTH);
});
