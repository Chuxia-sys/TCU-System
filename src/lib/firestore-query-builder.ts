import { FirestoreIndexDefinition, FirestoreIndexField } from './firestore-index-manager';

export type QueryOrderBy = {
  field: string;
  direction: 'asc' | 'desc';
};

export type FirestoreQueryDescriptor = {
  collection: string;
  where?: Record<string, any>;
  orderBy?: QueryOrderBy[];
  limit?: number;
  label?: string;
};

export function buildCacheKey(descriptor: FirestoreQueryDescriptor): string {
  const normalizedWhere = descriptor.where ? JSON.stringify(sortedObject(descriptor.where)) : '{}';
  const normalizedOrderBy = descriptor.orderBy
    ? descriptor.orderBy.map((order) => `${order.field}:${order.direction}`).join(',')
    : 'none';
  const normalizedLimit = descriptor.limit != null ? descriptor.limit : 'none';
  const label = descriptor.label ? `:${descriptor.label}` : '';

  return `firestore:${descriptor.collection}:${normalizedWhere}:${normalizedOrderBy}:${normalizedLimit}${label}`;
}

export function inferIndexDefinition(descriptor: FirestoreQueryDescriptor): FirestoreIndexDefinition | null {
  const fields: FirestoreIndexField[] = [];

  if (descriptor.where) {
    const whereKeys = Object.keys(descriptor.where).filter((key) => descriptor.where[key] !== undefined && descriptor.where[key] !== null).sort();
    for (const fieldPath of whereKeys) {
      fields.push({ fieldPath, order: 'ASCENDING' });
    }
  }

  if (descriptor.orderBy) {
    for (const order of descriptor.orderBy) {
      if (!fields.some((field) => field.fieldPath === order.field)) {
        fields.push({ fieldPath: order.field, order: order.direction === 'desc' ? 'DESCENDING' : 'ASCENDING' });
      }
    }
  }

  if (fields.length === 0) {
    return null;
  }

  fields.push({ fieldPath: '__name__', order: 'ASCENDING' });

  return {
    collectionGroup: descriptor.collection,
    queryScope: 'Collection',
    fields,
  };
}

function sortedObject(obj: Record<string, any>): Record<string, any> {
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, any>>((acc, key) => {
      const value = obj[key];
      acc[key] = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? sortedObject(value)
        : value;
      return acc;
    }, {});
}
