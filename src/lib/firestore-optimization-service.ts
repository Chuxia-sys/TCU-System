import { indexManager } from './firestore-index-manager';
import { queryCache } from './firestore-query-cache';
import { performanceMonitor } from './query-performance-monitor';
import { buildCacheKey, FirestoreQueryDescriptor, inferIndexDefinition } from './firestore-query-builder';

let indexDeployer: any = null;
const isServer = typeof window === 'undefined' && typeof process !== 'undefined';

if (isServer) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const deployModule = require('./firestore-index-deploy');
    indexDeployer = deployModule?.indexDeployer ?? null;
  } catch (error) {
    console.warn('[OptimizationService] index deployer unavailable:', error instanceof Error ? error.message : error);
    indexDeployer = null;
  }
}

type ExecuteOptimizedQueryOptions<T> = {
  descriptor: FirestoreQueryDescriptor;
  fetcher: () => Promise<T>;
  cacheKey?: string;
  cacheTtlMs?: number;
  cacheEnabled?: boolean;
  tag?: string;
};

export class FirestoreOptimizationService {
  async executeOptimizedQuery<T>(options: ExecuteOptimizedQueryOptions<T>): Promise<T> {
    const cacheKey = options.cacheKey || buildCacheKey(options.descriptor);
    const cacheEnabled = options.cacheEnabled !== false;
    const isCacheable = cacheEnabled && Boolean(cacheKey);

    const execute = async (): Promise<T> => {
      const start = Date.now();
      try {
        const result = await options.fetcher();
        const durationMs = Date.now() - start;

        performanceMonitor.monitorQuery({
          id: cacheKey,
          collection: options.descriptor.collection,
          durationMs,
          cached: false,
          tag: options.tag,
        });

        return result;
      } catch (error) {
        this.handleError(error, options.descriptor);
        throw error;
      }
    };

    try {
      if (isCacheable) {
        return await queryCache.getOrFetch(cacheKey, execute, options.cacheTtlMs ?? 30 * 1000);
      }

      return await execute();
    } catch (error) {
      throw error;
    }
  }

  invalidateCache(pattern: string | RegExp): void {
    queryCache.invalidate(pattern);
  }

  handleError(error: unknown, descriptor?: FirestoreQueryDescriptor): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isIndexError = errorMsg.includes('query requires an index') || errorMsg.includes('FAILED_PRECONDITION');
    
    if (isIndexError && descriptor) {
      const inferredIndex = inferIndexDefinition(descriptor);
      if (inferredIndex) {
        console.log('[OptimizationService] Detected missing index for', descriptor.collection, '- registering and queuing');
        indexManager.registerIndex(inferredIndex);
        if (indexDeployer) {
          indexDeployer.queueIndexes([inferredIndex]);
          console.log('[OptimizationService] Index queued for deployment');
        } else {
          console.warn('[OptimizationService] Index deployer not available, index registered but not queued');
        }
      }
    }

    const label = descriptor ? `${descriptor.collection}:${descriptor.label || 'query'}` : 'unknown-query';
    if (isIndexError) {
      console.warn(`[OptimizationService] Missing index error in ${label} (will retry on next request)`);
    } else {
      console.error(`[OptimizationService] Error in ${label}:`, errorMsg);
    }
  }

  getStatusReport() {
    const indexStatus = indexManager.getIndexes();
    const deployStatus = indexDeployer ? indexDeployer.getStatus() : null;
    const perfSummary = performanceMonitor.getSummary();

    return {
      indexes: indexStatus,
      deployment: deployStatus,
      performance: perfSummary,
      cache: {
        enabled: true,
      },
      healthScore: 100 - Math.min(100, perfSummary.averageDurationMs),
    };
  }

  logStatus(): void {
    console.log('\n\n=== FIRESTORE OPTIMIZATION SYSTEM STATUS ===\n');

    indexManager.logStatus();
    if (indexDeployer) {
      indexDeployer.logStatus();
    } else {
      console.log('[OptimizationService] index deployer is unavailable in this environment');
    }
    performanceMonitor.logReport();

    const report = this.getStatusReport();
    console.log(`\n⭐ OVERALL HEALTH: ${report.healthScore}/100\n`);
    console.log('==============================================\n');
  }

  configureAll(options: { autoDeployIndexes?: boolean; debug?: boolean; dryRun?: boolean } = {}) {
    if (indexDeployer) {
      indexDeployer.configure(options);
    }
  }
}

export const optimizationService = new FirestoreOptimizationService();
