'use client';

import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { safeJson } from '@/lib/utils';

/**
 * Build a URL with query parameters.
 */
function buildUrl(base: string, params?: Record<string, string | undefined>): string {
  if (!params) return base;
  const filtered = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (filtered.length === 0) return base;
  const qs = filtered
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join('&');
  return `${base}?${qs}`;
}

/**
 * Generic fetch wrapper for TanStack Query.
 * Handles:
 * - URL construction with query params
 * - JSON parsing with safeJson
 * - Error handling with meaningful messages
 * - AbortSignal support
 */
export async function apiFetcher<T = unknown>(
  url: string,
  params?: Record<string, string | undefined>,
  signal?: AbortSignal
): Promise<T> {
  const fullUrl = buildUrl(url, params);
  const res = await fetch(fullUrl, { signal });

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = await safeJson<{ error?: string; message?: string }>(res);
      errorMsg = body?.error || body?.message || errorMsg;
    } catch { /* ignore */ }
    throw new Error(errorMsg);
  }

  const data = await safeJson<T>(res);
  if (data === null || data === undefined) {
    return [] as unknown as T;
  }
  return data;
}

/**
 * Mutation helper for POST/PUT/PATCH/DELETE requests.
 * Automatically handles JSON body serialization.
 */
export async function apiMutator<T = unknown>(
  url: string,
  options: {
    method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const { method = 'POST', body, signal } = options;

  const fetchOptions: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal,
  };

  if (body !== undefined && method !== 'DELETE') {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    let errorMsg = `Mutation failed: ${res.status} ${res.statusText}`;
    try {
      const errorBody = await safeJson<{ error?: string; message?: string }>(res);
      errorMsg = errorBody?.error || errorBody?.message || errorMsg;
    } catch { /* ignore */ }
    throw new Error(errorMsg);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  const data = await safeJson<T>(res);
  return data as T;
}

// ─── Generic hooks for one-off API endpoints ──────────────────────────

/**
 * Generic TanStack Query hook for any REST API endpoint.
 * Use this for endpoints that don't have a dedicated hook yet.
 *
 * @example
 * ```tsx
 * const { data } = useApiQuery<ScheduleResponse[]>(
 *   ['schedule-responses'],
 *   '/api/schedule-responses'
 * );
 * ```
 */
export function useApiQuery<T = unknown>(
  queryKey: unknown[],
  url: string,
  params?: Record<string, string | undefined>,
  options?: Omit<UseQueryOptions<T, Error, T, unknown[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T, Error, T, unknown[]>({
    queryKey,
    queryFn: ({ signal }) => apiFetcher<T>(url, params, signal),
    ...options,
  } as UseQueryOptions<T, Error, T, unknown[]>);
}

/**
 * Generic TanStack Query mutation hook for POST/PUT/PATCH/DELETE.
 *
 * @example
 * ```tsx
 * const mutation = useApiMutation<{ id: string }>('/api/schedule-responses');
 * mutation.mutate({ body: { scheduleId, status: 'accepted' } });
 * ```
 */
export function useApiMutation<TData = unknown, TVariables = unknown>(
  url: string,
  options?: UseMutationOptions<TData, Error, TVariables>
) {
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables) => {
      const method =
        options?.mutationFn
          ? undefined
          : 'POST';
      
      if (options?.mutationFn) {
        return options.mutationFn(variables as any) as any;
      }
      
      return apiMutator<TData>(url, {
        method: method as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        body: variables,
      });
    },
    ...options,
  } as UseMutationOptions<TData, Error, TVariables>);
}
