// =============================================================
// TCU Scheduling System - Firestore REST API Database Adapter
// =============================================================
// IMPORTANT: This is the ONLY database adapter used by this app.
//
// - Database: Firebase Firestore (project: for-commission)
// - Access method: REST API (no gRPC dependency)
// - Authentication: Firebase Auth (email/password)
// - Provides: Prisma-compatible API (findUnique, findMany, etc.)
//
// Prisma Client is NOT used at runtime. The DATABASE_URL env var
// is irrelevant to this adapter. All data flows through Firestore.
//
// To modify the data model, update BOTH:
//   1. prisma/schema.prisma (documentation only)
//   2. This file's model definitions at the bottom
// =============================================================

import {
  FIREBASE_PROJECT_ID,
  FIREBASE_API_KEY,
  FIREBASE_SERVICE_EMAIL,
  FIREBASE_SERVICE_PASSWORD,
} from './firebase';

// ============================================================
// Firestore REST API Client
// ============================================================

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

// Cached auth token
let cachedToken: string | null = null;
let tokenExpiry = 0;

// Connection status tracking
let connectionValidated = false;
let lastValidationError: string | null = null;

async function getAuthToken(): Promise<string | null> {
  // Return cached token if still valid (tokens last 1 hour, refresh at 50 min)
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: FIREBASE_SERVICE_EMAIL,
        password: FIREBASE_SERVICE_PASSWORD,
        returnSecureToken: true,
      }),
    });

    const data = await response.json();
    if (data.idToken) {
      cachedToken = data.idToken;
      // Firebase ID tokens expire in 1 hour (3600s), refresh at 50 minutes
      tokenExpiry = Date.now() + 50 * 60 * 1000;
      
      if (!connectionValidated) {
        connectionValidated = true;
        lastValidationError = null;
        console.log('[Firestore] ✅ Connected to Firebase Firestore (project: ' + FIREBASE_PROJECT_ID + ')');
      }
      
      return cachedToken;
    }
    
    const errorMsg = data.error?.message || 'Unknown error';
    console.warn('[Firestore] ❌ Auth failed:', errorMsg);
    lastValidationError = errorMsg;
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('[Firestore] ❌ Auth error:', errorMsg);
    lastValidationError = errorMsg;
    return null;
  }
}

// ============================================================
// Firestore Connection Validation
// ============================================================

/**
 * Validates the Firestore connection by attempting to authenticate.
 * Call this on server startup to ensure Firebase credentials are valid.
 */
export async function validateFirestoreConnection(): Promise<{ 
  connected: boolean; 
  project: string; 
  error?: string 
}> {
  try {
    const token = await getAuthToken();
    if (token) {
      // Try a lightweight read to verify Firestore access
      const response = await fetch(
        `${FIRESTORE_BASE}/systemSettings?pageSize=1`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      
      // 200 = OK, 404 = collection doesn't exist yet but auth works
      if (response.status === 200 || response.status === 404) {
        connectionValidated = true;
        return { connected: true, project: FIREBASE_PROJECT_ID };
      }
      
      const data = await response.json().catch(() => ({}));
      const errorMsg = data.error?.message || `HTTP ${response.status}`;
      return { connected: false, project: FIREBASE_PROJECT_ID, error: errorMsg };
    }
    
    return { 
      connected: false, 
      project: FIREBASE_PROJECT_ID, 
      error: lastValidationError || 'Authentication failed - check FIREBASE_SERVICE_EMAIL and FIREBASE_SERVICE_PASSWORD in .env'
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
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

// Make authenticated request to Firestore REST API
async function firestoreRequest(path: string, method: string = 'GET', body?: any): Promise<any> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = path.startsWith('http') ? path : `${FIRESTORE_BASE}/${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 404) {
    return null;
  }

  const data = await response.json();
  if (response.status >= 400) {
    throw new Error(`Firestore REST error ${response.status}: ${data.error?.message || JSON.stringify(data)}`);
  }

  return data;
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
  // Resolve includes (fetch related documents)
  async function resolveIncludes(
    data: Record<string, any>,
    include?: Record<string, boolean | any>
  ): Promise<Record<string, any>> {
    if (!include) return data;

    const result = { ...data };

    await Promise.all(
      Object.entries(include).map(async ([key, val]) => {
        const relation = relations[key];
        if (!relation) return;

        try {
          if (relation.type === 'one' && relation.localKey) {
            const foreignId = data[relation.localKey];
            if (foreignId) {
              const doc = await firestoreRequest(`${relation.collection}/${foreignId}`);
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
  function buildFilters(whereClause?: Record<string, any>): Array<{ field: string; op: string; value: any }> {
    const filters: Array<{ field: string; op: string; value: any }> = [];

    if (!whereClause) return filters;

    for (const [key, value] of Object.entries(whereClause)) {
      if (value === undefined || value === null) continue;

      if (typeof value === 'object' && value !== null) {
        if ('in' in value && Array.isArray(value.in)) {
          // Firestore REST doesn't support IN directly in fieldFilter
          // We'll handle this differently - for now use the first value
          // This is a simplified implementation
          filters.push({ field: key, op: 'IN', value: value.in });
        } else if ('not' in value) {
          filters.push({ field: key, op: 'NOT_EQUAL', value: value.not });
        } else if ('contains' in value) {
          filters.push({ field: key, op: 'ARRAY_CONTAINS', value: value.contains });
        } else if ('gt' in value) {
          filters.push({ field: key, op: 'GREATER_THAN', value: value.gt });
        } else if ('gte' in value) {
          filters.push({ field: key, op: 'GREATER_THAN_OR_EQUAL', value: value.gte });
        } else if ('lt' in value) {
          filters.push({ field: key, op: 'LESS_THAN', value: value.lt });
        } else if ('lte' in value) {
          filters.push({ field: key, op: 'LESS_THAN_OR_EQUAL', value: value.lte });
        }
      } else {
        filters.push({ field: key, op: 'EQUAL', value });
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
          const doc = await firestoreRequest(`${name}/${w.id}`);
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

      const filters = buildFilters(w);
      const orderByClause = ob
        ? (Array.isArray(ob) ? ob : [ob]).map(entry => {
            const [field, direction] = Object.entries(entry)[0];
            return { field, direction };
          })
        : undefined;

      const limitCount = (skip || 0) + (take || 1000);

      try {
        let results = await runQuery(name, filters.length > 0 ? filters : undefined, orderByClause, limitCount);

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
      } catch (error) {
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
      const doc = await firestoreRequest(`${name}/${docId}`);
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
      const doc = await firestoreRequest(`${name}/${docId}`);
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
          const doc = await firestoreRequest(`${name}/${w.id}`);
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
        const doc = await firestoreRequest(`${name}/${existing.id}`);
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
