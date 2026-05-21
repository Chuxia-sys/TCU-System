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
};

export default nextConfig;
