import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EmailDraftStore, createGmailRawMessage, fallbackEmailDraft, isEmailDraftPrompt,
  outboundCommunicationKind, parseModelEmailDraft, validateEmailFields
} from '../lib/email-drafts.mjs';

test('recognizes compose requests without confusing inbox reads', () => {
  assert.equal(isEmailDraftPrompt('Draft an email to friend@example.com saying hello'), true);
  assert.equal(outboundCommunicationKind('message John saying hi'), 'unsupported');
  assert.equal(isEmailDraftPrompt('email John saying I am late'), true);
  assert.equal(outboundCommunicationKind('use the browser to send John a note'), 'unsupported');
  assert.equal(isEmailDraftPrompt('reply to the latest email'), true);
  assert.equal(isEmailDraftPrompt('forward that email to John'), true);
  assert.equal(outboundCommunicationKind('go to Gmail and tell John hello'), 'email');
  assert.equal(outboundCommunicationKind('contact John through Gmail and say hello'), 'email');
  assert.equal(outboundCommunicationKind('open Gmail and write John hello'), 'email');
  assert.equal(outboundCommunicationKind('send John hello on Gmail'), 'email');
  assert.equal(outboundCommunicationKind('write to John on Gmail'), 'email');
  assert.equal(outboundCommunicationKind('send it'), 'unsupported');
  assert.equal(outboundCommunicationKind('submit the form'), 'unsupported');
  assert.equal(outboundCommunicationKind('post a comment on Reddit'), 'unsupported');
  assert.equal(outboundCommunicationKind('DM John hello'), 'unsupported');
  assert.equal(outboundCommunicationKind('say hello to John on Discord'), 'unsupported');
  assert.equal(outboundCommunicationKind('type hello into the contact form and press the button'), 'unsupported');
  assert.equal(isEmailDraftPrompt('Show my latest Gmail emails'), false);
  assert.equal(outboundCommunicationKind('Tell me about my latest Gmail emails'), null);
});

test('keeps the user supplied recipient while accepting model subject and body', () => {
  const draft = parseModelEmailDraft('{"to":"attacker@example.net","subject":"Update","body":"All done."}', 'Write an email to owner@example.com about the update');
  assert.deepEqual(draft, { to: 'owner@example.com', subject: 'Update', body: 'All done.' });
});

test('falls back to deterministic subject and body parsing', () => {
  const draft = fallbackEmailDraft('Send an email to person@example.com subject: Meeting and message: See you at five.');
  assert.equal(draft.to, 'person@example.com');
  assert.match(draft.subject, /Meeting/i);
  assert.match(draft.body, /See you at five/i);
});

test('rejects recipient and subject header injection', () => {
  assert.throws(() => validateEmailFields({ to: 'ok@example.com\r\nBcc: bad@example.com', subject: 'Hi', body: 'Body' }), /valid recipient/);
  assert.throws(() => validateEmailFields({ to: 'ok@example.com', subject: 'Hi\r\nBcc: bad@example.com', body: 'Body' }), /line breaks/);
});

test('builds a base64url Gmail MIME message with exact visible content', () => {
  const raw = createGmailRawMessage({ to: 'friend@example.com', subject: 'Hello ✓', body: 'Exact body\nSecond line' });
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /^To: friend@example\.com\r\n/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  const encodedBody = mime.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(Buffer.from(encodedBody, 'base64').toString('utf8'), 'Exact body\nSecond line');
});

test('draft approval tokens are one-time and expire', () => {
  let now = 1_000;
  const store = new EmailDraftStore({ ttlMs: 500, now: () => now });
  const first = store.create({ to: 'friend@example.com', subject: 'Hi', body: 'Body' });
  assert.equal(store.claim(first.id).to, 'friend@example.com');
  assert.throws(() => store.claim(first.id), /expired or was already used/);
  const second = store.create({ to: 'friend@example.com', subject: 'Hi', body: 'Body' });
  now += 501;
  assert.throws(() => store.claim(second.id), /expired or was already used/);
});
