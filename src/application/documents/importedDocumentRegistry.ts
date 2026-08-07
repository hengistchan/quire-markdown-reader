import type { ImportedDocument } from '../../shared/types';

export interface ImportedDocumentRegistry {
  put(document: ImportedDocument, sessionId?: string): string;
  get(sessionId: string): ImportedDocument | undefined;
  remove(sessionId: string): void;
  clear(): void;
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export class MemoryImportedDocumentRegistry implements ImportedDocumentRegistry {
  private readonly documents = new Map<string, ImportedDocument>();

  put(document: ImportedDocument, sessionId = createSessionId()): string {
    this.documents.set(sessionId, document);
    return sessionId;
  }

  get(sessionId: string): ImportedDocument | undefined {
    return this.documents.get(sessionId);
  }

  remove(sessionId: string): void {
    this.documents.delete(sessionId);
  }

  clear(): void {
    this.documents.clear();
  }
}
