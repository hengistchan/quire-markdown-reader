export type ThemePreference = 'system' | 'light' | 'dark';
export type SidebarMode = 'files' | 'outline';

export interface ReaderSettings {
  theme: ThemePreference;
  fontFamily: 'sans' | 'serif';
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  showReadingProgress: boolean;
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

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export interface ImportedDocument {
  title: string;
  markdown: string;
  sourceUrl?: string;
}
