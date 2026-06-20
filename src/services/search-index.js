const STOP_WORDS = new Set(['de','do','da','dos','das','no','na','nos','nas','em','para','com','sem','por','ao','a','o','um','uma','e','ou','se','que','nao','não','ja','já','sem','gestor']);

export function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s/]+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

export function buildInvertedIndex(cards) {
  const index = new Map();
  cards.forEach(card => {
    const tokens = tokenize(card.haystack);
    tokens.forEach(token => {
      if (!index.has(token)) index.set(token, new Set());
      index.get(token).add(card.id);
    });
  });
  return index;
}

export function searchCards(cards, invertedIndex, query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return cards.slice();

  const tokens = tokenize(trimmed);
  if (!tokens.length) return cards.slice();

  const matchedSets = [];
  tokens.forEach(token => {
    const exact = invertedIndex.get(token);
    if (exact) {
      matchedSets.push(exact);
      return;
    }
    const prefixSets = [];
    invertedIndex.forEach((ids, key) => {
      if (key.startsWith(token)) prefixSets.push(ids);
    });
    if (prefixSets.length) matchedSets.push(...prefixSets);
  });

  if (!matchedSets.length) return [];

  const intersection = matchedSets[0];
  for (let i = 1; i < matchedSets.length; i++) {
    const next = matchedSets[i];
    const temp = new Set();
    intersection.forEach(id => { if (next.has(id)) temp.add(id); });
    intersection.clear();
    temp.forEach(id => intersection.add(id));
  }
  const keep = intersection;
  return cards.filter(card => keep.has(card.id));
}
