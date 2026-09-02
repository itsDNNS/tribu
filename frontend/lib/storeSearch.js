export const STORE_QUERY_PLACEHOLDER = '{query}';

export function buildStoreSearchUrl(template, itemName) {
  if (typeof template !== 'string' || typeof itemName !== 'string') return null;
  const parts = template.split(STORE_QUERY_PLACEHOLDER);
  const name = itemName.trim();
  if (parts.length !== 2 || !name) return null;
  const url = parts.join(encodeURIComponent(name));
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { url, host: parsed.hostname };
  } catch {
    return null;
  }
}

export function storeLinkHost(template) {
  return buildStoreSearchUrl(template, 'sample')?.host || null;
}
