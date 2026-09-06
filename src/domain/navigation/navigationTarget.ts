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

export interface LegacyQuireHistoryState {
  version: 1;
  target: NavigationTarget;
}

export interface LegacyIndexedQuireHistoryState {
  version: 2;
  index: number;
  target?: NavigationTarget;
}

export interface QuireHistoryState {
  version: 3;
  index: number;
  maxIndex: number;
  target?: NavigationTarget;
}

export function isNavigationTarget(value: unknown): value is NavigationTarget {
  if (!value || typeof value !== 'object') return false;
  const document = (value as NavigationTarget).document;
  if (!document || typeof document !== 'object' || typeof document.kind !== 'string') return false;
  if (document.kind === 'workspace-file')
    return typeof document.workspaceId === 'string' && typeof document.filePath === 'string';
  if (document.kind === 'local-file') return typeof document.fileId === 'string';
  if (document.kind === 'remote') return typeof document.url === 'string';
  return document.kind === 'imported' && typeof document.sessionId === 'string';
}

export function sameNavigationTarget(left: NavigationTarget | undefined, right: NavigationTarget): boolean {
  if (!left || left.fragment !== right.fragment || left.scrollPosition !== right.scrollPosition) return false;
  if (left.document.kind !== right.document.kind) return false;
  if (left.document.kind === 'workspace-file' && right.document.kind === 'workspace-file') {
    return (
      left.document.workspaceId === right.document.workspaceId && left.document.filePath === right.document.filePath
    );
  }
  if (left.document.kind === 'local-file' && right.document.kind === 'local-file') {
    return left.document.fileId === right.document.fileId;
  }
  if (left.document.kind === 'remote' && right.document.kind === 'remote') {
    return left.document.url === right.document.url;
  }
  return (
    left.document.kind === 'imported' &&
    right.document.kind === 'imported' &&
    left.document.sessionId === right.document.sessionId
  );
}
