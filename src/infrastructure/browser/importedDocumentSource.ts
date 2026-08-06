import type {
  DocumentIdentity, DocumentRefreshResult, DocumentSnapshot, DocumentSource, LinkResolution,
} from '../../application/documents/documentSource';
import type { ResolvedAsset } from '../../application/documents/documentResource';
import { isMarkdownLink, isRelativeUrl, isRemoteUrl, linkFragment } from '../../core/paths';
import type { ImportedDocument } from '../../shared/types';

export class ImportedDocumentSource implements DocumentSource {
  readonly identity: DocumentIdentity;

  constructor(private readonly document: ImportedDocument) {
    this.identity = {
      sourceKind: 'imported',
      stableId: document.sourceUrl ?? document.title,
      displayName: document.title,
    };
  }

  async load(signal?: AbortSignal): Promise<DocumentSnapshot> {
    if (signal?.aborted) throw signal.reason ?? new DOMException('The document load was cancelled.', 'AbortError');
    return {
      identity: this.identity,
      title: this.document.title,
      markdown: this.document.markdown,
      format: this.document.format ?? 'markdown',
      metadata: { sourceUrl: this.document.sourceUrl },
    };
  }

  async refresh(previous: DocumentSnapshot): Promise<DocumentRefreshResult> {
    return { changed: false, snapshot: previous };
  }

  async resolveAsset(href: string): Promise<ResolvedAsset> {
    if (!this.document.sourceUrl || !isRelativeUrl(href)) return { type: 'unavailable', reason: 'unsupported' };
    try {
      return { type: 'url', url: new URL(href, this.document.sourceUrl).href, disposable: false };
    } catch {
      return { type: 'unavailable', reason: 'invalid-url' };
    }
  }

  resolveLink(href: string): LinkResolution {
    if (href.startsWith('#')) return { type: 'fragment', fragment: linkFragment(href) ?? '' };
    try {
      const url = this.document.sourceUrl ? new URL(href, this.document.sourceUrl).href : href;
      if (!isRemoteUrl(url)) return { type: 'invalid' };
      return isMarkdownLink(url)
        ? { type: 'remote-document', url, fragment: linkFragment(url) }
        : { type: 'external', url };
    } catch {
      return { type: 'invalid' };
    }
  }

  dispose(): void {}
}
