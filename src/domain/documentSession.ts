import type {
  ImportedDocument, RemoteDocumentState, WorkspaceFile, WorkspaceSnapshot,
} from '../shared/types';

interface DocumentContent {
  title: string;
  markdown: string;
}

export interface WelcomeDocumentSession extends DocumentContent {
  kind: 'welcome';
}

export interface ImportedDocumentSession extends DocumentContent {
  kind: 'imported';
  sourceUrl?: string;
  format: 'markdown' | 'plain-text';
}

export interface FileDocumentSession extends DocumentContent {
  kind: 'file';
  file: WorkspaceFile;
  lastModified: number;
  size: number;
}

export interface WorkspaceDocumentSession extends DocumentContent {
  kind: 'workspace';
  workspace: WorkspaceSnapshot;
  file: WorkspaceFile;
  lastModified: number;
  size: number;
}

export interface RemoteDocumentSession extends DocumentContent {
  kind: 'remote';
  state: RemoteDocumentState;
}

export type DocumentSession =
  | WelcomeDocumentSession
  | ImportedDocumentSession
  | FileDocumentSession
  | WorkspaceDocumentSession
  | RemoteDocumentSession;

export type DocumentSessionAction =
  | { type: 'replace'; session: DocumentSession }
  | { type: 'localize-welcome'; title: string; markdown: string }
  | { type: 'refresh-local'; markdown: string; lastModified: number; size: number }
  | { type: 'refresh-remote'; document?: ImportedDocument; state: RemoteDocumentState };

export function displayDocumentTitle(value: string): string {
  return value.replace(/\.(md|markdown|mdx)$/i, '');
}

export function createWelcomeSession(title: string, markdown: string): WelcomeDocumentSession {
  return { kind: 'welcome', title, markdown };
}

export function createImportedSession(document: ImportedDocument): ImportedDocumentSession {
  return {
    kind: 'imported',
    title: displayDocumentTitle(document.title),
    markdown: document.markdown,
    sourceUrl: document.sourceUrl,
    format: document.format ?? 'markdown',
  };
}

export function createFileSession(file: WorkspaceFile, markdown: string, lastModified: number, size: number): FileDocumentSession {
  return { kind: 'file', title: displayDocumentTitle(file.name), markdown, file, lastModified, size };
}

export function createWorkspaceSession(workspace: WorkspaceSnapshot, file: WorkspaceFile, markdown: string, lastModified: number, size: number): WorkspaceDocumentSession {
  return { kind: 'workspace', title: displayDocumentTitle(file.name), markdown, workspace, file, lastModified, size };
}

export function createRemoteSession(document: ImportedDocument, state: RemoteDocumentState): RemoteDocumentSession {
  return { kind: 'remote', title: displayDocumentTitle(document.title), markdown: document.markdown, state };
}

export function documentSessionReducer(session: DocumentSession, action: DocumentSessionAction): DocumentSession {
  if (action.type === 'replace') return action.session;
  if (action.type === 'localize-welcome') {
    return session.kind === 'welcome'
      ? { ...session, title: action.title, markdown: action.markdown }
      : session;
  }
  if (action.type === 'refresh-local') {
    return session.kind === 'file' || session.kind === 'workspace'
      ? { ...session, markdown: action.markdown, lastModified: action.lastModified, size: action.size }
      : session;
  }
  return session.kind === 'remote'
    ? {
        ...session,
        title: action.document ? displayDocumentTitle(action.document.title) : session.title,
        markdown: action.document?.markdown ?? session.markdown,
        state: action.state,
      }
    : session;
}

export function documentSourceUrl(session: DocumentSession): string | undefined {
  if (session.kind === 'imported') return session.sourceUrl;
  if (session.kind === 'remote') return session.state.url;
  return undefined;
}
