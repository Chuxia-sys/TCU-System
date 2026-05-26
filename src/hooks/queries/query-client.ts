'use client';

import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient reference for use outside React components.
 * Used by prefetch utilities and cache manipulation helpers.
 * The actual QueryClient is created in providers.tsx — this just
 * stores a reference to it for module-level access.
 */

let globalQueryClient: QueryClient | null = null;

export function setQueryClient(client: QueryClient) {
  globalQueryClient = client;
}

export function getQueryClient(): QueryClient {
  if (!globalQueryClient) {
    throw new Error(
      'QueryClient not initialized. Ensure Providers component is mounted.'
    );
  }
  return globalQueryClient;
}

/**
 * Convenience proxy that delegates to the global QueryClient.
 * Used by prefetch.ts for route-based data preloading.
 */
export const queryClient = new Proxy<Record<string, any>>({} as any, {
  get(_, prop: string) {
    const client = getQueryClient();
    if (prop in client) {
      return (client as any)[prop].bind(client);
    }
    return undefined;
  },
}) as unknown as QueryClient;
