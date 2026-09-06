import type { DocumentRefreshResult, DocumentSnapshot, DocumentSource, LinkResolution } from './documentSource';
import type { ResolvedAsset } from './documentResource';

export class DocumentService {
  private currentSource?: DocumentSource;
  private currentSnapshot?: DocumentSnapshot;
  private request?: AbortController;

  async open(source: DocumentSource, signal?: AbortSignal): Promise<DocumentSnapshot> {
    this.releaseCurrentSource();
    const request = new AbortController();
    this.request = request;
    this.currentSource = source;

    const abort = () => request.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const snapshot = await source.load(request.signal);
      if (request.signal.aborted) {
        throw request.signal.reason ?? new DOMException('The document load was cancelled.', 'AbortError');
      }
      if (this.currentSource === source) this.currentSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      if (this.currentSource === source) this.releaseCurrentSource();
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (this.request === request) this.request = undefined;
    }
  }

  async refresh(signal?: AbortSignal): Promise<DocumentRefreshResult | undefined> {
    if (!this.currentSource || !this.currentSnapshot) return undefined;
    const source = this.currentSource;
    const result = await source.refresh(this.currentSnapshot, signal);
    if (signal?.aborted || this.currentSource !== source) return undefined;
    this.currentSnapshot = result.snapshot;
    return result;
  }

  resolveAsset(href: string, signal?: AbortSignal): Promise<ResolvedAsset> {
    return (
      this.currentSource?.resolveAsset(href, signal) ??
      Promise.resolve({ type: 'unavailable', reason: 'missing-source' })
    );
  }

  resolveLink(href: string): LinkResolution {
    return this.currentSource?.resolveLink(href) ?? { type: 'invalid' };
  }

  dispose(): void {
    this.releaseCurrentSource();
  }

  private releaseCurrentSource(): void {
    this.request?.abort();
    this.request = undefined;
    this.currentSource?.dispose();
    this.currentSource = undefined;
    this.currentSnapshot = undefined;
  }
}
