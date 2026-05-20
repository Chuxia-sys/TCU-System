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
  // IMPORTANT: Do NOT set allowedDevOrigins here.
  // When this field is defined, Next.js switches from "warn" mode to "block"
  // mode for cross-origin requests. The preview panel uses dynamic subdomains
  // (*.space-z.ai) that can't be statically listed. Leaving this undefined
  // keeps the warn-only behavior, which allows preview to work correctly.
};

export default nextConfig;
