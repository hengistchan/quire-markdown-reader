import type { ImportedDocument, RemoteDocumentState } from '../shared/types';
import { isRemoteUrl } from './paths';

export const MAX_REMOTE_BYTES = 5 * 1024 * 1024;
export const REMOTE_TIMEOUT_MS = 20_000;

export type RemoteMarkdownErrorCode =
  | 'invalid-url'
  | 'http-error'
  | 'too-large'
  | 'network-error'
  | 'timeout'
  | 'cancelled';

export class RemoteMarkdownError extends Error {
  constructor(
    public readonly code: RemoteMarkdownErrorCode,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'RemoteMarkdownError';
  }
}

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
    if (new Blob([markdown]).size > limit) throw new RemoteMarkdownError('too-large');
    return markdown;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelReader = () => { void reader.cancel(signal.reason).catch(() => undefined); };
  signal.addEventListener('abort', cancelReader, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel('response-too-large').catch(() => undefined);
        throw new RemoteMarkdownError('too-large');
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
  if (!isRemoteUrl(value)) throw new RemoteMarkdownError('invalid-url');
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
    if (!response.ok) throw new RemoteMarkdownError('http-error', response.status);
    const limit = options.maxBytes ?? MAX_REMOTE_BYTES;
    const length = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(length) && length > limit) {
      await response.body?.cancel('response-too-large').catch(() => undefined);
      throw new RemoteMarkdownError('too-large');
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
    if (error instanceof RemoteMarkdownError) throw error;
    if (controller.signal.aborted) {
      throw new RemoteMarkdownError(timedOut ? 'timeout' : 'cancelled');
    }
    throw new RemoteMarkdownError('network-error');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
