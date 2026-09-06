import type { ImportedDocument } from '../shared/types';

export const OPEN_LOCAL_MARKDOWN = 'quire:open-local-markdown';
export const READ_LOCAL_MARKDOWN_ASSET = 'quire:read-local-markdown-asset';
export const NAVIGATE_LOCAL_MARKDOWN_WORKSPACE = 'quire:navigate-local-markdown-workspace';
export const SELECT_LOCAL_MARKDOWN_WORKSPACE_FILE = 'quire:select-local-markdown-workspace-file';

export interface OpenLocalMarkdownMessage {
  type: typeof OPEN_LOCAL_MARKDOWN;
  document: ImportedDocument;
}

export interface OpenLocalMarkdownResponse {
  viewerUrl: string;
}

export interface ReadLocalMarkdownAssetMessage {
  type: typeof READ_LOCAL_MARKDOWN_ASSET;
  sourceUrl: string;
  href: string;
}

export interface ReadLocalMarkdownAssetResponse {
  dataUrl?: string;
  error?: string;
}

export interface LocalMarkdownWorkspaceRoute {
  workspaceName: string;
  filePath: string;
}

export interface NavigateLocalMarkdownWorkspaceMessage extends LocalMarkdownWorkspaceRoute {
  type: typeof NAVIGATE_LOCAL_MARKDOWN_WORKSPACE;
}

export interface SelectLocalMarkdownWorkspaceFileMessage {
  type: typeof SELECT_LOCAL_MARKDOWN_WORKSPACE_FILE;
  filePath: string;
}

function isSafeWorkspaceName(value: string): boolean {
  return Boolean(value) && value !== '.' && value !== '..' && !/[\\/\0]/.test(value);
}

function isSafeMarkdownFilePath(value: string): boolean {
  const segments = value.split('/');
  return (
    segments.length > 0 &&
    segments.every((segment) => Boolean(segment) && segment !== '.' && segment !== '..' && !/[\\\0]/.test(segment)) &&
    /\.(?:md|markdown|mdx)$/i.test(value)
  );
}

export function isLocalMarkdownUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'file:' && /\.(md|markdown|mdx)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function localMarkdownTitle(value: string): string {
  try {
    const path = new URL(value).pathname;
    const filename = path.split('/').filter(Boolean).at(-1) ?? 'Untitled.md';
    return decodeURIComponent(filename);
  } catch {
    return 'Untitled.md';
  }
}

export function localMarkdownPathWithinDirectory(value: string, directoryName: string): string | undefined {
  if (!isLocalMarkdownUrl(value)) return undefined;
  try {
    const segments = new URL(value).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const directoryIndex = segments.lastIndexOf(directoryName);
    if (directoryIndex < 0 || directoryIndex === segments.length - 1) return undefined;
    return segments.slice(directoryIndex + 1).join('/');
  } catch {
    return undefined;
  }
}

export function localMarkdownWorkspaceFileUrl(
  value: string,
  workspaceName: string,
  filePath: string,
): string | undefined {
  if (!isLocalMarkdownUrl(value) || !isSafeWorkspaceName(workspaceName) || !isSafeMarkdownFilePath(filePath))
    return undefined;
  const currentPath = localMarkdownPathWithinDirectory(value, workspaceName);
  if (!currentPath) return undefined;
  try {
    const source = new URL(value);
    source.search = '';
    source.hash = '';
    const sourceDirectory = new URL('.', source);
    const workspaceRoot = new URL('../'.repeat(Math.max(0, currentPath.split('/').length - 1)), sourceDirectory);
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const target = new URL(encodedPath, workspaceRoot);
    return isLocalMarkdownUrl(target.href) ? target.href : undefined;
  } catch {
    return undefined;
  }
}

export function localMarkdownWorkspaceHash(route: LocalMarkdownWorkspaceRoute): string {
  const query = new URLSearchParams();
  query.set('quire-workspace', route.workspaceName);
  query.set('quire-file', route.filePath);
  return query.toString();
}

export function localMarkdownWorkspaceRoute(value: string): LocalMarkdownWorkspaceRoute | undefined {
  try {
    const url = new URL(value);
    const query = new URLSearchParams(url.hash.slice(1));
    const workspaceName = query.get('quire-workspace');
    const filePath = query.get('quire-file');
    return workspaceName && filePath && isSafeWorkspaceName(workspaceName) && isSafeMarkdownFilePath(filePath)
      ? { workspaceName, filePath }
      : undefined;
  } catch {
    return undefined;
  }
}

export function isNavigateLocalMarkdownWorkspaceMessage(
  value: unknown,
): value is NavigateLocalMarkdownWorkspaceMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NavigateLocalMarkdownWorkspaceMessage>;
  return (
    candidate.type === NAVIGATE_LOCAL_MARKDOWN_WORKSPACE &&
    typeof candidate.workspaceName === 'string' &&
    isSafeWorkspaceName(candidate.workspaceName) &&
    typeof candidate.filePath === 'string' &&
    isSafeMarkdownFilePath(candidate.filePath)
  );
}

export function isSelectLocalMarkdownWorkspaceFileMessage(
  value: unknown,
): value is SelectLocalMarkdownWorkspaceFileMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SelectLocalMarkdownWorkspaceFileMessage>;
  return (
    candidate.type === SELECT_LOCAL_MARKDOWN_WORKSPACE_FILE &&
    typeof candidate.filePath === 'string' &&
    isSafeMarkdownFilePath(candidate.filePath)
  );
}

export function createLocalMarkdownImport(value: string, page: Document): ImportedDocument | undefined {
  if (!isLocalMarkdownUrl(value)) return undefined;
  const solePre = page.body?.childElementCount === 1 ? page.body.querySelector(':scope > pre') : null;
  return {
    title: localMarkdownTitle(value),
    markdown: solePre?.textContent ?? page.body?.innerText ?? page.body?.textContent ?? '',
    sourceUrl: value,
  };
}

export function isOpenLocalMarkdownMessage(value: unknown): value is OpenLocalMarkdownMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OpenLocalMarkdownMessage>;
  const document = candidate.document;
  return (
    candidate.type === OPEN_LOCAL_MARKDOWN &&
    typeof document?.title === 'string' &&
    typeof document.markdown === 'string' &&
    typeof document.sourceUrl === 'string' &&
    isLocalMarkdownUrl(document.sourceUrl)
  );
}

export function isOpenLocalMarkdownResponse(value: unknown): value is OpenLocalMarkdownResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OpenLocalMarkdownResponse>;
  if (typeof candidate.viewerUrl !== 'string') return false;
  try {
    const url = new URL(candidate.viewerUrl);
    return ['chrome-extension:', 'moz-extension:'].includes(url.protocol) && url.pathname === '/viewer.html';
  } catch {
    return false;
  }
}

export function isReadLocalMarkdownAssetMessage(value: unknown): value is ReadLocalMarkdownAssetMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReadLocalMarkdownAssetMessage>;
  if (
    candidate.type !== READ_LOCAL_MARKDOWN_ASSET ||
    typeof candidate.sourceUrl !== 'string' ||
    typeof candidate.href !== 'string'
  )
    return false;
  if (!isLocalMarkdownUrl(candidate.sourceUrl) || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(candidate.href)) return false;
  try {
    const target = new URL(candidate.href, candidate.sourceUrl);
    return target.protocol === 'file:' && /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(target.pathname);
  } catch {
    return false;
  }
}

export function isReadLocalMarkdownAssetResponse(
  value: unknown,
): value is ReadLocalMarkdownAssetResponse & { dataUrl: string } {
  if (!value || typeof value !== 'object') return false;
  const dataUrl = (value as ReadLocalMarkdownAssetResponse).dataUrl;
  return typeof dataUrl === 'string' && /^data:[^,]+;base64,/i.test(dataUrl);
}
