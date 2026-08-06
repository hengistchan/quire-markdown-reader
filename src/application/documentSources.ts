import { readWorkspaceFileSnapshot } from '../core/files';
import { fetchRemoteMarkdown } from '../core/remote';
import type { ImportedDocument, RemoteDocumentState, WorkspaceFile } from '../shared/types';

export type DocumentSourceKind = 'imported' | 'file' | 'workspace' | 'remote';

export interface DocumentSnapshot {
  title: string;
  markdown: string;
  sourceUrl?: string;
  lastModified?: number;
  size?: number;
  remoteState?: RemoteDocumentState;
}

export interface DocumentRefreshResult {
  changed: boolean;
  snapshot: DocumentSnapshot;
}

export interface DocumentSourceAdapter {
  readonly kind: DocumentSourceKind;
  load(signal?: AbortSignal): Promise<DocumentSnapshot>;
  refresh?(previous: DocumentSnapshot, signal?: AbortSignal): Promise<DocumentRefreshResult>;
  resolveAsset?(href: string): Promise<string | undefined>;
  dispose?(): void;
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The document load was cancelled.', 'AbortError');
}

export function createImportedDocumentSource(document: ImportedDocument): DocumentSourceAdapter {
  return {
    kind: 'imported',
    async load(signal) {
      assertNotCancelled(signal);
      return { ...document, markdown: document.markdown };
    },
  };
}

export function createFileDocumentSource(file: WorkspaceFile, kind: 'file' | 'workspace'): DocumentSourceAdapter {
  const load = async (signal?: AbortSignal): Promise<DocumentSnapshot> => {
    assertNotCancelled(signal);
    const snapshot = await readWorkspaceFileSnapshot(file);
    assertNotCancelled(signal);
    return { title: file.name, markdown: snapshot.markdown, lastModified: snapshot.lastModified, size: snapshot.size };
  };
  return {
    kind,
    load,
    async refresh(previous, signal) {
      assertNotCancelled(signal);
      const nextFile = await file.handle.getFile();
      assertNotCancelled(signal);
      if (nextFile.lastModified === previous.lastModified && nextFile.size === previous.size) {
        return { changed: false, snapshot: previous };
      }
      const snapshot = {
        title: file.name,
        markdown: await nextFile.text(),
        lastModified: nextFile.lastModified,
        size: nextFile.size,
      };
      assertNotCancelled(signal);
      return { changed: true, snapshot };
    },
  };
}

export function createRemoteDocumentSource(
  url: string,
  fetcher: typeof fetch = fetch,
): DocumentSourceAdapter {
  return {
    kind: 'remote',
    async load(signal) {
      const result = await fetchRemoteMarkdown(url, undefined, fetcher, { signal });
      if (!result.document) throw new Error('A new remote load must return a document.');
      return { ...result.document, remoteState: result.state };
    },
    async refresh(previous, signal) {
      const priorState = previous.remoteState ?? { url };
      const result = await fetchRemoteMarkdown(priorState.url, priorState, fetcher, { signal });
      if (!result.document) return { changed: false, snapshot: previous };
      return {
        changed: true,
        snapshot: { ...result.document, remoteState: result.state },
      };
    },
  };
}
