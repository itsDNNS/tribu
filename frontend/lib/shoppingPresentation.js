// Match the backend's locale-independent casefold for common category vocabulary.
export function categoryKey(value) {
  return (value || '').trim().toLowerCase().replaceAll('ß', 'ss').replaceAll('ς', 'σ').replace(/[ﬀ-ﬆ]/g, (letter) => ({ 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' }[letter]));
}

export function categoryVocabulary(values) {
  const labels = new Map();
  values.forEach((value) => {
    const label = value?.trim();
    if (label && !labels.has(categoryKey(label))) labels.set(categoryKey(label), label);
  });
  return [...labels.values()];
}

export function groupItemsByCategory(items, uncategorized, vocabulary = []) {
  const labels = new Map(vocabulary.map((label) => [categoryKey(label), label]));
  const groups = new Map();
  items.forEach((item) => {
    const key = categoryKey(item.category);
    if (!groups.has(key)) groups.set(key, { key, label: labels.get(key) || item.category?.trim() || uncategorized, items: [] });
    groups.get(key).items.push(item);
  });
  return [...groups.values()]
    .map((group) => ({ ...group, items: [...group.items].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function timestamp(value) {
  if (!value) return 0;
  // Backend timestamps are UTC, including SQLite's offset-free serialization.
  return Date.parse(/[Zz]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`) || 0;
}

export function compareCheckedItems(a, b) {
  return timestamp(b.checked_at) - timestamp(a.checked_at)
    || timestamp(a.created_at) - timestamp(b.created_at)
    || a.id - b.id;
}
