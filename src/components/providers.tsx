'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { useState, useEffect } from 'react';

// ── Dev query debugger ────────────────────────────────────────────────
// Logs all fetch calls to /api/ in dev mode to help identify duplicates.
function QueryDebugger() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const originalFetch = window.fetch;
    const callMap = new Map<string, number>();

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/api/')) return originalFetch(input, init);

      const key = url.split('?')[0]; // strip query params for grouping
      const prev = callMap.get(key) || 0;
      callMap.set(key, prev + 1);
      const count = prev + 1;

      const start = performance.now();
      try {
        const response = await originalFetch(input, init);
        const ms = (performance.now() - start).toFixed(0);
        if (count > 1) {
          console.warn(`🔁 [FETCH x${count}] ${url} (${ms}ms)`);
        } else {
          console.debug(`📡 [FETCH] ${url} (${ms}ms)`);
        }
        return response;
      } catch (err) {
        const ms = (performance.now() - start).toFixed(0);
        console.error(`❌ [FETCH FAIL] ${url} (${ms}ms)`, err);
        throw err;
      }
    };

    // Expose debug helpers globally
    (window as any).__TCU_DEBUG__ = {
      queryCounts: callMap,
      printReport() {
        console.group('%c📊 TCU Query Report', 'font-size:14px;font-weight:bold');
        const sorted = Array.from(callMap.entries())
          .map(([k, c]) => ({ URL: k, Calls: c }))
          .sort((a, b) => b.Calls - a.Calls);
        console.table(sorted);
        console.groupEnd();
      },
      clearCounts() {
        callMap.clear();
        console.log('🧹 Query counts cleared');
      },
    };
    console.log('🔧 TCU Debug mode active. Use window.__TCU_DEBUG__.printReport() in console.');

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={true}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
          {process.env.NODE_ENV === 'development' && <QueryDebugger />}
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
