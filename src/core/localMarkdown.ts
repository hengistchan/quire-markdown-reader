import type { ImportedDocument } from '../shared/types';

export const OPEN_LOCAL_MARKDOWN = 'quire:open-local-markdown';

export interface OpenLocalMarkdownMessage {
  type: typeof OPEN_LOCAL_MARKDOWN;
  document: ImportedDocument;
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
