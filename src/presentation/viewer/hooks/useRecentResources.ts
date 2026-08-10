import { useCallback, useState } from 'react';
import type { NavigationIntent } from '../../../application/navigation/navigationController';
import type { NavigationOperationController } from '../../../application/navigation/navigationOperationController';
import type {
  RecentResource, RecentResourceInput,
} from '../../../application/ports/recentResourceRepository';
import type { RecentItem } from '../../../application/ports/recentRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import { toReaderError, type ReaderError, type ReaderErrorCode } from '../../../shared/errors/readerError';

export function useRecentResources(controller: ReaderController) {
  const [items, setItems] = useState<RecentResource[]>([]);

  const remember = useCallback(async (resource: RecentResourceInput, signal?: AbortSignal) => {
    const next = await controller.rememberRecentResource(resource);
    if (!signal?.aborted) setItems(next);
  }, [controller]);

  const updateWorkspaceDocument = useCallback(async (
    workspaceId: string,
    filePath: string,
    signal?: AbortSignal,
  ) => {
    const next = await controller.updateRecentWorkspaceDocument(workspaceId, filePath);
    if (!signal?.aborted) setItems(next);
  }, [controller]);

  const remove = useCallback(async (id: string) => {
    setItems(await controller.removeRecentResource(id));
  }, [controller]);

  return {
    items,
    replace: setItems,
    remember,
    remove,
    updateWorkspaceDocument,
  };
}

interface RecentResourceActionsOptions {
  controller: ReaderController;
  navigationOperation: NavigationOperationController;
  readingHistory: RecentItem[];
  clearResume(): void;
  prepareResume(item: RecentItem): void;
  openRemote(
    url: string,
    requestPermission?: boolean,
    intent?: NavigationIntent,
    fragment?: string,
    signal?: AbortSignal,
    rememberResource?: boolean,
  ): Promise<void>;
  activateWorkspace(
    handle: FileSystemDirectoryHandle,
    path?: string,
    id?: string,
    intent?: NavigationIntent,
    transient?: boolean,
    fragment?: string,
    signal?: AbortSignal,
    rememberResource?: boolean,
  ): Promise<boolean>;
  openLocalHandle(
    handle: FileSystemFileHandle,
    id?: string,
    fragment?: string,
    intent?: NavigationIntent,
    signal?: AbortSignal,
    rememberResource?: boolean,
  ): Promise<void>;
  closeOverlay(): void;
  showError(error: ReaderError): void;
}

function readingHistoryId(resource: RecentResource): string | undefined {
  if (resource.kind === 'remote') return resource.id;
  if (resource.kind === 'local-file') return `local-file:${resource.fileId}`;
  if (resource.lastFilePath) {
    return `workspace-file:${resource.workspaceId}:${resource.lastFilePath}`;
  }
  return undefined;
}

export function useRecentResourceActions(options: RecentResourceActionsOptions) {
  const {
    controller, navigationOperation, readingHistory, clearResume, prepareResume,
    openRemote, activateWorkspace, openLocalHandle, closeOverlay, showError,
  } = options;
  const open = useCallback(async (resource: RecentResource) => {
    const signal = navigationOperation.begin();
    clearResume();

    try {
      if (resource.kind === 'remote') {
        await openRemote(resource.url, true, 'push', undefined, signal, true);
      } else if (resource.kind === 'workspace') {
        const stored = await controller.getWorkspace(resource.workspaceId);
        if (signal.aborted) return;
        if (!stored) {
          showError({ code: 'workspace-read-failed', retryable: true });
          closeOverlay();
          return;
        }
        const permission = await controller.requestRead(stored.handle);
        if (signal.aborted) return;
        if (permission !== 'granted') {
          showError({ code: 'permission-denied', retryable: true });
          closeOverlay();
          return;
        }
        await activateWorkspace(
          stored.handle,
          resource.lastFilePath,
          stored.id,
          'push',
          false,
          undefined,
          signal,
          true,
        );
      } else {
        const stored = await controller.getFile(resource.fileId);
        if (signal.aborted) return;
        if (!stored) {
          showError({ code: 'file-read-failed', retryable: true });
          closeOverlay();
          return;
        }
        const permission = await controller.requestRead(stored.handle);
        if (signal.aborted) return;
        if (permission !== 'granted') {
          showError({ code: 'permission-denied', retryable: true });
          closeOverlay();
          return;
        }
        await openLocalHandle(stored.handle, stored.id, undefined, 'push', signal, true);
      }

      if (signal.aborted) return;
      const historyId = readingHistoryId(resource);
      const historyItem = historyId
        ? readingHistory.find((item) => item.id === historyId)
        : undefined;
      if (historyItem) prepareResume(historyItem);
      closeOverlay();
    } catch (caught) {
      if (signal.aborted) return;
      const fallback: ReaderErrorCode = resource.kind === 'workspace'
        ? 'workspace-read-failed'
        : resource.kind === 'remote'
          ? 'remote-network-error'
          : 'file-read-failed';
      showError(toReaderError(caught, fallback));
      closeOverlay();
    }
  }, [
    activateWorkspace, clearResume, closeOverlay, controller, navigationOperation, openLocalHandle,
    openRemote, prepareResume, readingHistory, showError,
  ]);

  return { open };
}
