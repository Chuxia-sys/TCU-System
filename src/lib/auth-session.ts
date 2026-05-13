import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Server-side session helper for Next.js App Router API route handlers.
 *
 * Uses the default getServerSession() which internally reads cookies
 * from next/headers. This is the recommended approach for Next.js 16
 * App Router.
 *
 * If this returns null, check:
 * - NEXTAUTH_URL is set in .env
 * - NEXTAUTH_SECRET is consistent
 * - The client is sending cookies (sameSite, secure settings)
 */
export async function getAuthSession() {
  return getServerSession(authOptions);
}
