/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';

const { createHash } = require('crypto');
const { PRE_PAINT_BOOTSTRAP } = require('./lib/prePaintBootstrap');

// Only Tribu's own script files and the one static pre-paint script may run.
// Production builds use webpack (`npm run build`), whose pages carry no other
// inline script; Turbopack adds a per-build chunk loader that no fixed hash can allow.
// `next dev` runs Turbopack with hot reloading, so development allows inline code and eval.
const prePaintHash = createHash('sha256').update(PRE_PAINT_BOOTSTRAP).digest('base64');
const scriptSrc = process.env.NODE_ENV === 'production'
  ? `'self' 'sha256-${prePaintHash}'`
  : "'self' 'unsafe-inline' 'unsafe-eval'";
const contentSecurityPolicy = `script-src ${scriptSrc}; object-src 'none'; base-uri 'none'`;

const baseSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Reported only: Next.js and React render through Trusted Types, Tribu's own sinks use the 'tribu' policy.
  { key: 'Content-Security-Policy-Report-Only', value: "require-trusted-types-for 'script'" },
];

const nextConfig = {
  // Standalone output emits a self-contained server (.next/standalone)
  // with only the production deps Next traced as reachable. The Docker
  // runtime image copies that bundle instead of the full node_modules,
  // dropping the dev/test dependency surface from production images.
  output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  // `next dev` would otherwise write AGENTS.md when it detects an AI coding
  // agent. The repository keeps only core Markdown files; docs live in the Wiki.
  agentRules: false,
  // Local e2e runs use `next dev`; its indicator covers the mobile bottom
  // navigation and intercepts clicks. Errors are still reported.
  ...(process.env.TRIBU_E2E === '1' ? { devIndicators: false } : {}),
  async headers() {
    return [
      { source: '/:path*', headers: baseSecurityHeaders },
      // The wall display has no actions worth hijacking and is often embedded in home dashboards.
      {
        source: '/((?!display).*)',
        headers: [
          { key: 'Content-Security-Policy', value: `${contentSecurityPolicy}; frame-ancestors 'none'` },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      { source: '/display/:path*', headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }] },
    ];
  },
  async rewrites() {
    // The e-ink picture lives outside /api so reverse proxies that send /api to the
    // backend still reach it; beforeFiles lets it win over the backend proxy below.
    const beforeFiles = [
      { source: '/display/image.png', destination: '/api/display-image' },
    ];
    const afterFiles = [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
      {
        source: '/ws/shopping/:path*',
        destination: `${backendUrl}/ws/shopping/:path*`,
      },
      {
        source: '/dav',
        destination: `${backendUrl}/dav/`,
      },
      {
        source: '/dav/:path*',
        destination: `${backendUrl}/dav/:path*`,
      },
      {
        source: '/.well-known/caldav',
        destination: `${backendUrl}/.well-known/caldav`,
      },
      {
        source: '/.well-known/carddav',
        destination: `${backendUrl}/.well-known/carddav`,
      },
      // OIDC login + callback. The callback URL is registered with
      // the identity provider as <base>/auth/oidc/callback, so it
      // cannot live under /api/. Proxy the whole /auth/oidc/ subtree
      // so both the authorize redirect and the callback land on the
      // FastAPI routes without the extra prefix.
      {
        source: '/auth/oidc/:path*',
        destination: `${backendUrl}/auth/oidc/:path*`,
      },
    ];
    return { beforeFiles, afterFiles };
  },
};

module.exports = nextConfig;
