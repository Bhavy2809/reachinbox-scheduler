/** @type {import('next').NextConfig} */

// In production the browser only ever talks to the frontend's domain. Next proxies
// /auth, /api and /admin to the Express backend, so the session cookie is first-party
// (no cross-site cookie problems) and OAuth redirect URIs live on one domain.
// Locally BACKEND_ORIGIN is unset and the browser calls http://localhost:4000 directly.
const backend = process.env.BACKEND_ORIGIN;

const nextConfig = {
  reactStrictMode: true,
  images: {
    // Google profile pictures
    remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }],
  },
  async rewrites() {
    if (!backend) return [];
    return [
      { source: '/auth/:path*', destination: `${backend}/auth/:path*` },
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/admin/:path*', destination: `${backend}/admin/:path*` },
    ];
  },
};

export default nextConfig;
