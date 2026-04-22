/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://backend:8000'}/:path*`,
      },
      {
        source: '/dav',
        destination: `${process.env.BACKEND_URL || 'http://backend:8000'}/dav/`,
      },
      {
        source: '/dav/:path*',
        destination: `${process.env.BACKEND_URL || 'http://backend:8000'}/dav/:path*`,
      },
      {
        source: '/.well-known/caldav',
        destination: `${process.env.BACKEND_URL || 'http://backend:8000'}/.well-known/caldav`,
      },
      {
        source: '/.well-known/carddav',
        destination: `${process.env.BACKEND_URL || 'http://backend:8000'}/.well-known/carddav`,
      },
      // OIDC login + callback. The callback URL is registered with
      // the identity provider as <base>/auth/oidc/callback, so it
      // cannot live under /api/. Proxy the whole /auth/oidc/ subtree
      // so both the authorize redirect and the callback land on the
      // FastAPI routes without the extra prefix.
      {
        source: '/auth/oidc/:path*',
        destination: `${process.env.BACKEND_URL || 'http://backend:8000'}/auth/oidc/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
