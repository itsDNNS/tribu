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
    ];
  },
};

module.exports = nextConfig;
