import { buildStoreSearchUrl, storeLinkHost } from '../../lib/storeSearch';

describe('store search URL helpers', () => {
  test.each([
    ['Brötchen', 'Br%C3%B6tchen'],
    ['Crème fraîche', 'Cr%C3%A8me%20fra%C3%AEche'],
    ['ψωμί', '%CF%88%CF%89%CE%BC%CE%AF'],
    ['Хлеб', '%D0%A5%D0%BB%D0%B5%D0%B1'],
    ['خبز', '%D8%AE%D8%A8%D8%B2'],
    ['面包', '%E9%9D%A2%E5%8C%85'],
    ['space & / % # $ {query}', 'space%20%26%20%2F%20%25%20%23%20%24%20%7Bquery%7D'],
  ])('encodes %s exactly once', (name, encoded) => {
    const result = buildStoreSearchUrl('https://example.com/search?type=all&q={query}', name);
    expect(result).toEqual({ url: `https://example.com/search?type=all&q=${encoded}`, host: 'example.com' });
  });

  it('supports path and fragment templates with one substitution', () => {
    expect(buildStoreSearchUrl('https://example.com/search/{query}', 'Bread').url)
      .toBe('https://example.com/search/Bread');
    expect(buildStoreSearchUrl('https://example.com/#/find/{query}', 'Bread').url)
      .toBe('https://example.com/#/find/Bread');
  });

  it('returns a punycode hostname for IDNs', () => {
    expect(buildStoreSearchUrl('https://bücher.example/?q={query}', 'Bread').host)
      .toBe('xn--bcher-kva.example');
  });

  test.each([
    ['https://example.com/search', 'Bread'],
    ['https://example.com/{query}?q={query}', 'Bread'],
    ['https://example.com/?q={query}', '   '],
    ['javascript:alert({query})', 'Bread'],
    ['https://[::1x/?q={query}', 'Bread'],
  ])('returns null for invalid input', (template, name) => {
    expect(buildStoreSearchUrl(template, name)).toBeNull();
  });

  it('extracts a host or returns null', () => {
    expect(storeLinkHost('https://www.example.com/?q={query}')).toBe('www.example.com');
    expect(storeLinkHost('https://example.com/search')).toBeNull();
  });
});
