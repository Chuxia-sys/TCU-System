// =============================================================
// TCU Scheduling System - Firestore REST API Database Adapter
// =============================================================
// IMPORTANT: This is the ONLY database adapter used by this app.
//
// - Database: Firebase Firestore (project: for-commission)
// - Access method: REST API (no gRPC dependency)
// - Authentication: OAuth2 token (preferred) or API key (fallback)
//   Uses service account via src/lib/firebase-admin.ts for OAuth2.
// - Provides: Prisma-compatible API (findUnique, findMany, etc.)
//
// ⚠️  CRITICAL: Prisma Client is NEVER used at runtime.
//     The system DATABASE_URL env var may point to a SQLite file,
//     but this adapter always connects to Firebase Firestore.
//     Any accidental import of @prisma/client will be intercepted
//     and redirected to this Firestore adapter.
//
// To modify the data model, update BOTH:
//   1. prisma/schema.prisma (documentation only)
//   2. This file's model definitions at the bottom
// =============================================================

import {
  FIREBASE_PROJECT_ID,
  FIREBASE_API_KEY,
} from './firebase';

// ============================================================
// Runtime Guard: Neutralize DATABASE_URL & Block SQLite
// ============================================================
// The system environment may set DATABASE_URL to a SQLite path.
// We override it here to prevent any accidental Prisma/SQLite usage.
//
// This guard runs at THREE levels:
//   1. next.config.ts (earliest — before Next.js boots)
//   2. src/instrumentation.ts (server startup — before routes)
//   3. This file (runtime — every time db.ts is imported)
//
// ALL THREE levels enforce: DATABASE_URL = 'file:/dev/null'
if (typeof process !== 'undefined' && process.env) {
  const currentUrl = process.env.DATABASE_URL || '';
  if (!currentUrl.includes('dev/null')) {
    console.warn(
      `[DB GUARD] ⚠️ DATABASE_URL was "${currentUrl}" — overriding to /dev/null. ` +
      `This project uses Firebase Firestore exclusively.`
    );
    process.env.DATABASE_URL = 'file:/dev/null';
  }
  // Set guard flag so instrumentation.ts knows this module is active
  process.env.__DB_GUARD_ACTIVE = 'true';
}

// ============================================================
// Firestore REST API Client
// ============================================================

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Connection status tracking
let connectionValidated = false;
let lastValidationError: string | null = null;

// Configuration for request handling
const REQUEST_CONFIG = {
  TIMEOUT_MS: 15000, // 15 seconds per request
  MAX_RETRIES: 3,
  BACKOFF_INITIAL_MS: 500,
  BACKOFF_MAX_MS: 5000,
  MAX_CONCURRENT_RELATIONS: 5, // Limit concurrent relation fetches
  // 429 (quota) specific settings
  QUOTA_MAX_RETRIES: 5,        // More retries for quota errors
  QUOTA_BACKOFF_INITIAL_MS: 2000,  // Start with 2s backoff
  QUOTA_BACKOFF_MAX_MS: 30000,     // Cap at 30s
  CIRCUIT_BREAKER_THRESHOLD: 10,   // Number of recent 429s to trigger breaker
  CIRCUIT_BREAKER_RESET_MS: 60000, // Reset breaker after 60s
};

// ── Global rate limiter / circuit breaker ──
const rateLimiter = {
  recent429s: 0,
  last429Time: 0,
  circuitOpen: false,
  circuitOpenTime: 0,
  /**
   * Call on every 429. Returns true if the circuit breaker should engage.
   */
  record429(): boolean {
    this.recent429s++;
    this.last429Time = Date.now();
    if (this.recent429s >= REQUEST_CONFIG.CIRCUIT_BREAKER_THRESHOLD && !this.circuitOpen) {
      this.circuitOpen = true;
      this.circuitOpenTime = Date.now();
      console.error(`[RateLimiter] ⛔ Circuit BREAKER opened after ${this.recent429s} quota errors`);
      return true;
    }
    return false;
  },
  /**
   * Call before every request. If the circuit is open, returns the remaining
   * wait time in ms (0 = no wait). If the reset period has elapsed, re-closes.
   */
  waitTime(): number {
    if (!this.circuitOpen) return 0;
    const elapsed = Date.now() - this.circuitOpenTime;
    if (elapsed >= REQUEST_CONFIG.CIRCUIT_BREAKER_RESET_MS) {
      this.circuitOpen = false;
      this.recent429s = 0;
      console.log(`[RateLimiter] ✅ Circuit BREAKER closed after ${elapsed}ms`);
      return 0;
    }
    return REQUEST_CONFIG.CIRCUIT_BREAKER_RESET_MS - elapsed;
  },
  /** Call on a successful request to gradually decay the 429 counter. */
  recordSuccess(): void {
    if (this.recent429s > 0) {
      this.recent429s = Math.max(0, this.recent429s - 1);
    }
  },
};

// ── Request deduplication ──
// When multiple callers ask for the same Firestore document/query simultaneously,
// coalesce them into a single in-flight request. Only applies to GET requests.
const inflightMap = new Map<string, Promise<any>>();
const INFLIGHT_TTL_MS = 10_000; // Dedup window

function dedupedFirestoreRequest(path: string, method: string = 'GET', body?: any): Promise<any> {
  // Only deduplicate read requests
  if (method !== 'GET') {
    return firestoreRequest(path, method, body);
  }
  const key = `${method}:${path}:${body ? JSON.stringify(body) : ''}`;
  const existing = inflightMap.get(key);
  if (existing) {
    return existing;
  }
  const promise = firestoreRequest(path, method, body).finally(() => {
    // Remove from map after a short delay to prevent rapid re-requests
    setTimeout(() => inflightMap.delete(key), INFLIGHT_TTL_MS);
  });
  inflightMap.set(key, promise);
  return promise;
}

// ── OAuth2 access token cache ──
let cachedToken: string | null = null;
let tokenExpiry = 0;

/**
 * Try to get an OAuth2 access token from the service account.
 * Falls back to null — caller should use API key as fallback.
 */
async function getOAuthToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  try {
    const { getAccessToken } = await import('./firebase-admin');
    const token = await getAccessToken();
    if (token) {
      cachedToken = token;
      tokenExpiry = Date.now() + 55 * 60 * 1000; // Refresh after 55 min (tokens last 60 min)
    }
    return token;
  } catch {
    return null;
  }
}

// Helper: append API key to a URL as a query parameter (fallback auth)
function withApiKey(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}key=${FIREBASE_API_KEY}`;
}

// ============================================================
// Concurrency Control (Semaphore)
// ============================================================

class Semaphore {
  private available: number;
  private waitQueue: (() => void)[] = [];

  constructor(max: number) {
    this.available = max;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }

    await new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.available++;
    const resolve = this.waitQueue.shift();
    if (resolve) {
      this.available--;
      resolve();
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const relationSemaphore = new Semaphore(REQUEST_CONFIG.MAX_CONCURRENT_RELATIONS);

// ============================================================
// Firestore Connection Validation
// ============================================================

/**
 * Validates the Firestore connection by attempting a lightweight read.
 * Call this on server startup to ensure Firebase credentials are valid.
 */
export async function validateFirestoreConnection(): Promise<{ 
  connected: boolean; 
  project: string; 
  error?: string 
}> {
  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_CONFIG.TIMEOUT_MS);

    try {
      // Try a lightweight read to verify Firestore access using API key
      const response = await fetch(
        withApiKey(`${FIRESTORE_BASE}/departments?pageSize=1`),
        { signal: controller.signal }
      );
      
      // 200 = OK, 404 = collection doesn't exist yet but access works
      if (response.status === 200 || response.status === 404) {
        connectionValidated = true;
        lastValidationError = null;
        console.log('[Firestore] ✅ Connected to Firebase Firestore (project: ' + FIREBASE_PROJECT_ID + ')');
        return { connected: true, project: FIREBASE_PROJECT_ID };
      }
      
      const data = await response.json().catch(() => ({}));
      const errorMsg = data.error?.message || `HTTP ${response.status}`;
      lastValidationError = errorMsg;
      return { connected: false, project: FIREBASE_PROJECT_ID, error: errorMsg };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    lastValidationError = errorMsg;
    console.error('[Firestore] ❌ Connection validation failed:', errorMsg);
    return { connected: false, project: FIREBASE_PROJECT_ID, error: errorMsg };
  }
}

/**
 * Returns the current connection status without making a network request.
 */
export function getFirestoreStatus(): { 
  validated: boolean; 
  project: string; 
  lastError?: string | null 
} {
  return { 
    validated: connectionValidated, 
    project: FIREBASE_PROJECT_ID,
    lastError: lastValidationError 
  };
}

// Make request to Firestore REST API using OAuth2 (preferred) or API key (fallback)
async function firestoreRequest(path: string, method: string = 'GET', body?: any, retryCount: number = 0, isQuotaRetry: boolean = false): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Try OAuth2 Bearer token first (more secure), fall back to API key
  const token = await getOAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // ── Circuit breaker check ──
  const waitMs = rateLimiter.waitTime();
  if (waitMs > 0) {
    console.warn(`[RateLimiter] ⏳ Circuit breaker active, waiting ${waitMs}ms before request: ${path}`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const baseUrl = path.startsWith('http') ? path : `${FIRESTORE_BASE}/${path}`;
  const url = withApiKey(baseUrl);

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (response.status === 404) {
      rateLimiter.recordSuccess();
      return null;
    }

    // ── Handle 429 Quota Exceeded ──
    if (response.status === 429) {
      rateLimiter.record429();
      const data = await response.json().catch(() => ({}));
      const maxRetries = REQUEST_CONFIG.QUOTA_MAX_RETRIES;
      if (retryCount < maxRetries) {
        const backoffMs = Math.min(
          REQUEST_CONFIG.QUOTA_BACKOFF_INITIAL_MS * Math.pow(2, retryCount),
          REQUEST_CONFIG.QUOTA_BACKOFF_MAX_MS
        );
        console.warn(
          `[DB] ⚠️ Quota exceeded (429) — retry ${retryCount + 1}/${maxRetries} after ${backoffMs}ms: ${path}`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return firestoreRequest(path, method, body, retryCount + 1, true);
      }
      throw new Error(`Firestore REST error 429: ${data.error?.message || JSON.stringify(data)}`);
    }

    const data = await response.json();
    if (response.status >= 400) {
      throw new Error(`Firestore REST error ${response.status}: ${data.error?.message || JSON.stringify(data)}`);
    }

    rateLimiter.recordSuccess();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Determine if error is retryable (network-level or quota)
    const isQuotaError = isQuotaRetry || (
      typeof error.message === 'string' && error.message.includes('429')
    );
    const isRetryable =
      error.name === 'AbortError' || // Timeout
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') ||
      isQuotaError;

    if (isRetryable) {
      const maxRetries = isQuotaError ? REQUEST_CONFIG.QUOTA_MAX_RETRIES : REQUEST_CONFIG.MAX_RETRIES;
      if (retryCount < maxRetries) {
        const backoffMs = isQuotaError
          ? Math.min(
              REQUEST_CONFIG.QUOTA_BACKOFF_INITIAL_MS * Math.pow(2, retryCount),
              REQUEST_CONFIG.QUOTA_BACKOFF_MAX_MS
            )
          : Math.min(
              REQUEST_CONFIG.BACKOFF_INITIAL_MS * Math.pow(2, retryCount),
              REQUEST_CONFIG.BACKOFF_MAX_MS
            );
        console.log(
          `[DB] Retrying request (attempt ${retryCount + 1}/${maxRetries}) after ${backoffMs}ms: ${path}`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return firestoreRequest(path, method, body, retryCount + 1, isQuotaError);
      }
    }

    // Log detailed error info
    const errorType = error.name === 'AbortError' ? 'TIMEOUT' : error.code || error.type || 'UNKNOWN';
    console.error(
      `[DB] Fatal error after ${retryCount} retries (${errorType}): ${path}`,
      { error: error.message, code: error.code }
    );

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Firestore Value Conversion
// ============================================================

function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { arrayValue: {} };
    }
    return { arrayValue: { values: value.map(v => toFirestoreValue(v)) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function fromFirestoreValue(value: any): any {
  if (!value) return null;

  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) {
    if (!value.arrayValue.values) return [];
    return value.arrayValue.values.map((v: any) => fromFirestoreValue(v));
  }
  if ('mapValue' in value) {
    if (!value.mapValue.fields) return {};
    return fromFirestoreFields(value.mapValue.fields);
  }
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('bytesValue' in value) return value.bytesValue;

  return null;
}

function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = fromFirestoreValue(value);
  }
  return result;
}

function parseDocument(doc: any): Record<string, any> | null {
  if (!doc || !doc.fields) return null;
  const data = fromFirestoreFields(doc.fields);
  // Extract document ID from the document name
  // Format: projects/{projectId}/databases/(default)/documents/{collection}/{docId}
  const nameParts = doc.name.split('/');
  data.id = nameParts[nameParts.length - 1];
  return data;
}

// ============================================================
// CUID-style ID Generator (compatible with Prisma's @default(cuid()))
// ============================================================

function createId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const randomPart2 = Math.random().toString(36).substring(2, 10);
  return `cm${timestamp}${randomPart}${randomPart2}`.substring(0, 25);
}

// ============================================================
// Relation Configuration
// ============================================================

interface RelationConfig {
  type: 'one' | 'many';
  collection: string;
  foreignKey: string;
  localKey?: string;
}

type ModelRelations = Record<string, RelationConfig>;

// ============================================================
// Model Adapter Factory
// ============================================================

function createModel(name: string, uniqueFields: string[], relations: ModelRelations = {}) {
  // Resolve includes (fetch related documents) with concurrency control
  async function resolveIncludes(
    data: Record<string, any>,
    include?: Record<string, boolean | any>
  ): Promise<Record<string, any>> {
    if (!include) return data;

    const result = { ...data };

    // Use semaphore to limit concurrent relation fetches
    await Promise.all(
      Object.entries(include).map(([key, val]) =>
        relationSemaphore.run(async () => {
          // Handle Prisma-style _count
          if (key === '_count') {
            const countResult: Record<string, number> = {};
            const selectFields = typeof val === 'object' && val !== null && val.select ? val.select : {};
            
            for (const [field, enabled] of Object.entries(selectFields)) {
              if (enabled && relations[field] && relations[field].type === 'many') {
                try {
                  const count = await runQuery(
                    relations[field].collection,
                    [{ field: relations[field].foreignKey, op: 'EQUAL', value: data.id }],
                    undefined,
                    10000
                  );
                  countResult[field] = count.length;
                } catch {
                  countResult[field] = 0;
                }
              }
            }
            result._count = countResult;
            return;
          }

          const relation = relations[key];
          if (!relation) return;

          try {
            if (relation.type === 'one' && relation.localKey) {
              const foreignId = data[relation.localKey];
              if (foreignId) {
                const doc = await dedupedFirestoreRequest(`${relation.collection}/${foreignId}`);
                if (doc) {
                  const relatedData = parseDocument(doc);
                  if (relatedData) {
                    if (typeof val === 'object' && val !== null && val.include) {
                      // For nested includes, we need to get the related model's relations
                      // For now, just resolve one level deep
                      result[key] = relatedData;
                    } else {
                      result[key] = relatedData;
                    }
                  } else {
                    result[key] = null;
                  }
                } else {
                  result[key] = null;
                }
              } else {
                result[key] = null;
              }
            } else if (relation.type === 'many') {
              // Query related documents where foreignKey equals this document's id
              const queryResults = await runQuery(
                relation.collection,
                [{ field: relation.foreignKey, op: 'EQUAL', value: data.id }],
                undefined,
                1000
              );
              if (typeof val === 'object' && val !== null && val.include) {
                result[key] = queryResults;
              } else {
                result[key] = queryResults;
              }
            }
          } catch (error) {
            console.error(`[DB] Error resolving relation ${key}:`, error);
            result[key] = null;
          }
        })
      )
    );

    return result;
  }

  // Run a structured query against Firestore
  async function runQuery(
    collectionId: string,
    filters?: Array<{ field: string; op: string; value: any }>,
    orderByClause?: Array<{ field: string; direction: string }>,
    limitCount?: number,
    startAfterValue?: any
  ): Promise<Record<string, any>[]> {
    const queryBody: any = {
      structuredQuery: {
        from: [{ collectionId }],
      },
    };

    if (filters && filters.length > 0) {
      if (filters.length === 1) {
        queryBody.structuredQuery.where = {
          fieldFilter: {
            field: { fieldPath: filters[0].field },
            op: filters[0].op as any,
            value: toFirestoreValue(filters[0].value),
          },
        };
      } else {
        queryBody.structuredQuery.where = {
          compositeFilter: {
            op: 'AND',
            filters: filters.map(f => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: f.op as any,
                value: toFirestoreValue(f.value),
              },
            })),
          },
        };
      }
    }

    if (orderByClause && orderByClause.length > 0) {
      queryBody.structuredQuery.orderBy = orderByClause.map(o => ({
        field: { fieldPath: o.field },
        direction: o.direction === 'desc' ? 'DESCENDING' : 'ASCENDING',
      }));
    }

    if (limitCount) {
      queryBody.structuredQuery.limit = limitCount;
    }

    if (startAfterValue !== undefined && orderByClause && orderByClause.length > 0) {
      queryBody.structuredQuery.startAt = {
        values: [toFirestoreValue(startAfterValue)],
        before: false,
      };
    }

    const results = await firestoreRequest(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
      'POST',
      queryBody
    );

    if (!Array.isArray(results)) return [];

    return results
      .filter((r: any) => r.document && r.document.fields)
      .map((r: any) => parseDocument(r.document))
      .filter(Boolean) as Record<string, any>[];
  }

  // Build query filters from a Prisma-style where clause
  // inequalityOnly: if true, only return inequality filters (gt, gte, lt, lte)
  // equalityOnly: if true, only return equality filters
  function buildFilters(whereClause?: Record<string, any>, options?: { equalityOnly?: boolean; inequalityOnly?: boolean }): Array<{ field: string; op: string; value: any }> {
    const filters: Array<{ field: string; op: string; value: any }> = [];

    if (!whereClause) return filters;

    for (const [key, value] of Object.entries(whereClause)) {
      if (value === undefined || value === null) continue;

      if (typeof value === 'object' && value !== null) {
        if ('in' in value && Array.isArray(value.in)) {
          if (!options?.inequalityOnly) {
            filters.push({ field: key, op: 'IN', value: value.in });
          }
        } else if ('not' in value) {
          if (!options?.inequalityOnly) {
            filters.push({ field: key, op: 'NOT_EQUAL', value: value.not });
          }
        } else if ('contains' in value) {
          if (!options?.inequalityOnly) {
            filters.push({ field: key, op: 'ARRAY_CONTAINS', value: value.contains });
          }
        } else if ('gt' in value) {
          if (!options?.equalityOnly) {
            filters.push({ field: key, op: 'GREATER_THAN', value: value.gt });
          }
        } else if ('gte' in value) {
          if (!options?.equalityOnly) {
            filters.push({ field: key, op: 'GREATER_THAN_OR_EQUAL', value: value.gte });
          }
        } else if ('lt' in value) {
          if (!options?.equalityOnly) {
            filters.push({ field: key, op: 'LESS_THAN', value: value.lt });
          }
        } else if ('lte' in value) {
          if (!options?.equalityOnly) {
            filters.push({ field: key, op: 'LESS_THAN_OR_EQUAL', value: value.lte });
          }
        }
      } else {
        if (!options?.inequalityOnly) {
          filters.push({ field: key, op: 'EQUAL', value });
        }
      }
    }

    return filters;
  }

  return {
    findUnique: async (args: {
      where: Record<string, any>;
      include?: Record<string, boolean | any>;
    }): Promise<Record<string, any> | null> => {
      const { where: w, include } = args;

      // Try by id first (direct document read)
      if (w.id) {
        try {
          const doc = await dedupedFirestoreRequest(`${name}/${w.id}`);
          if (!doc) return null;
          const data = parseDocument(doc);
          if (!data) return null;
          return resolveIncludes(data, include);
        } catch {
          return null;
        }
      }

      // Try by other unique fields using query
      for (const field of uniqueFields) {
        if (w[field] !== undefined) {
          try {
            const results = await runQuery(name, [
              { field, op: 'EQUAL', value: w[field] },
            ], undefined, 1);
            if (results.length === 0) return null;
            return resolveIncludes(results[0], include);
          } catch {
            return null;
          }
        }
      }

      return null;
    },

    findMany: async (args?: {
      where?: Record<string, any>;
      include?: Record<string, boolean | any>;
      orderBy?: Record<string, string> | Array<Record<string, string>>;
      skip?: number;
      take?: number;
    }): Promise<Record<string, any>[]> => {
      const { where: w, include, orderBy: ob, skip, take } = args || {};

      const allFilters = buildFilters(w);
      const orderByClause = ob
        ? (Array.isArray(ob) ? ob : [ob]).map(entry => {
            const [field, direction] = Object.entries(entry)[0];
            return { field, direction };
          })
        : undefined;

      const limitCount = (skip || 0) + (take || 1000);

      // Helper: process results (skip, take, include)
      const processResults = async (results: Record<string, any>[]): Promise<Record<string, any>[]> => {
        if (skip) {
          results = results.slice(skip);
        }
        if (take) {
          results = results.slice(0, take);
        }
        if (include) {
          results = await Promise.all(results.map(r => resolveIncludes(r, include)));
        }
        return results;
      };

      // Helper: in-memory sort matching Firestore orderBy semantics
      const sortInMemory = (results: Record<string, any>[]): Record<string, any>[] => {
        if (!orderByClause || orderByClause.length === 0) return results;
        return results.sort((a, b) => {
          for (const { field, direction } of orderByClause) {
            const aVal = a[field] ?? '';
            const bVal = b[field] ?? '';
            let cmp = 0;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
              cmp = aVal - bVal;
            } else {
              cmp = String(aVal).localeCompare(String(bVal));
            }
            if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
          }
          return 0;
        });
      };

      // Helper: apply inequality filters in-memory (for fallback)
      const applyInequalityFilters = (results: Record<string, any>[]): Record<string, any>[] => {
        if (!w) return results;
        const inequalityFilters = buildFilters(w, { inequalityOnly: true });
        return results.filter(doc => {
          for (const f of inequalityFilters) {
            const docVal = doc[f.field];
            if (docVal === undefined || docVal === null) return false;
            switch (f.op) {
              case 'GREATER_THAN':
                if (!(docVal > f.value)) return false;
                break;
              case 'GREATER_THAN_OR_EQUAL':
                if (!(docVal >= f.value)) return false;
                break;
              case 'LESS_THAN':
                if (!(docVal < f.value)) return false;
                break;
              case 'LESS_THAN_OR_EQUAL':
                if (!(docVal <= f.value)) return false;
                break;
            }
          }
          return true;
        });
      };

      // Attempt 1: Full query with all filters and orderBy
      try {
        let results = await runQuery(name, allFilters.length > 0 ? allFilters : undefined, orderByClause, limitCount);
        results = sortInMemory(results);
        return processResults(results);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        if (errMsg.includes('requires an index')) {
          // Attempt 2: Retry without orderBy (but keep all filters)
          console.warn(`[DB] Missing composite index for "${name}", retrying without orderBy`);
          try {
            let results = await runQuery(name, allFilters.length > 0 ? allFilters : undefined, undefined, limitCount);
            results = sortInMemory(results);
            return processResults(results);
          } catch (retryError) {
            const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);

            if (retryMsg.includes('requires an index')) {
              // Attempt 3: Retry with only equality filters (strip inequalities + orderBy)
              console.warn(`[DB] Still missing index for "${name}", retrying with equality filters only`);
              try {
                const equalityFilters = buildFilters(w, { equalityOnly: true });
                let results = await runQuery(name, equalityFilters.length > 0 ? equalityFilters : undefined, undefined, limitCount);
                // Apply inequality filters in-memory
                results = applyInequalityFilters(results);
                results = sortInMemory(results);
                return processResults(results);
              } catch (finalError) {
                console.error(`[DB] All retries failed for ${name}:`, finalError);
                return [];
              }
            }

            console.error(`[DB] Retry failed for ${name}:`, retryError);
            return [];
          }
        }

        console.error(`[DB] findMany error for ${name}:`, error);
        return [];
      }
    },

    findFirst: async (args?: {
      where?: Record<string, any>;
      include?: Record<string, boolean | any>;
      orderBy?: Record<string, string> | Array<Record<string, string>>;
    }): Promise<Record<string, any> | null> => {
      const { where: w, include, orderBy: ob } = args || {};

      const filters = buildFilters(w);
      const orderByClause = ob
        ? (Array.isArray(ob) ? ob : [ob]).map(entry => {
            const [field, direction] = Object.entries(entry)[0];
            return { field, direction };
          })
        : undefined;

      try {
        const results = await runQuery(name, filters.length > 0 ? filters : undefined, orderByClause, 1);
        if (results.length === 0) return null;
        return resolveIncludes(results[0], include);
      } catch {
        return null;
      }
    },

    create: async (args: {
      data: Record<string, any>;
    }): Promise<Record<string, any>> => {
      const { data } = args;
      const id = data.id || createId();
      const now = new Date().toISOString();

      const docData: Record<string, any> = {
        ...data,
        createdAt: data.createdAt || now,
        updatedAt: data.updatedAt || now,
      };

      const { id: _, ...firestoreData } = docData;
      const fields = toFirestoreFields(firestoreData);

      await firestoreRequest(`${name}/${id}`, 'PATCH', { fields });

      return { id, ...firestoreData };
    },

    update: async (args: {
      where: Record<string, any>;
      data: Record<string, any>;
    }): Promise<Record<string, any>> => {
      const { where: w, data } = args;

      let docId = w.id;

      // If not searching by id, find the document first
      if (!docId) {
        for (const field of uniqueFields) {
          if (w[field] !== undefined) {
            try {
              const results = await runQuery(name, [
                { field, op: 'EQUAL', value: w[field] },
              ], undefined, 1);
              if (results.length > 0) {
                docId = results[0].id;
                break;
              }
            } catch {
              // Continue to next field
            }
          }
        }
      }

      if (!docId) {
        throw new Error(`Document not found in ${name} with where: ${JSON.stringify(w)}`);
      }

      const updateData: Record<string, any> = {
        ...data,
        updatedAt: new Date().toISOString(),
      };

      const fields = toFirestoreFields(updateData);
      const maskParams = Object.keys(updateData).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');

      await firestoreRequest(`${name}/${docId}?${maskParams}`, 'PATCH', { fields });

      // Return the updated document
      const doc = await dedupedFirestoreRequest(`${name}/${docId}`);
      return parseDocument(doc) || { id: docId, ...updateData };
    },

    delete: async (args: {
      where: Record<string, any>;
    }): Promise<Record<string, any>> => {
      const { where: w } = args;

      let docId = w.id;

      if (!docId) {
        for (const field of uniqueFields) {
          if (w[field] !== undefined) {
            try {
              const results = await runQuery(name, [
                { field, op: 'EQUAL', value: w[field] },
              ], undefined, 1);
              if (results.length > 0) {
                docId = results[0].id;
                break;
              }
            } catch {
              // Continue
            }
          }
        }
      }

      if (!docId) {
        throw new Error(`Document not found in ${name} with where: ${JSON.stringify(w)}`);
      }

      // Get the document data before deleting
      const doc = await dedupedFirestoreRequest(`${name}/${docId}`);
      const data = parseDocument(doc) || { id: docId };

      await firestoreRequest(`${name}/${docId}`, 'DELETE');

      return data;
    },

    count: async (args?: {
      where?: Record<string, any>;
    }): Promise<number> => {
      const { where: w } = args || {};
      const filters = buildFilters(w);

      try {
        // Firestore doesn't have a native count in REST API
        // We need to fetch all matching documents and count them
        const results = await runQuery(name, filters.length > 0 ? filters : undefined, undefined, 10000);
        return results.length;
      } catch {
        return 0;
      }
    },

    upsert: async (args: {
      where: Record<string, any>;
      create: Record<string, any>;
      update: Record<string, any>;
    }): Promise<Record<string, any>> => {
      const { where: w, create: createData, update: updateData } = args;

      // Try to find existing document
      let existing: Record<string, any> | null = null;

      if (w.id) {
        try {
          const doc = await dedupedFirestoreRequest(`${name}/${w.id}`);
          if (doc) {
            existing = parseDocument(doc);
          }
        } catch {
          // Document doesn't exist
        }
      }

      if (!existing) {
        for (const field of uniqueFields) {
          if (w[field] !== undefined) {
            try {
              const results = await runQuery(name, [
                { field, op: 'EQUAL', value: w[field] },
              ], undefined, 1);
              if (results.length > 0) {
                existing = results[0];
                break;
              }
            } catch {
              // Continue
            }
          }
        }
      }

      if (existing) {
        // Update existing
        const updatePayload: Record<string, any> = {
          ...updateData,
          updatedAt: new Date().toISOString(),
        };

        const fields = toFirestoreFields(updatePayload);
        const maskParams = Object.keys(updatePayload).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');

        await firestoreRequest(`${name}/${existing.id}?${maskParams}`, 'PATCH', { fields });

        // Return updated document
        const doc = await dedupedFirestoreRequest(`${name}/${existing.id}`);
        return parseDocument(doc) || { id: existing.id, ...existing, ...updatePayload };
      } else {
        // Create new
        const id = createData.id || createId();
        const now = new Date().toISOString();
        const docData: Record<string, any> = {
          ...createData,
          createdAt: createData.createdAt || now,
          updatedAt: createData.updatedAt || now,
        };
        const { id: _, ...firestoreData } = docData;
        const fields = toFirestoreFields(firestoreData);

        await firestoreRequest(`${name}/${id}`, 'PATCH', { fields });

        return { id, ...firestoreData };
      }
    },

    createMany: async (args: {
      data: Record<string, any>[];
    }): Promise<{ count: number }> => {
      const now = new Date().toISOString();

      for (const item of args.data) {
        const id = item.id || createId();
        const docData: Record<string, any> = {
          ...item,
          createdAt: item.createdAt || now,
          updatedAt: item.updatedAt || now,
        };
        const { id: _, ...firestoreData } = docData;
        const fields = toFirestoreFields(firestoreData);

        await firestoreRequest(`${name}/${id}`, 'PATCH', { fields });
      }

      return { count: args.data.length };
    },

    updateMany: async (args: {
      where: Record<string, any>;
      data: Record<string, any>;
    }): Promise<{ count: number }> => {
      const filters = buildFilters(args.where);

      try {
        const results = await runQuery(name, filters.length > 0 ? filters : undefined, undefined, 10000);
        if (results.length === 0) return { count: 0 };

        const updateData: Record<string, any> = {
          ...args.data,
          updatedAt: new Date().toISOString(),
        };

        const fields = toFirestoreFields(updateData);
        const maskParams = Object.keys(updateData).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');

        for (const doc of results) {
          await firestoreRequest(`${name}/${doc.id}?${maskParams}`, 'PATCH', { fields });
        }

        return { count: results.length };
      } catch {
        return { count: 0 };
      }
    },

    deleteMany: async (args?: {
      where?: Record<string, any>;
    }): Promise<{ count: number }> => {
      const filters = buildFilters(args?.where);

      try {
        const results = await runQuery(name, filters.length > 0 ? filters : undefined, undefined, 10000);
        if (results.length === 0) return { count: 0 };

        for (const doc of results) {
          await firestoreRequest(`${name}/${doc.id}`, 'DELETE');
        }

        return { count: results.length };
      } catch {
        return { count: 0 };
      }
    },
  };
}

// ============================================================
// Create all model adapters with their unique fields and relations
// ============================================================

export const db = {
  user: createModel('users', ['email', 'uid'], {
    department: {
      type: 'one',
      collection: 'departments',
      foreignKey: 'id',
      localKey: 'departmentId',
    },
    schedules: {
      type: 'many',
      collection: 'schedules',
      foreignKey: 'facultyId',
    },
    preferences: {
      type: 'many',
      collection: 'facultyPreferences',
      foreignKey: 'facultyId',
    },
    notifications: {
      type: 'many',
      collection: 'notifications',
      foreignKey: 'userId',
    },
    scheduleLogs: {
      type: 'many',
      collection: 'scheduleLogs',
      foreignKey: 'modifiedBy',
    },
    auditLogs: {
      type: 'many',
      collection: 'auditLogs',
      foreignKey: 'userId',
    },
    scheduleResponses: {
      type: 'many',
      collection: 'scheduleResponses',
      foreignKey: 'facultyId',
    },
  }),

  department: createModel('departments', ['name'], {
    users: {
      type: 'many',
      collection: 'users',
      foreignKey: 'departmentId',
    },
    subjects: {
      type: 'many',
      collection: 'subjects',
      foreignKey: 'departmentId',
    },
    sections: {
      type: 'many',
      collection: 'sections',
      foreignKey: 'departmentId',
    },
  }),

  subject: createModel('subjects', ['subjectCode'], {
    department: {
      type: 'one',
      collection: 'departments',
      foreignKey: 'id',
      localKey: 'departmentId',
    },
    schedules: {
      type: 'many',
      collection: 'schedules',
      foreignKey: 'subjectId',
    },
  }),

  room: createModel('rooms', ['roomName'], {
    schedules: {
      type: 'many',
      collection: 'schedules',
      foreignKey: 'roomId',
    },
  }),

  section: createModel('sections', ['sectionName'], {
    department: {
      type: 'one',
      collection: 'departments',
      foreignKey: 'id',
      localKey: 'departmentId',
    },
    schedules: {
      type: 'many',
      collection: 'schedules',
      foreignKey: 'sectionId',
    },
  }),

  schedule: createModel('schedules', [], {
    subject: {
      type: 'one',
      collection: 'subjects',
      foreignKey: 'id',
      localKey: 'subjectId',
    },
    faculty: {
      type: 'one',
      collection: 'users',
      foreignKey: 'id',
      localKey: 'facultyId',
    },
    section: {
      type: 'one',
      collection: 'sections',
      foreignKey: 'id',
      localKey: 'sectionId',
    },
    room: {
      type: 'one',
      collection: 'rooms',
      foreignKey: 'id',
      localKey: 'roomId',
    },
    logs: {
      type: 'many',
      collection: 'scheduleLogs',
      foreignKey: 'scheduleId',
    },
    response: {
      type: 'many',
      collection: 'scheduleResponses',
      foreignKey: 'scheduleId',
    },
  }),

  scheduleResponse: createModel('scheduleResponses', ['scheduleId'], {
    schedule: {
      type: 'one',
      collection: 'schedules',
      foreignKey: 'id',
      localKey: 'scheduleId',
    },
    faculty: {
      type: 'one',
      collection: 'users',
      foreignKey: 'id',
      localKey: 'facultyId',
    },
  }),

  facultyPreference: createModel('facultyPreferences', ['facultyId'], {
    faculty: {
      type: 'one',
      collection: 'users',
      foreignKey: 'id',
      localKey: 'facultyId',
    },
  }),

  notification: createModel('notifications', [], {
    user: {
      type: 'one',
      collection: 'users',
      foreignKey: 'id',
      localKey: 'userId',
    },
  }),

  scheduleLog: createModel('scheduleLogs', [], {
    schedule: {
      type: 'one',
      collection: 'schedules',
      foreignKey: 'id',
      localKey: 'scheduleId',
    },
    user: {
      type: 'one',
      collection: 'users',
      foreignKey: 'id',
      localKey: 'modifiedBy',
    },
  }),

  conflict: createModel('conflicts', [], {}),

  auditLog: createModel('auditLogs', [], {
    user: {
      type: 'one',
      collection: 'users',
      foreignKey: 'id',
      localKey: 'userId',
    },
  }),

  systemSetting: createModel('systemSettings', ['key'], {}),
};
