export type ThemePreference = 'system' | 'light' | 'dark';
export type SidebarMode = 'files' | 'outline';

export interface ReaderSettings {
  locale: 'system' | 'en' | 'zh-CN';
  theme: ThemePreference;
  fontFamily: 'sans' | 'serif';
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  wideView: boolean;
  showReadingProgress: boolean;
  showOutline: boolean;
  autoRefresh: boolean;
  enableKatex: boolean;
  enableMermaid: boolean;
  enableHtml: boolean;
  customCss: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  depth: number;
  handle: FileSystemFileHandle;
}

export interface WorkspaceDirectory {
  id: string;
  name: string;
  path: string;
  depth: number;
  kind: 'directory';
  children: WorkspaceTreeNode[];
}

export interface WorkspaceFileNode {
  id: string;
  name: string;
  path: string;
  depth: number;
  kind: 'file';
  file: WorkspaceFile;
}

export type WorkspaceTreeNode = WorkspaceDirectory | WorkspaceFileNode;

export interface WorkspaceSnapshot {
  name: string;
  files: WorkspaceFile[];
  tree: WorkspaceTreeNode[];
  handle: FileSystemDirectoryHandle;
}

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export interface DocumentSearchResult {
  id: string;
  text: string;
  headingId?: string;
  blockIndex: number;
  startOffset: number;
  lineNumber: number;
}

export interface ImportedDocument {
  title: string;
  markdown: string;
  sourceUrl?: string;
}

export interface DocumentHandoff {
  id: string;
  document: ImportedDocument;
  createdAt: number;
}

export interface RemoteDocumentState {
  url: string;
  etag?: string;
  lastModified?: string;
}
