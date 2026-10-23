function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function editDistanceWithin(left, right, limit) {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
      rowMinimum = Math.min(rowMinimum, current[column]);
    }
    if (rowMinimum > limit) return false;
    previous = current;
  }
  return previous[right.length] <= limit;
}

function fuzzyTermMatch(term, words) {
  if (term.length < 4) return false;
  const limit = term.length >= 7 ? 2 : 1;
  return words.some((word) => word.length >= 3 && editDistanceWithin(term, word, limit));
}

export function normalizeSearchText(value) { return normalize(value); }

export function searchCatalog(items, query, { limit = 10 } = {}) {
  const normalizedQuery = normalize(query);
  const terms = normalizedQuery.split(' ').filter(Boolean);
  const unique = new Map();

  for (const [index, item] of items.entries()) {
    if (!item?.id || unique.has(item.id)) continue;
    const label = normalize(item.label);
    const detail = normalize(item.detail);
    const keywords = normalize(item.keywords);
    const category = normalize(item.category);
    const haystack = `${label} ${detail} ${keywords} ${category}`.trim();
    const words = haystack.split(' ').filter(Boolean);
    let score = Number(item.priority) || 0;

    if (terms.length) {
      if (label === normalizedQuery) score += 320;
      else if (label.startsWith(normalizedQuery)) score += 190;
      else if (label.includes(normalizedQuery)) score += 125;

      let matchedTerms = 0;
      for (const term of terms) {
        if (label.split(' ').some((word) => word.startsWith(term))) { score += 42; matchedTerms += 1; }
        else if (label.includes(term)) { score += 30; matchedTerms += 1; }
        else if (keywords.includes(term)) { score += 18; matchedTerms += 1; }
        else if (detail.includes(term) || category.includes(term)) { score += 9; matchedTerms += 1; }
        else if (fuzzyTermMatch(term, words)) { score += 5; matchedTerms += 1; }
      }
      if (matchedTerms === 0) continue;
      if (matchedTerms === terms.length) score += 55;
      else score -= (terms.length - matchedTerms) * 22;
    }

    unique.set(item.id, { ...item, score, _order: index });
  }

  return [...unique.values()]
    .sort((left, right) => right.score - left.score || left._order - right._order)
    .slice(0, Math.max(1, Number(limit) || 10))
    .map(({ _order, ...item }) => item);
}
