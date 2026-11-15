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
      expect(headersFor(rules, path)).toContain('Content-Security-Policy');
    }
  });

  function cspFor(nodeEnv, path) {
    let config;
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = nodeEnv;
    try {
      jest.isolateModules(() => { config = require('../next.config'); });
    } finally {
      process.env.NODE_ENV = previous;
    }
    return config.headers().then((rules) => rules
      .filter((rule) => new RegExp(`^${rule.source.replace('/:path*', '(?:/.*)?')}$`).test(path))
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === 'Content-Security-Policy').value);
  }

  it('lets production run only its own scripts and the hashed pre-paint script', async () => {
    const { createHash } = require('crypto');
    const { PRE_PAINT_BOOTSTRAP } = require('../lib/prePaintBootstrap');
    const hash = createHash('sha256').update(PRE_PAINT_BOOTSTRAP).digest('base64');

    const app = await cspFor('production', '/');
    expect(app).toContain(`script-src 'self' 'sha256-${hash}';`);
    expect(app).not.toContain('unsafe-inline');
    expect(app).not.toContain('unsafe-eval');
    expect(app).toContain("frame-ancestors 'none'");

    const display = await cspFor('production', '/display');
    expect(display).toContain(`script-src 'self' 'sha256-${hash}';`);
    expect(display).not.toContain('frame-ancestors');
  });

  it('relaxes scripts only for the development server', async () => {
    expect(await cspFor('development', '/')).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });
});
