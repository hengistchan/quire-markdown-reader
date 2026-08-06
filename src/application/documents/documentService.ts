import type { DocumentSnapshot, DocumentSourceAdapter } from '../documentSources';

export class DocumentService {
  private currentSource?: DocumentSourceAdapter;
  private currentSnapshot?: DocumentSnapshot;
  private request?: AbortController;

  async open(source: DocumentSourceAdapter, signal?: AbortSignal): Promise<DocumentSnapshot> {
    this.releaseCurrentSource();
    const request = new AbortController();
    this.request = request;
    this.currentSource = source;

    const abort = () => request.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const snapshot = await source.load(request.signal);
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

  async refresh(signal?: AbortSignal) {
    if (!this.currentSource?.refresh || !this.currentSnapshot) return undefined;
    const result = await this.currentSource.refresh(this.currentSnapshot, signal);
    this.currentSnapshot = result.snapshot;
    return result;
  }

  dispose(): void {
    this.releaseCurrentSource();
  }

  private releaseCurrentSource(): void {
    this.request?.abort();
    this.request = undefined;
    this.currentSource?.dispose?.();
    this.currentSource = undefined;
    this.currentSnapshot = undefined;
  }
}
