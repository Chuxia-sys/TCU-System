import fs from 'fs';
import path from 'path';

export type FirestoreIndexField = {
  fieldPath: string;
  order: 'ASCENDING' | 'DESCENDING';
};

export type FirestoreIndexDefinition = {
  collectionGroup: string;
  queryScope: 'Collection';
  fields: FirestoreIndexField[];
};

function getIndexesFilePath(): string {
  return path.join(process.cwd(), 'firestore.indexes.json');
}

function normalizeIndexDefinition(index: FirestoreIndexDefinition): FirestoreIndexDefinition {
  return {
    collectionGroup: index.collectionGroup,
    queryScope: 'Collection',
    fields: [...index.fields],
  };
}

function areIndexFieldsEqual(a: FirestoreIndexField[], b: FirestoreIndexField[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((field, index) => field.fieldPath === b[index].fieldPath && field.order === b[index].order);
}

export class FirestoreIndexManager {
  private indexes: FirestoreIndexDefinition[] = [];
  private loaded = false;
  private dirty = false;

  constructor() {
    this.loadIndexes();
  }

  private loadIndexes(): void {
    const filePath = getIndexesFilePath();
    if (!fs.existsSync(filePath)) {
      this.indexes = [];
      this.loaded = true;
      return;
    }

    try {
      const contents = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(contents);
      this.indexes = Array.isArray(parsed.indexes) ? parsed.indexes : [];
      this.loaded = true;
    } catch (error) {
      console.warn('[IndexManager] Failed to read firestore.indexes.json, starting empty:', error instanceof Error ? error.message : error);
      this.indexes = [];
      this.loaded = true;
    }
  }

  getIndexes(): FirestoreIndexDefinition[] {
    if (!this.loaded) {
      this.loadIndexes();
    }
    return this.indexes;
  }

  registerIndex(index: FirestoreIndexDefinition): void {
    const normalized = normalizeIndexDefinition(index);
    const exists = this.indexes.some(existing =>
      existing.collectionGroup === normalized.collectionGroup &&
      areIndexFieldsEqual(existing.fields, normalized.fields)
    );

    if (exists) {
      return;
    }

    this.indexes.push(normalized);
    this.dirty = true;
    this.saveIndexes();
    console.log('[IndexManager] Registered new index:', JSON.stringify(normalized));
  }

  registerIndexForQuery(options: {
    collection: string;
    where?: Record<string, any>;
    orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  }): void {
    const { collection, where, orderBy } = options;
    const fields: FirestoreIndexField[] = [];

    if (where) {
      const filterKeys = Object.keys(where).filter((key) => where[key] !== undefined && where[key] !== null);
      for (const fieldPath of filterKeys.sort()) {
        fields.push({ fieldPath, order: 'ASCENDING' });
      }
    }

    if (orderBy) {
      for (const sortField of orderBy) {
        if (!fields.some((field) => field.fieldPath === sortField.field)) {
          fields.push({
            fieldPath: sortField.field,
            order: sortField.direction.toUpperCase() === 'DESC' ? 'DESCENDING' : 'ASCENDING',
          });
        }
      }
    }

    if (fields.length === 0) {
      return;
    }

    fields.push({ fieldPath: '__name__', order: 'ASCENDING' });

    this.registerIndex({
      collectionGroup: collection,
      queryScope: 'Collection',
      fields,
    });
  }

  parseFirestoreError(error: unknown): { collection: string; fields?: FirestoreIndexField[] } | null {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('query requires an index') && !message.includes('FAILED_PRECONDITION')) {
      return null;
    }

    const lower = message.toLowerCase();
    const collectionMatch = /collectiongroups\/([a-zA-Z0-9_-]+)/i.exec(message) || /collection '([^']+)'/i.exec(message);
    const collection = collectionMatch ? collectionMatch[1] : 'unknown';

    const fields: FirestoreIndexField[] = [];
    const orderExpression = /fields=([^&]+)/i.exec(message);
    if (orderExpression) {
      const decoded = decodeURIComponent(orderExpression[1]);
      const pairs = decoded.split(',');
      for (const pair of pairs) {
        const [path, dir] = pair.split(':');
        if (!path) continue;
        fields.push({
          fieldPath: path,
          order: dir?.toUpperCase() === 'DESC' ? 'DESCENDING' : 'ASCENDING',
        });
      }
    }

    return { collection, fields: fields.length ? fields : undefined };
  }

  saveIndexes(): void {
    if (!this.dirty) {
      return;
    }

    const filePath = getIndexesFilePath();
    try {
      const content = JSON.stringify({ indexes: this.indexes }, null, 2);
      fs.writeFileSync(filePath, content, 'utf-8');
      this.dirty = false;
    } catch (error) {
      console.warn('[IndexManager] Failed to save firestore.indexes.json:', error instanceof Error ? error.message : error);
    }
  }

  logStatus(): void {
    console.log('[IndexManager] index count:', this.indexes.length);
    for (const index of this.indexes.slice(0, 10)) {
      console.log(`  ${index.collectionGroup} -> ${index.fields.map((f) => `${f.fieldPath}:${f.order}`).join(', ')}`);
    }
  }
}

export const indexManager = new FirestoreIndexManager();
