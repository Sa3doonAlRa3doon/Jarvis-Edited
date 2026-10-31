const STYLES = Object.freeze({
  jarvis: {
    label: 'JARVIS PROFESSIONAL',
    instruction: 'Use a calm, capable, respectful JARVIS voice. Be confident without being theatrical, and never invent certainty.'
  },
  warm: {
    label: 'WARM ASSISTANT',
    instruction: 'Use a warm, encouraging voice. Stay practical and respectful, and avoid filler or exaggerated praise.'
  },
  technical: {
    label: 'TECHNICAL OPERATOR',
    instruction: 'Use precise technical language. Prefer concrete values, assumptions, boundaries, and next actions over conversational padding.'
  },
  focused: {
    label: 'FOCUSED COMMAND',
    instruction: 'Use short operational sentences. Lead with the result, then include only the evidence or action needed to proceed.'
  }
});

const LENGTHS = Object.freeze({
  short: 'Keep the answer to one or two compact sentences unless the user asks for detail.',
  normal: 'Give a concise answer with the important evidence and the next useful step.',
  detailed: 'Give a structured, thorough answer, but do not repeat yourself or fabricate missing evidence.'
});

export function normalizeResponseStyle(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.hasOwn(STYLES, key) ? key : 'jarvis';
}

export function normalizeResponseLength(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.hasOwn(LENGTHS, key) ? key : 'normal';
}

export function responseStyleInstruction(style, length) {
  const normalizedStyle = normalizeResponseStyle(style);
  const normalizedLength = normalizeResponseLength(length);
  return `${STYLES[normalizedStyle].instruction} ${LENGTHS[normalizedLength]}`;
}

export function responseStyleCatalog() {
  return Object.entries(STYLES).map(([value, item]) => ({ value, label: item.label }));
}

