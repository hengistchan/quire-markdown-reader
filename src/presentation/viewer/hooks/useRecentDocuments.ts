import { useCallback, useState } from 'react';
import type { NavigationOperationController } from '../../../application/navigation/navigationOperationController';
import type { RecentItem, RecentItemInput } from '../../../application/ports/recentRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import type { DocumentSession } from '../../../domain/documentSession';
import type { ReaderError } from '../../../shared/errors/readerError';
import { useReadingPosition } from './useReadingPosition';

interface ResumeTarget {
  scrollPosition: number;
  headingId?: string;
}

function recentId(session: DocumentSession): string | undefined {
  if (session.kind === 'remote') return `remote:${session.state.url}`;
  if (session.kind === 'workspace' && session.workspace.id) {
    return `workspace-file:${session.workspace.id}:${session.file.path}`;
  }
  if (session.kind === 'file' && session.file.id.startsWith('file:')) {
    return `local-file:${session.file.id.slice('file:'.length)}`;
  }
  return undefined;
}

export function useRecentDocuments(
  controller: ReaderController,
  session: DocumentSession,
  activeHeadingId?: string,
) {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget>();

  useReadingPosition(
    recentId(session),
    activeHeadingId,
    (id, position, headingId) => controller.updateRecentPosition(id, position, headingId),
    setItems,
  );

  const record = useCallback(async (item: RecentItemInput, signal?: AbortSignal) => {
    const nextItems = await controller.rememberRecent(item);
    if (!signal?.aborted) setItems(nextItems);
  }, [controller]);

  const prepareResume = useCallback((item: RecentItem) => {
    if ((item.scrollPosition ?? 0) > 80 || item.headingId) {
      setResumeTarget({ scrollPosition: item.scrollPosition ?? 0, headingId: item.headingId });
    } else {
      setResumeTarget(undefined);
    }
  }, []);

  const continueReading = () => {
    const target = resumeTarget;
    setResumeTarget(undefined);
    requestAnimationFrame(() => {
      const heading = target?.headingId ? document.getElementById(target.headingId) : undefined;
      if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else scrollTo({ top: target?.scrollPosition ?? 0, behavior: 'smooth' });
    });
  };

  return {
    items,
    replace: setItems,
    record,
    resumeTarget,
    clearResume: () => setResumeTarget(undefined),
    prepareResume,
    continueReading,
    startFromTop: () => {
      setResumeTarget(undefined);
      scrollTo({ top: 0, behavior: 'smooth' });
    },
  };
}

interface RecentDocumentActionsOptions {
  controller: ReaderController;
  navigationOperation: NavigationOperationController;
  clearResume(): void;
  prepareResume(item: RecentItem): void;
  openRemote(
    url: string,
    requestPermission?: boolean,
    intent?: 'push' | 'replace' | 'traverse',
    fragment?: string,
    signal?: AbortSignal,
  ): Promise<void>;
  activateWorkspace(
    handle: FileSystemDirectoryHandle,
    path?: string,
    id?: string,
    intent?: 'push' | 'replace' | 'traverse',
    transient?: boolean,
    fragment?: string,
    signal?: AbortSignal,
  ): Promise<boolean>;
  openLocalHandle(
    handle: FileSystemFileHandle,
    id?: string,
    fragment?: string,
    intent?: 'push' | 'replace' | 'traverse',
    signal?: AbortSignal,
  ): Promise<void>;
  closeOverlay(): void;
  showError(error: ReaderError): void;
}

export function useRecentDocumentActions(options: RecentDocumentActionsOptions) {
  const {
    controller, navigationOperation, clearResume, prepareResume, openRemote, activateWorkspace,
    openLocalHandle, closeOverlay, showError,
  } = options;

  const open = useCallback(async (item: RecentItem) => {
    const signal = navigationOperation.begin();
    clearResume();
    if (item.kind === 'remote' && item.url) {
      await openRemote(item.url, true, 'push', undefined, signal);
    }
    else if (item.kind === 'workspace-file') {
      const stored = await controller.getWorkspace(item.workspaceId);
      if (signal.aborted) return;
      if (!stored) {
        showError({ code: 'workspace-read-failed', retryable: true });
      } else {
        const permission = await controller.requestRead(stored.handle);
        if (signal.aborted) return;
        if (permission === 'granted') {
          await activateWorkspace(stored.handle, item.filePath, stored.id, 'push', false, undefined, signal);
        } else showError({ code: 'permission-denied', retryable: true });
      }
    } else if (item.kind === 'local-file') {
      const stored = await controller.getFile(item.fileId);
      if (signal.aborted) return;
      if (!stored) {
        showError({ code: 'file-read-failed', retryable: true });
      } else {
        const permission = await controller.requestRead(stored.handle);
        if (signal.aborted) return;
        if (permission === 'granted') {
          await openLocalHandle(stored.handle, stored.id, undefined, 'push', signal);
        } else showError({ code: 'permission-denied', retryable: true });
      }
    }
    if (signal.aborted) return;
    prepareResume(item);
    closeOverlay();
  }, [
    activateWorkspace, clearResume, closeOverlay, controller, openLocalHandle, openRemote,
    navigationOperation, prepareResume, showError,
  ]);

  return { open };
}
