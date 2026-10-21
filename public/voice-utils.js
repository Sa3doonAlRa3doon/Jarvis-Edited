export const DEFAULT_WAKE_PHRASES = ['hey jarvis', 'jarvis'];

const WAKE_VARIANTS = new Map([
  ['jarves', 'jarvis'], ['jervis', 'jarvis'], ['jarviss', 'jarvis'], ['jarvises', 'jarvis'],
  ['hey jarves', 'hey jarvis'], ['hey jervis', 'hey jarvis'], ['hay jarvis', 'hey jarvis']
]);

export function normalizeTranscript(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeWakePhrases(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const phrases = source.map(normalizeTranscript).filter(Boolean).slice(0, 8);
  return [...new Set(phrases.length ? phrases : DEFAULT_WAKE_PHRASES)];
}

export function editDistance(left, right) {
  const a = normalizeTranscript(left); const b = normalizeTranscript(right);
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export function similarity(left, right) {
  const a = normalizeTranscript(left); const b = normalizeTranscript(right);
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - editDistance(a, b) / longest : 1;
}

function canonicalWake(value) {
  const normalized = normalizeTranscript(value);
  return WAKE_VARIANTS.get(normalized) || normalized;
}

export function findWakePhrase(transcript, phrases = DEFAULT_WAKE_PHRASES, sensitivity = 0.55) {
  const normalized = normalizeTranscript(transcript);
  const tokens = normalized.split(' ').filter(Boolean);
  const requiredScore = Math.min(0.94, Math.max(0.8, 0.78 + Number(sensitivity || 0.55) * 0.18));
  let best = { detected: false, score: 0, phrase: '', command: '', start: -1, end: -1 };

  for (const phrase of normalizeWakePhrases(phrases)) {
    const phraseTokens = phrase.split(' ');
    for (let length = Math.max(1, phraseTokens.length - 1); length <= phraseTokens.length + 1; length += 1) {
      for (let start = 0; start + length <= tokens.length; start += 1) {
        const rawCandidate = tokens.slice(start, start + length).join(' ');
        const candidate = canonicalWake(rawCandidate);
        const canonicalPhrase = canonicalWake(phrase);
        const candidateName = candidate.split(' ').at(-1) || '';
        const phraseName = canonicalPhrase.split(' ').at(-1) || '';
        const safeInitial = candidateName[0] === phraseName[0];
        const score = candidate === canonicalPhrase ? 1 : safeInitial ? similarity(candidate, canonicalPhrase) : 0;
        if (score > best.score) {
          best = { detected: score >= requiredScore, score, phrase, command: tokens.slice(start + length).join(' '), start, end: start + length };
        }
      }
    }
  }
  return best;
}

export function selectRecognitionAlternative(alternatives, {
  wakePhrases = DEFAULT_WAKE_PHRASES,
  wakeSensitivity = 0.55,
  recognitionConfidence = 0.35,
  preferWake = false
} = {}) {
  const candidates = [...(alternatives || [])].map((item) => {
    const transcript = String(item?.transcript || '').trim();
    const rawConfidence = Number(item?.confidence);
    const confidenceKnown = Number.isFinite(rawConfidence) && rawConfidence > 0;
    const confidence = confidenceKnown ? Math.max(0, Math.min(1, rawConfidence)) : 0.55;
    const wake = findWakePhrase(transcript, wakePhrases, wakeSensitivity);
    const score = confidence * (preferWake ? 0.55 : 0.88) + wake.score * (preferWake ? 0.45 : 0.12);
    return { transcript, confidence, confidenceKnown, wake, score };
  }).filter((item) => item.transcript);
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0] || { transcript: '', confidence: 0, confidenceKnown: false, wake: findWakePhrase('', wakePhrases, wakeSensitivity), score: 0 };
  return { ...best, accepted: Boolean(best.transcript) && (!best.confidenceKnown || best.confidence >= Number(recognitionConfidence || 0)) };
}

export function isDuplicateCommand(command, previousCommand, elapsedMs, windowMs = 3500) {
  if (elapsedMs > windowMs) return false;
  const current = normalizeTranscript(command); const previous = normalizeTranscript(previousCommand);
  return Boolean(current && previous && (current === previous || similarity(current, previous) >= 0.96));
}
