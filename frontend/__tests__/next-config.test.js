const nextConfig = require('../next.config');

describe('next.config', () => {
  it('keeps next dev from writing AGENTS.md into the repository', () => {
    // The repository only keeps core Markdown files; docs live in the Wiki.
    expect(nextConfig.agentRules).toBe(false);
  });
});

describe('next.config security headers', () => {
  function headersFor(rules, path) {
    return rules
      .filter((rule) => new RegExp(`^${rule.source.replace('/:path*', '(?:/.*)?')}$`).test(path))
      .flatMap((rule) => rule.headers.map((header) => header.key));
  }

  it('sends the baseline headers everywhere and blocks framing outside the wall display', async () => {
    const rules = await nextConfig.headers();

    for (const path of ['/', '/invite/abc', '/api/auth/me', '/display']) {
      expect(headersFor(rules, path)).toEqual(expect.arrayContaining(['X-Content-Type-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy']));
    }
    for (const path of ['/', '/invite/abc', '/api/auth/me', '/offline.html']) {
      expect(headersFor(rules, path)).toEqual(expect.arrayContaining(['Content-Security-Policy', 'X-Frame-Options']));
    }
    for (const path of ['/display', '/display/image.png']) {
      expect(headersFor(rules, path)).not.toContain('X-Frame-Options');
    }
  });
});
