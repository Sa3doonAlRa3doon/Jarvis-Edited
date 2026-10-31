import crypto from 'node:crypto';

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const EMAIL_IN_TEXT = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/ig;

function cleanText(value, limit) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, limit);
}

export function emailsFromPrompt(prompt) {
  return [...new Set(String(prompt || '').match(EMAIL_IN_TEXT) || [])];
}

export function outboundCommunicationKind(prompt) {
  const text = cleanText(prompt, 6000);
  if (!text) return null;
  const emailChannel = EMAIL_IN_TEXT.test(text) || /\b(?:e-?mail|gmail|outlook|mailbox|inbox)\b/i.test(text);
  const socialChannel = /\b(?:discord|slack|reddit|instagram|facebook|twitter|x\.com|whatsapp|telegram|contact\s+form|web\s*form)\b/i.test(text);
  EMAIL_IN_TEXT.lastIndex = 0;
  // “Answer the question” and “respond with a summary” are ordinary assistant
  // prompts. Treat answer/reply/respond as outbound only when the prompt also
  // names a channel or recipient context; otherwise the chat lane must answer.
  const namedRecipientContext = /\b(?:to|on|via|through|using)\s+(?:(?:my|the)\s+)?(?:[A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30})*|them|him|her|mom|dad|friend|boss)\b/.test(text);
  const responseAction = /\b(?:answer|reply|respond)\b/i.test(text)
    && (emailChannel || socialChannel || namedRecipientContext);
  const explicitAction = /\b(?:send|deliver|contact|notify|message|dm|forward|post|publish|comment|submit)\b/i.test(text)
    || responseAction
    || /\btell\s+(?!me\b|us\b)/i.test(text)
    || /\bsay\b[\s\S]{0,80}\bto\b[\s\S]{0,80}\b(?:on|via|through)\b/i.test(text)
    || /\btype\b[\s\S]{0,120}\b(?:into|in)\b[\s\S]{0,80}\b(?:form|message|comment|post|chat|field)\b/i.test(text)
    || /\bpress\b[\s\S]{0,50}\b(?:send|submit|publish|post|reply|button)\b/i.test(text)
    || /(?:^|\b(?:then|and|please)\s+)(?:e-?mail|mail)\s+(?!me\b|us\b)/i.test(text)
    || /\b(?:can|could|would|will)\s+you\s+(?:e-?mail|mail)\s+(?!me\b|us\b)/i.test(text)
    || /\bwrite\b[\s\S]{0,80}\b(?:to|on|via|through|e-?mail|mail|message|note|gmail|outlook)\b/i.test(text)
    || /\b(?:draft|compose|prepare|create)\b[\s\S]{0,80}\b(?:e-?mail|mail|message|note)\b/i.test(text);
  const imperativeContinuation = /^\s*(?:send|deliver|submit|publish|post|reply|respond|forward|message|email|mail)(?:\s+(?:it|that|this|now|please|them|him|her))*[.!]?\s*$/i.test(text);
  const browserOutbound = /\b(?:go\s+to|open|use)\b[\s\S]{0,80}\b(?:gmail|outlook|e-?mail|mail|website|browser|reddit|discord|slack|form)\b[\s\S]{0,120}\b(?:send|deliver|tell|contact|notify|write|answer|reply|respond|forward|post|publish|comment|submit|message)\b/i.test(text);
  if (!(explicitAction || imperativeContinuation || browserOutbound)) return null;
  return emailChannel ? 'email' : 'unsupported';
}

export function isEmailDraftPrompt(prompt) {
  return outboundCommunicationKind(prompt) === 'email';
}

export function validateEmailFields(input = {}) {
  const to = cleanText(input.to, 320);
  const subject = cleanText(input.subject, 320);
  const body = cleanText(input.body, 12_000);
  if (!to || /[\r\n]/.test(to) || !EMAIL_PATTERN.test(to)) throw new Error('Enter one valid recipient email address.');
  if (!subject) throw new Error('Email subject is required.');
  if (/[\r\n]/.test(subject)) throw new Error('Email subject cannot contain line breaks.');
  if (!body) throw new Error('Email body is required.');
  return { to, subject, body };
}

export function fallbackEmailDraft(prompt) {
  const text = cleanText(prompt, 12_000);
  const to = emailsFromPrompt(text)[0] || '';
  const subjectMatch = text.match(/\bsubject\s*(?::|is)?\s*["“]?([^\n"”]+?)["”]?(?=\s+(?:and\s+)?(?:body|message|saying|say|telling)\b|$)/i);
  const bodyMatch = text.match(/\b(?:body|message|saying|say|telling\s+(?:them|him|her))\s*(?::|is|that)?\s*([\s\S]+)$/i);
  const subject = cleanText(subjectMatch?.[1] || 'Message from JARVIS', 320);
  let body = cleanText(bodyMatch?.[1] || '', 12_000);
  if (!body) {
    body = cleanText(text
      .replace(EMAIL_IN_TEXT, ' ')
      .replace(/\b(?:please|draft|compose|write|prepare|create|send|an?|email|mail|message|to|for)\b/gi, ' ')
      .replace(/\s+/g, ' '), 12_000);
  }
  return { to, subject, body };
}

export function parseModelEmailDraft(value, prompt) {
  const recipient = emailsFromPrompt(prompt)[0] || '';
  let parsed = null;
  if (value && typeof value === 'object') parsed = value;
  else {
    const raw = String(value || '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch {}
    }
  }
  const fallback = fallbackEmailDraft(prompt);
  return validateEmailFields({
    to: recipient,
    subject: parsed?.subject || fallback.subject,
    body: parsed?.body || fallback.body
  });
}

function foldBase64(value) {
  return value.match(/.{1,76}/g)?.join('\r\n') || '';
}

export function createGmailRawMessage(input) {
  const draft = validateEmailFields(input);
  const encodedSubject = Buffer.from(draft.subject, 'utf8').toString('base64');
  const encodedBody = foldBase64(Buffer.from(draft.body, 'utf8').toString('base64'));
  const mime = [
    `To: ${draft.to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

export class EmailDraftStore {
  constructor({ ttlMs = 15 * 60_000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.drafts = new Map();
  }

  prune() {
    const now = this.now();
    for (const [id, draft] of this.drafts) if (draft.expiresAtMs <= now || draft.claimed) this.drafts.delete(id);
  }

  create(input) {
    this.prune();
    const fields = validateEmailFields(input);
    const id = crypto.randomUUID();
    const expiresAtMs = this.now() + this.ttlMs;
    const draft = { id, ...fields, expiresAt: new Date(expiresAtMs).toISOString(), expiresAtMs, claimed: false };
    this.drafts.set(id, draft);
    return { id, ...fields, expiresAt: draft.expiresAt };
  }

  claim(id) {
    this.prune();
    const draft = this.drafts.get(String(id || ''));
    if (!draft || draft.claimed || draft.expiresAtMs <= this.now()) throw new Error('This email draft expired or was already used. Create a new draft.');
    draft.claimed = true;
    this.drafts.delete(draft.id);
    return { id: draft.id, to: draft.to, subject: draft.subject, body: draft.body, expiresAt: draft.expiresAt };
  }
}
