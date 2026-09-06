import type { ImportedDocument, RemoteDocumentState } from '../../shared/types';
import type {
  DocumentIdentity,
  DocumentRefreshResult,
  DocumentSnapshot,
  DocumentSource,
  LinkResolution,
} from '../../application/documents/documentSource';
import type { ResolvedAsset } from '../../application/documents/documentResource';
import { isMarkdownLink, isRelativeUrl, isRemoteUrl, linkFragment } from '../../core/paths';
import { RemoteDocumentError } from '../../shared/errors/remoteDocumentError';

export const MAX_REMOTE_BYTES = 5 * 1024 * 1024;
export const REMOTE_TIMEOUT_MS = 20_000;

export { RemoteDocumentError as RemoteMarkdownError } from '../../shared/errors/remoteDocumentError';

export interface RemoteMarkdownResult {
  document?: ImportedDocument;
  state: RemoteDocumentState;
  unchanged: boolean;
}

export interface RemoteMarkdownOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function readTextWithLimit(response: Response, limit: number, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const markdown = await response.text();
    if (new Blob([markdown]).size > limit) throw new RemoteDocumentError('too-large');
    return markdown;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelReader = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener('abort', cancelReader, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel('response-too-large').catch(() => undefined);
        throw new RemoteDocumentError('too-large');
      }
      chunks.push(value);
    }
    if (signal.aborted) throw signal.reason;
    return new TextDecoder().decode(concatChunks(chunks, total));
  } finally {
    signal.removeEventListener('abort', cancelReader);
  }
}

export async function fetchRemoteMarkdown(
  value: string,
  previous?: RemoteDocumentState,
  fetcher: typeof fetch = fetch,
  options: RemoteMarkdownOptions = {},
): Promise<RemoteMarkdownResult> {
  if (!isRemoteUrl(value)) throw new RemoteDocumentError('invalid-url');
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort(new DOMException('Remote Markdown request timed out.', 'TimeoutError'));
  }, options.timeoutMs ?? REMOTE_TIMEOUT_MS);

  try {
    const headers = new Headers();
    if (previous?.url === value && previous.etag) headers.set('If-None-Match', previous.etag);
    if (previous?.url === value && previous.lastModified) headers.set('If-Modified-Since', previous.lastModified);
    const response = await fetcher(value, { headers, cache: 'no-cache', signal: controller.signal });
    if (response.status === 304 && previous) return { state: previous, unchanged: true };
    if (!response.ok) throw new RemoteDocumentError('http-error', response.status);
    const limit = options.maxBytes ?? MAX_REMOTE_BYTES;
    const length = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(length) && length > limit) {
      await response.body?.cancel('response-too-large').catch(() => undefined);
      throw new RemoteDocumentError('too-large');
    }
    const markdown = await readTextWithLimit(response, limit, controller.signal);
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
  } catch (error) {
    if (error instanceof RemoteDocumentError) throw error;
    if (controller.signal.aborted) {
      throw new RemoteDocumentError(timedOut ? 'timeout' : 'cancelled');
    }
    throw new RemoteDocumentError('network-error');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export class RemoteDocumentSource implements DocumentSource {
  readonly identity: DocumentIdentity;

  constructor(
    private readonly url: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.identity = {
      sourceKind: 'remote',
      stableId: url,
      displayName: remoteTitle(url),
    };
  }

  async load(signal?: AbortSignal): Promise<DocumentSnapshot> {
    const result = await fetchRemoteMarkdown(this.url, undefined, this.fetcher, { signal });
    if (!result.document) throw new Error('A new remote load must return a document.');
    return this.snapshot(result.document, result.state);
  }

  async refresh(previous: DocumentSnapshot, signal?: AbortSignal): Promise<DocumentRefreshResult> {
    const priorState = previous.remoteState ?? { url: this.url };
    const result = await fetchRemoteMarkdown(priorState.url, priorState, this.fetcher, { signal });
    if (!result.document) {
      return {
        changed: false,
        snapshot: { ...previous, remoteState: result.state, metadata: remoteMetadata(result.state) },
      };
    }
    return { changed: true, snapshot: this.snapshot(result.document, result.state) };
  }

  async resolveAsset(href: string): Promise<ResolvedAsset> {
    if (!isRelativeUrl(href)) return { type: 'unavailable', reason: 'unsupported' };
    try {
      return { type: 'url', url: new URL(href, this.url).href, disposable: false };
    } catch {
      return { type: 'unavailable', reason: 'invalid-url' };
    }
  }

  resolveLink(href: string): LinkResolution {
    if (href.startsWith('#')) return { type: 'fragment', fragment: linkFragment(href) ?? '' };
    try {
      const url = new URL(href, this.url).href;
      return isMarkdownLink(url)
        ? { type: 'remote-document', url, fragment: linkFragment(url) }
        : { type: 'external', url };
    } catch {
      return { type: 'invalid' };
    }
  }

  dispose(): void {}

  private snapshot(document: ImportedDocument, state: RemoteDocumentState): DocumentSnapshot {
    const identity =
      state.url === this.identity.stableId
        ? this.identity
        : { ...this.identity, stableId: state.url, displayName: document.title };
    return {
      identity,
      title: document.title,
      markdown: document.markdown,
      format: document.format ?? 'markdown',
      metadata: remoteMetadata(state),
      remoteState: state,
    };
  }
}

function remoteMetadata(state: RemoteDocumentState) {
  return {
    sourceUrl: state.url,
    etag: state.etag,
    remoteLastModified: state.lastModified,
  };
}

function remoteTitle(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname.split('/').pop() || url.hostname;
  } catch {
    return value;
  }
}
