export type DocumentReference =
  | { kind: 'workspace-file'; workspaceId: string; filePath: string }
  | { kind: 'local-file'; fileId: string }
  | { kind: 'remote'; url: string }
  | { kind: 'imported'; sessionId: string };

export interface NavigationTarget {
  document: DocumentReference;
  fragment?: string;
  scrollPosition?: number;
}

export interface QuireHistoryState {
  version: 1;
  target: NavigationTarget;
}

export function isNavigationTarget(value: unknown): value is NavigationTarget {
  if (!value || typeof value !== 'object') return false;
  const document = (value as NavigationTarget).document;
  if (!document || typeof document !== 'object' || typeof document.kind !== 'string') return false;
  if (document.kind === 'workspace-file') return typeof document.workspaceId === 'string' && typeof document.filePath === 'string';
  if (document.kind === 'local-file') return typeof document.fileId === 'string';
  if (document.kind === 'remote') return typeof document.url === 'string';
  return document.kind === 'imported' && typeof document.sessionId === 'string';
}
