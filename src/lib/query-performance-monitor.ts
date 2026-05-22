type QueryMetric = {
  id: string;
  collection: string;
  durationMs: number;
  cached: boolean;
  timestamp: number;
  tag?: string;
};

type PerformanceSummary = {
  totalQueries: number;
  cachedQueries: number;
  slowQueries: QueryMetric[];
  averageDurationMs: number;
  lastUpdated: number;
};

class QueryPerformanceMonitor {
  private metrics: QueryMetric[] = [];
  private readonly slowThresholdMs = 400;
  private readonly maxStored = 200;

  monitorQuery(options: {
    id: string;
    collection: string;
    durationMs: number;
    cached: boolean;
    tag?: string;
  }): void {
    const metric: QueryMetric = {
      id: options.id,
      collection: options.collection,
      durationMs: options.durationMs,
      cached: options.cached,
      timestamp: Date.now(),
      tag: options.tag,
    };

    this.metrics.unshift(metric);
    if (this.metrics.length > this.maxStored) {
      this.metrics.pop();
    }
  }

  getSummary(): PerformanceSummary {
    const totalQueries = this.metrics.length;
    const cachedQueries = this.metrics.filter(m => m.cached).length;
    const averageDurationMs = totalQueries === 0
      ? 0
      : Math.round(this.metrics.reduce((sum, m) => sum + m.durationMs, 0) / totalQueries);

    const slowQueries = this.metrics
      .filter(m => m.durationMs >= this.slowThresholdMs)
      .slice(0, 10);

    return {
      totalQueries,
      cachedQueries,
      slowQueries,
      averageDurationMs,
      lastUpdated: Date.now(),
    };
  }

  logReport(): void {
    const summary = this.getSummary();
    console.log('[PerfMonitor] queries:', summary.totalQueries, 'cached:', summary.cachedQueries, 'avg:', summary.averageDurationMs, 'ms');
    if (summary.slowQueries.length > 0) {
      console.log('[PerfMonitor] slow queries:');
      for (const metric of summary.slowQueries) {
        console.log(`  ${metric.collection} ${metric.id} ${metric.durationMs}ms cached=${metric.cached}`);
      }
    }
  }
}

export const performanceMonitor = new QueryPerformanceMonitor();
