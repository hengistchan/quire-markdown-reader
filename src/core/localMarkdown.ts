import type { ImportedDocument } from '../shared/types';

export const OPEN_LOCAL_MARKDOWN = 'quire:open-local-markdown';

export interface OpenLocalMarkdownMessage {
  type: typeof OPEN_LOCAL_MARKDOWN;
  document: ImportedDocument;
}

export interface OpenLocalMarkdownResponse {
  viewerUrl: string;
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
  return candidate.type === OPEN_LOCAL_MARKDOWN
    && typeof document?.title === 'string'
    && typeof document.markdown === 'string'
    && typeof document.sourceUrl === 'string'
    && isLocalMarkdownUrl(document.sourceUrl);
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
