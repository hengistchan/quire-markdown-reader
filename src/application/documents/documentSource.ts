import type { ImportedDocument, RemoteDocumentState, WorkspaceFile, WorkspaceSnapshot } from '../../shared/types';
import type { ResolvedAsset } from './documentResource';

export type DocumentSourceKind = 'imported' | 'local-file' | 'workspace-file' | 'remote' | 'active-tab';

export interface DocumentIdentity {
  sourceKind: DocumentSourceKind;
  stableId: string;
  displayName: string;
}

export interface DocumentMetadata {
  sourceUrl?: string;
  lastModified?: number;
  size?: number;
  etag?: string;
  remoteLastModified?: string;
}

export interface DocumentSnapshot {
  identity: DocumentIdentity;
  title: string;
  markdown: string;
  format: 'markdown' | 'plain-text';
  metadata: DocumentMetadata;
  remoteState?: RemoteDocumentState;
}

export type DocumentRefreshResult =
  | { changed: false; snapshot: DocumentSnapshot }
  | { changed: true; snapshot: DocumentSnapshot };

export type LinkResolution =
  | { type: 'fragment'; fragment: string }
  | { type: 'workspace-document'; path: string; fragment?: string }
  | { type: 'remote-document'; url: string; fragment?: string }
  | { type: 'external'; url: string }
  | { type: 'invalid' };

export interface DocumentSource {
  readonly identity: DocumentIdentity;
  load(signal?: AbortSignal): Promise<DocumentSnapshot>;
  refresh(previous: DocumentSnapshot, signal?: AbortSignal): Promise<DocumentRefreshResult>;
  resolveAsset(href: string, signal?: AbortSignal): Promise<ResolvedAsset>;
  resolveLink(href: string): LinkResolution;
  dispose(): void;
}

export interface DocumentSourceFactory {
  createImported(document: ImportedDocument): DocumentSource;
  createLocalFile(file: WorkspaceFile): DocumentSource;
  createWorkspaceFile(workspace: WorkspaceSnapshot, file: WorkspaceFile): DocumentSource;
  createRemote(url: string): DocumentSource;
}
