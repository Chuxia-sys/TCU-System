import type { NextConfig } from "next";

// =============================================================
// CRITICAL: Override DATABASE_URL to prevent Prisma/SQLite usage
// The system env var DATABASE_URL may point to a SQLite file,
// which would cause Prisma Client to connect to SQLite instead
// of Firebase Firestore. This project uses Firestore exclusively.
// We neutralize the env var at the earliest possible point.
// =============================================================
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dev/null')) {
  console.warn(
    `[CONFIG] ⚠️ DATABASE_URL was set to "${process.env.DATABASE_URL}" which points to SQLite. ` +
    `Overriding to /dev/null — this project uses Firebase Firestore exclusively.`
  );
}
process.env.DATABASE_URL = 'file:/dev/null';

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: [],

  // Allow cross-origin requests from the preview panel (dynamic subdomains)
  allowedDevOrigins: [
    '.space-z.ai',
  ],

  // ============================================================
  // Cache & Performance Headers
  // ============================================================
  async headers() {
    return [
      // Static assets: immutable cache for 1 year (hashed filenames)
      {
        source: '/:path*\\.(jpg|jpeg|gif|png|ico|webp|svg|woff2?|ttf|otf|css|js|json)$',
        locale: false,
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Static public assets (non-hashed)
      {
        source: '/static/(.*)',
        locale: false,
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      // API routes: no caching (dynamic data)
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
      // Page routes: use stale-while-revalidate for faster re-navigation
      {
        source: '/((?:api|_next/static|static|favicon.ico)\\b.*)',
        locale: false,
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
