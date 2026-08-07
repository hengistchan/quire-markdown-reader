import { useCallback, useState } from 'react';
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

  const record = useCallback(async (item: RecentItemInput) => {
    setItems(await controller.rememberRecent(item));
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
  clearResume(): void;
  prepareResume(item: RecentItem): void;
  openRemote(url: string): Promise<void>;
  activateWorkspace(handle: FileSystemDirectoryHandle, path?: string, id?: string): Promise<boolean>;
  openLocalHandle(handle: FileSystemFileHandle, id?: string): Promise<void>;
  closeOverlay(): void;
  showError(error: ReaderError): void;
}

export function useRecentDocumentActions(options: RecentDocumentActionsOptions) {
  const {
    controller, clearResume, prepareResume, openRemote, activateWorkspace,
    openLocalHandle, closeOverlay, showError,
  } = options;

  const open = useCallback(async (item: RecentItem) => {
    clearResume();
    if (item.kind === 'remote' && item.url) await openRemote(item.url);
    else if (item.kind === 'workspace-file') {
      const stored = await controller.getWorkspace(item.workspaceId);
      if (!stored) showError({ code: 'workspace-read-failed', retryable: true });
      else if (await controller.requestRead(stored.handle) === 'granted') {
        await activateWorkspace(stored.handle, item.filePath, stored.id);
      } else showError({ code: 'permission-denied', retryable: true });
    } else if (item.kind === 'local-file') {
      const stored = await controller.getFile(item.fileId);
      if (!stored) showError({ code: 'file-read-failed', retryable: true });
      else if (await controller.requestRead(stored.handle) === 'granted') {
        await openLocalHandle(stored.handle, stored.id);
      } else showError({ code: 'permission-denied', retryable: true });
    }
    prepareResume(item);
    closeOverlay();
  }, [
    activateWorkspace, clearResume, closeOverlay, controller, openLocalHandle, openRemote,
    prepareResume, showError,
  ]);

  return { open };
}
