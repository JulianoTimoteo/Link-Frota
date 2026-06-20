const STOP_WORDS = new Set([
  'de',
  'do',
  'da',
  'dos',
  'das',
  'no',
  'na',
  'nos',
  'nas',
  'em',
  'para',
  'com',
  'sem',
  'por',
  'ao',
  'a',
  'o',
  'um',
  'uma',
  'uns',
  'umas',
  'e',
  'ou',
  'se',
  'que',
  'nao',
  'não',
  'ja',
  'já',
]);

export function normalizeToken(token) {
  return token
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function tokenize(text) {
  if (!text) return [];
  return text
    .split(/[\s/]+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

export function buildInvertedIndex(cards) {
  const index = new Map();

  cards.forEach((card) => {
    const tokens = tokenize(card.searchText);
    tokens.forEach((token) => {
      if (!index.has(token)) {
        index.set(token, new Set());
      }
      index.get(token).add(card.id);
    });
  });

  return index;
}

export function searchCards({ cards, invertedIndex, query }) {
  const trimmed = query.trim();
  if (!trimmed) {
    return cards.slice();
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return cards.slice();
  }

  const matchedSets = [];
  tokens.forEach((token) => {
    const exactIndexEntry = invertedIndex.get(token);
    if (exactIndexEntry) {
      matchedSets.push(exactIndexEntry);
      return;
    }

    const prefixMatches = [];
    invertedIndex.forEach((ids, key) => {
      if (key.startsWith(token)) {
        prefixMatches.push(ids);
      }
    });

    if (prefixMatches.length > 0) {
      matchedSets.push(...prefixMatches);
    }
  });

  if (matchedSets.length === 0) {
    return [];
  }

  const intersection = matchedSets[0];
  const result = new Set(intersection);
  for (let i = 1; i < matchedSets.length; i++) {
    const next = matchedSets[i];
    const temp = new Set();
    result.forEach((id) => {
      if (next.has(id)) temp.add(id);
    });
    result.clear();
    next.forEach((id) => temp.add(id));
  }

  const resultArray = Array.from(result);
  const resultIds = new Set(resultArray);

  return cards.filter((card) => resultIds.has(card.id));
}
