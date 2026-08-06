import type {
  DocumentIdentity, DocumentRefreshResult, DocumentSnapshot, DocumentSource, LinkResolution,
} from '../../application/documents/documentSource';
import type { ResolvedAsset } from '../../application/documents/documentResource';
import { getWorkspaceFileHandle, readWorkspaceFileSnapshot } from '../../core/files';
import { isMarkdownLink, isRelativeUrl, isRemoteUrl, linkFragment, resolveWorkspacePath } from '../../core/paths';
import type { WorkspaceFile, WorkspaceSnapshot } from '../../shared/types';

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The document load was cancelled.', 'AbortError');
}

function externalLink(href: string): LinkResolution {
  if (href.startsWith('#')) return { type: 'fragment', fragment: linkFragment(href) ?? '' };
  if (isRemoteUrl(href)) {
    return isMarkdownLink(href)
      ? { type: 'remote-document', url: href, fragment: linkFragment(href) }
      : { type: 'external', url: href };
  }
  return { type: 'invalid' };
}

export class FileDocumentSource implements DocumentSource {
  readonly identity: DocumentIdentity;
  private readonly objectUrls = new Set<string>();
  private disposed = false;

  constructor(
    private readonly file: WorkspaceFile,
    private readonly workspace?: WorkspaceSnapshot,
  ) {
    this.identity = {
      sourceKind: workspace ? 'workspace-file' : 'local-file',
      stableId: workspace ? `${workspace.id ?? workspace.name}:${file.path}` : file.id,
      displayName: file.name,
    };
  }

  async load(signal?: AbortSignal): Promise<DocumentSnapshot> {
    assertNotCancelled(signal);
    const snapshot = await readWorkspaceFileSnapshot(this.file);
    assertNotCancelled(signal);
    return this.snapshot(snapshot.markdown, snapshot.lastModified, snapshot.size);
  }

  async refresh(previous: DocumentSnapshot, signal?: AbortSignal): Promise<DocumentRefreshResult> {
    assertNotCancelled(signal);
    const nextFile = await this.file.handle.getFile();
    assertNotCancelled(signal);
    if (nextFile.lastModified === previous.metadata.lastModified && nextFile.size === previous.metadata.size) {
      return { changed: false, snapshot: previous };
    }
    const markdown = await nextFile.text();
    assertNotCancelled(signal);
    return { changed: true, snapshot: this.snapshot(markdown, nextFile.lastModified, nextFile.size) };
  }

  async resolveAsset(href: string, signal?: AbortSignal): Promise<ResolvedAsset> {
    assertNotCancelled(signal);
    if (this.disposed || !isRelativeUrl(href) || !this.workspace) {
      return { type: 'unavailable', reason: this.disposed ? 'disposed' : 'unsupported' };
    }
    const path = resolveWorkspacePath(this.file.path, href);
    if (!path) return { type: 'unavailable', reason: 'invalid-path' };
    try {
      const handle = await getWorkspaceFileHandle(this.workspace.handle, path);
      const url = URL.createObjectURL(await handle.getFile());
      if (this.disposed || signal?.aborted) {
        URL.revokeObjectURL(url);
        return { type: 'unavailable', reason: 'disposed' };
      }
      this.objectUrls.add(url);
      return { type: 'object-url', url, disposable: true };
    } catch {
      return { type: 'unavailable', reason: 'not-found' };
    }
  }

  resolveLink(href: string): LinkResolution {
    if (!this.workspace || !isRelativeUrl(href)) return externalLink(href);
    if (!isMarkdownLink(href)) return { type: 'invalid' };
    const path = resolveWorkspacePath(this.file.path, href);
    return path
      ? { type: 'workspace-document', path, fragment: linkFragment(href) }
      : { type: 'invalid' };
  }

  dispose(): void {
    this.disposed = true;
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }

  private snapshot(markdown: string, lastModified: number, size: number): DocumentSnapshot {
    return {
      identity: this.identity,
      title: this.file.name,
      markdown,
      format: 'markdown',
      metadata: { lastModified, size },
    };
  }
}
