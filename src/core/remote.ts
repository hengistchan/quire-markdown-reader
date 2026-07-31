import type { ImportedDocument, RemoteDocumentState } from '../shared/types';
import { isRemoteUrl } from './paths';

const MAX_REMOTE_BYTES = 5 * 1024 * 1024;

export interface RemoteMarkdownResult {
  document?: ImportedDocument;
  state: RemoteDocumentState;
  unchanged: boolean;
}

export async function fetchRemoteMarkdown(
  value: string,
  previous?: RemoteDocumentState,
  fetcher: typeof fetch = fetch,
): Promise<RemoteMarkdownResult> {
  if (!isRemoteUrl(value)) throw new Error('Enter a valid HTTP or HTTPS URL.');
  const headers = new Headers();
  if (previous?.url === value && previous.etag) headers.set('If-None-Match', previous.etag);
  if (previous?.url === value && previous.lastModified) headers.set('If-Modified-Since', previous.lastModified);
  const response = await fetcher(value, { headers, cache: 'no-cache' });
  if (response.status === 304 && previous) return { state: previous, unchanged: true };
  if (!response.ok) throw new Error(`The server returned ${response.status}.`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_REMOTE_BYTES) throw new Error('The Markdown file is larger than 5 MB.');
  const markdown = await response.text();
  if (new Blob([markdown]).size > MAX_REMOTE_BYTES) throw new Error('The Markdown file is larger than 5 MB.');
  const resolvedUrl = response.url || value;
  const title = new URL(resolvedUrl).pathname.split('/').pop() || new URL(resolvedUrl).hostname;
  return {
    unchanged: false,
    document: { title, markdown, sourceUrl: resolvedUrl },
    state: {
      url: resolvedUrl,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    },
  };
}
