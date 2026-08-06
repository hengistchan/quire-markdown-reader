import type { DocumentResourceResolver, ResolvedAsset } from '../../application/documents/documentResource';
import { getWorkspaceFileHandle } from '../../core/files';
import { isRelativeUrl, resolveWorkspacePath } from '../../core/paths';
import type { WorkspaceFile, WorkspaceSnapshot } from '../../shared/types';

export interface DocumentResourceContext {
  workspace?: WorkspaceSnapshot;
  activeFile?: WorkspaceFile;
  sourceUrl?: string;
}

export function createDocumentResourceResolver(context: DocumentResourceContext): DocumentResourceResolver {
  const objectUrls = new Set<string>();
  let disposed = false;

  return {
    async resolveAsset(href: string): Promise<ResolvedAsset> {
      if (disposed || !isRelativeUrl(href)) return { type: 'unavailable', reason: 'unsupported' };
      if (context.workspace && context.activeFile) {
        const path = resolveWorkspacePath(context.activeFile.path, href);
        if (!path) return { type: 'unavailable', reason: 'invalid-path' };
        try {
          const handle = await getWorkspaceFileHandle(context.workspace.handle, path);
          const url = URL.createObjectURL(await handle.getFile());
          if (disposed) {
            URL.revokeObjectURL(url);
            return { type: 'unavailable', reason: 'disposed' };
          }
          objectUrls.add(url);
          return { type: 'object-url', url, disposable: true };
        } catch {
          return { type: 'unavailable', reason: 'not-found' };
        }
      }
      if (context.sourceUrl) {
        try {
          return { type: 'url', url: new URL(href, context.sourceUrl).href, disposable: false };
        } catch {
          return { type: 'unavailable', reason: 'invalid-url' };
        }
      }
      return { type: 'unavailable', reason: 'missing-base' };
    },
    dispose(): void {
      disposed = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.clear();
    },
  };
}
