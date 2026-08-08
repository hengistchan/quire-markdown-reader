import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { NavigationIntent } from '../../../application/navigation/navigationController';
import type { ReaderController } from '../../../application/reader/readerController';
import { createUnavailableSession, createWelcomeSession, type DocumentSession } from '../../../domain/documentSession';
import type { NavigationTarget } from '../../../domain/navigation/navigationTarget';
import { toReaderError, type ReaderError, type ReaderErrorCode } from '../../../shared/errors/readerError';
import type { Translator } from '../../../shared/i18n';
import type {
  ImportedDocument, SidebarMode, WorkspaceFile, WorkspaceSnapshot,
} from '../../../shared/types';

export interface RestorableNavigation {
  target: NavigationTarget;
  kind: 'workspace' | 'local-file' | 'remote';
}

interface NavigationRestorationOptions {
  controller: ReaderController;
  workspace?: WorkspaceSnapshot;
  replaceSession(session: DocumentSession): void;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode | null>>;
  showError(error: ReaderError | undefined): void;
  setRestorableWorkspace(value: Awaited<ReturnType<ReaderController['getWorkspace']>>): void;
  clearResume(): void;
  cancelPendingRemote(): void;
  queueDocumentNavigation(fragment?: string): void;
  openWorkspaceFile(file: WorkspaceFile, workspace: WorkspaceSnapshot, fragment?: string, intent?: NavigationIntent): Promise<void>;
  activateWorkspace(
    handle: FileSystemDirectoryHandle,
    path?: string,
    id?: string,
    intent?: NavigationIntent,
    transient?: boolean,
    fragment?: string,
  ): Promise<boolean>;
  openLocalHandle(handle: FileSystemFileHandle, id?: string, fragment?: string, intent?: NavigationIntent): Promise<void>;
  openRemote(url: string, requestPermission?: boolean, intent?: NavigationIntent, fragment?: string): Promise<void>;
  openImported(document: ImportedDocument, fragment?: string, intent?: NavigationIntent, sessionId?: string): Promise<void>;
  t: Translator;
}

function restorableTarget(target: NavigationTarget): RestorableNavigation | undefined {
  if (target.document.kind === 'workspace-file') return { target, kind: 'workspace' };
  if (target.document.kind === 'local-file') return { target, kind: 'local-file' };
  if (target.document.kind === 'remote') return { target, kind: 'remote' };
  return undefined;
}

function failureCode(target: NavigationTarget): ReaderErrorCode {
  if (target.document.kind === 'workspace-file') return 'workspace-read-failed';
  if (target.document.kind === 'remote') return 'remote-network-error';
  if (target.document.kind === 'imported') return 'imported-unavailable';
  return 'file-read-failed';
}

export function useNavigationRestoration(options: NavigationRestorationOptions) {
  const [restorable, setRestorable] = useState<RestorableNavigation>();
  const restorationSequence = useRef(0);

  const showFailure = useCallback((failure: ReaderError, restore?: RestorableNavigation) => {
    options.showError(failure);
    setRestorable(restore);
    options.replaceSession(createUnavailableSession(options.t('unavailableDocument')));
    options.setSidebarMode(restore?.kind === 'workspace' ? 'files' : null);
    options.queueDocumentNavigation(undefined);
    scrollTo({ top: 0 });
  }, [options]);

  const navigateToTarget = useCallback(async (target?: NavigationTarget) => {
    const requestId = restorationSequence.current + 1;
    restorationSequence.current = requestId;
    const isLatestRequest = () => restorationSequence.current === requestId;
    options.cancelPendingRemote();
    options.clearResume();
    options.setRestorableWorkspace(undefined);
    setRestorable(undefined);
    if (!target) {
      options.replaceSession(createWelcomeSession(
        options.t('welcomeDocumentTitle'),
        options.t('welcomeDocument'),
      ));
      options.showError(undefined);
      options.setSidebarMode(null);
      options.queueDocumentNavigation(undefined);
      scrollTo({ top: 0 });
      return;
    }

    try {
      if (target.document.kind === 'workspace-file') {
        const workspaceTarget = target.document;
        if (options.workspace?.id === workspaceTarget.workspaceId) {
          const file = options.workspace.files.find((candidate) => candidate.path === workspaceTarget.filePath);
          if (file) {
            await options.openWorkspaceFile(file, options.workspace, target.fragment, 'traverse');
            return;
          }
        }
        const stored = await options.controller.getWorkspace(workspaceTarget.workspaceId);
        if (!isLatestRequest()) return;
        if (!stored) {
          showFailure({ code: 'workspace-read-failed', retryable: true });
          return;
        }
        const permission = await options.controller.queryRead(stored.handle);
        if (!isLatestRequest()) return;
        if (permission !== 'granted') {
          options.setRestorableWorkspace(stored);
          showFailure(
            { code: 'permission-required', retryable: true },
            { target, kind: 'workspace' },
          );
          return;
        }
        await options.activateWorkspace(
          stored.handle,
          workspaceTarget.filePath,
          stored.id,
          'traverse',
          false,
          target.fragment,
        );
        return;
      }

      if (target.document.kind === 'local-file') {
        const stored = await options.controller.getFile(target.document.fileId);
        if (!isLatestRequest()) return;
        if (!stored) {
          showFailure({ code: 'file-read-failed', retryable: true });
          return;
        }
        const permission = await options.controller.queryRead(stored.handle);
        if (!isLatestRequest()) return;
        if (permission !== 'granted') {
          showFailure(
            { code: 'permission-required', retryable: true },
            { target, kind: 'local-file' },
          );
          return;
        }
        await options.openLocalHandle(stored.handle, stored.id, target.fragment, 'traverse');
        return;
      }

      if (target.document.kind === 'remote') {
        const hasPermission = await options.controller.hasRemoteOrigin(target.document.url);
        if (!isLatestRequest()) return;
        if (!hasPermission) {
          showFailure(
            { code: 'permission-required', retryable: true },
            { target, kind: 'remote' },
          );
          return;
        }
        await options.openRemote(target.document.url, false, 'traverse', target.fragment);
        return;
      }

      const imported = options.controller.getImported(target.document.sessionId);
      if (!imported) {
        showFailure({ code: 'imported-unavailable', retryable: false });
        return;
      }
      await options.openImported(imported, target.fragment, 'traverse', target.document.sessionId);
    } catch (caught) {
      if (!isLatestRequest()) return;
      showFailure(toReaderError(caught, failureCode(target)), restorableTarget(target));
    }
  }, [options, showFailure]);

  const restore = useCallback(async () => {
    if (!restorable) return;
    const requestId = restorationSequence.current + 1;
    restorationSequence.current = requestId;
    const isLatestRequest = () => restorationSequence.current === requestId;
    try {
      if (restorable.kind === 'remote') {
        const target = restorable.target.document as { kind: 'remote'; url: string };
        const granted = await options.controller.requestRemoteOrigin(target.url);
        if (!isLatestRequest()) return;
        if (!granted) {
          options.showError({ code: 'permission-denied', retryable: true });
          return;
        }
        await options.openRemote(target.url, false, 'traverse', restorable.target.fragment);
      } else if (restorable.kind === 'workspace') {
        const target = restorable.target.document as { kind: 'workspace-file'; workspaceId: string; filePath: string };
        const stored = await options.controller.getWorkspace(target.workspaceId);
        if (!isLatestRequest()) return;
        const permission = stored && await options.controller.requestRead(stored.handle);
        if (!isLatestRequest()) return;
        if (!stored || permission !== 'granted') {
          options.showError({ code: 'permission-denied', retryable: true });
          return;
        }
        await options.activateWorkspace(
          stored.handle,
          target.filePath,
          stored.id,
          'traverse',
          false,
          restorable.target.fragment,
        );
      } else {
        const target = restorable.target.document as { kind: 'local-file'; fileId: string };
        const stored = await options.controller.getFile(target.fileId);
        if (!isLatestRequest()) return;
        const permission = stored && await options.controller.requestRead(stored.handle);
        if (!isLatestRequest()) return;
        if (!stored || permission !== 'granted') {
          options.showError({ code: 'permission-denied', retryable: true });
          return;
        }
        await options.openLocalHandle(stored.handle, stored.id, restorable.target.fragment, 'traverse');
      }
      if (isLatestRequest()) {
        setRestorable(undefined);
        options.setRestorableWorkspace(undefined);
      }
    } catch (caught) {
      if (!isLatestRequest()) return;
      options.showError(toReaderError(caught, failureCode(restorable.target)));
    }
  }, [options, restorable]);

  return {
    restorable,
    navigateToTarget,
    restore,
    dismiss: () => setRestorable(undefined),
  };
}
