import type { DocumentHandoff, ImportedDocument } from '../shared/types';
import type { HandoffRepository } from '../application/ports/handoffRepository';

const DATABASE = 'quire-document-handoffs';
const STORE = 'handoffs';
const DATABASE_VERSION = 1;
export const DOCUMENT_HANDOFF_TTL_MS = 10 * 60 * 1000;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open document handoff storage.'));
  });
}

function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function isExpired(handoff: DocumentHandoff, now: number): boolean {
  return handoff.createdAt + DOCUMENT_HANDOFF_TTL_MS <= now;
}

export async function cleanupExpiredDocumentHandoffs(now = Date.now()): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const request = transaction.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (isExpired(cursor.value as DocumentHandoff, now)) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clean document handoffs.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Document handoff cleanup was aborted.'));
  });
}

export async function createDocumentHandoff(
  document: ImportedDocument,
  options: { id?: string; now?: number } = {},
): Promise<string> {
  const now = options.now ?? Date.now();
  const handoff: DocumentHandoff = {
    id: options.id ?? createId(),
    document,
    createdAt: now,
  };
  await cleanupExpiredDocumentHandoffs(now);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(handoff);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save document handoff.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Document handoff save was aborted.'));
  });
  return handoff.id;
}

export async function takeDocumentHandoff(id: string, now = Date.now()): Promise<ImportedDocument | undefined> {
  if (!id) return undefined;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get(id);
    let result: ImportedDocument | undefined;
    request.onsuccess = () => {
      const handoff = request.result as DocumentHandoff | undefined;
      if (handoff && !isExpired(handoff, now)) result = handoff.document;
      store.delete(id);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not take document handoff.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Document handoff read was aborted.'));
  });
}

export class IndexedDBHandoffRepository implements HandoffRepository {
  take(id: string): Promise<ImportedDocument | undefined> {
    return takeDocumentHandoff(id);
  }
}
