import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { NavigationIntent, NavigationSnapshot } from '../../../application/navigation/navigationController';
import type { ReaderController } from '../../../application/reader/readerController';
import type { NavigationTarget } from '../../../domain/navigation/navigationTarget';
import { createUnavailableSession, createWelcomeSession, type DocumentSession } from '../../../domain/documentSession';
import type { ReaderError } from '../../../shared/errors/readerError';
import type { Translator } from '../../../shared/i18n';
import type { SidebarMode, WorkspaceFile, WorkspaceSnapshot } from '../../../shared/types';

export interface ReaderNavigationModel extends NavigationSnapshot {
  record(target: NavigationTarget, intent: Exclude<NavigationIntent, 'traverse'>): void;
  pushFragment(fragment?: string): void;
  back(): void;
  forward(): void;
}

export function useReaderNavigation(
  controller: ReaderController,
  onTraverse: (target?: NavigationTarget) => void,
): ReaderNavigationModel {
  const [snapshot, setSnapshot] = useState<NavigationSnapshot>(() => controller.current());
  const onTraverseRef = useRef(onTraverse);
  onTraverseRef.current = onTraverse;

  useEffect(() => controller.subscribe((next, intent) => {
    setSnapshot(next);
    if (intent === 'traverse') onTraverseRef.current(next.current);
  }), [controller]);

  const record = useCallback((target: NavigationTarget, intent: Exclude<NavigationIntent, 'traverse'>) => {
    controller[intent](target);
  }, [controller]);

  return {
    ...snapshot,
    record,
    pushFragment: (fragment) => controller.pushFragment(fragment),
    back: () => controller.back(),
    forward: () => controller.forward(),
  };
}

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
  openImported(document: import('../../../shared/types').ImportedDocument, fragment?: string, intent?: NavigationIntent, sessionId?: string): Promise<void>;
  t: Translator;
}

export function useNavigationRestoration(options: NavigationRestorationOptions) {
  const [restorable, setRestorable] = useState<RestorableNavigation>();

  const showFailure = useCallback((failure: ReaderError, restore?: RestorableNavigation) => {
    options.showError(failure);
    setRestorable(restore);
    options.replaceSession(createUnavailableSession(options.t('unavailableDocument')));
    options.setSidebarMode(restore?.kind === 'workspace' ? 'files' : null);
    options.queueDocumentNavigation(undefined);
    scrollTo({ top: 0 });
  }, [options]);

  const navigateToTarget = useCallback(async (target?: NavigationTarget) => {
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
      if (!stored) {
        showFailure({ code: 'workspace-read-failed', retryable: true });
        return;
      }
      if (await options.controller.queryRead(stored.handle) !== 'granted') {
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
      if (!stored) {
        showFailure({ code: 'file-read-failed', retryable: true });
        return;
      }
      if (await options.controller.queryRead(stored.handle) !== 'granted') {
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
      if (!await options.controller.hasRemoteOrigin(target.document.url)) {
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
  }, [options, showFailure]);

  const restore = useCallback(async () => {
    if (!restorable) return;
    if (restorable.kind === 'remote') {
      const target = restorable.target.document as { kind: 'remote'; url: string };
      if (!await options.controller.requestRemoteOrigin(target.url)) {
        options.showError({ code: 'permission-denied', retryable: true });
        return;
      }
      await options.openRemote(target.url, false, 'traverse', restorable.target.fragment);
    } else if (restorable.kind === 'workspace') {
      const target = restorable.target.document as { kind: 'workspace-file'; workspaceId: string; filePath: string };
      const stored = await options.controller.getWorkspace(target.workspaceId);
      if (!stored || await options.controller.requestRead(stored.handle) !== 'granted') {
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
      if (!stored || await options.controller.requestRead(stored.handle) !== 'granted') {
        options.showError({ code: 'permission-denied', retryable: true });
        return;
      }
      await options.openLocalHandle(stored.handle, stored.id, restorable.target.fragment, 'traverse');
    }
    setRestorable(undefined);
    options.setRestorableWorkspace(undefined);
  }, [options, restorable]);

  return {
    restorable,
    navigateToTarget,
    restore,
    dismiss: () => setRestorable(undefined),
  };
}
