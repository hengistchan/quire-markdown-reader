import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PersistedWorkspaceHandle } from '../../../application/ports/handleRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import type { NavigationIntent } from '../../../application/navigation/navigationController';
import {
  isLocalMarkdownUrl, localMarkdownPathWithinDirectory, localMarkdownTitle,
} from '../../../core/localMarkdown';
import { WorkspaceScanError } from '../../../shared/errors/workspaceScanError';
import type { ReaderError } from '../../../shared/errors/readerError';
import type { Translator } from '../../../shared/i18n';
import type { SidebarMode, WorkspaceFile, WorkspaceSnapshot } from '../../../shared/types';

interface WorkspaceOptions {
  controller: ReaderController;
  sourceUrl?: string;
  workspace?: WorkspaceSnapshot;
  activeFile?: WorkspaceFile;
  openWorkspaceFile(
    file: WorkspaceFile,
    workspace?: WorkspaceSnapshot,
    fragment?: string,
    intent?: NavigationIntent,
  ): Promise<void>;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode | null>>;
  closeOverlay(): void;
  showError(error: ReaderError | undefined): void;
  showNotice(notice: string): void;
  t: Translator;
}

export function useWorkspace(options: WorkspaceOptions) {
  const {
    controller, sourceUrl, workspace, activeFile, openWorkspaceFile, setSidebarMode,
    closeOverlay, showError, showNotice, t,
  } = options;
  const [restorable, setRestorable] = useState<PersistedWorkspaceHandle>();
  const [scanning, setScanning] = useState(false);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(new Set());
  const directoryInput = useRef<HTMLInputElement>(null);
  const scanController = useRef<AbortController | undefined>(undefined);

  const activate = useCallback(async (
    handle: FileSystemDirectoryHandle,
    preferredPath?: string,
    existingId?: string,
    navigationMode: NavigationIntent = 'push',
    transient = false,
    fragment?: string,
  ): Promise<boolean> => {
    scanController.current?.abort();
    const request = new AbortController();
    scanController.current = request;
    setScanning(true);
    try {
      const workspaceId = transient ? undefined : await controller.saveWorkspace(handle, existingId);
      const snapshot = await controller.scanWorkspace(handle, request.signal, workspaceId);
      snapshot.transient = transient;
      setSidebarMode('files');
      const selected = snapshot.files.find((file) => file.path === preferredPath)
        ?? snapshot.files.find((file) => /^readme\.(md|markdown|mdx)$/i.test(file.path))
        ?? snapshot.files[0];
      if (!selected) {
        showError({ code: 'workspace-empty', retryable: false });
        return false;
      }
      await openWorkspaceFile(selected, snapshot, fragment, navigationMode);
      return true;
    } catch (caught) {
      if (caught instanceof WorkspaceScanError) {
        if (caught.code !== 'cancelled') {
          showError({ code: 'workspace-scan-limit', cause: caught, retryable: true });
        }
        return false;
      }
      throw caught;
    } finally {
      if (scanController.current === request) {
        scanController.current = undefined;
        setScanning(false);
      }
    }
  }, [controller, openWorkspaceFile, setSidebarMode, showError]);

  const openDirectory = async () => {
    closeOverlay();
    if (window.top !== window && sourceUrl && isLocalMarkdownUrl(sourceUrl)) {
      directoryInput.current?.setAttribute('webkitdirectory', '');
      directoryInput.current?.click();
      return;
    }
    if (!('showDirectoryPicker' in window)) {
      showError({ code: 'folder-unsupported', retryable: false });
      return;
    }
    try {
      await activate(await window.showDirectoryPicker({ mode: 'read' }));
    } catch (caught) {
      const name = (caught as DOMException).name;
      if (name === 'NotAllowedError') showError({ code: 'permission-denied', cause: caught, retryable: true });
      else if (name !== 'AbortError') showError({ code: 'workspace-read-failed', cause: caught, retryable: true });
    }
  };

  const openTransient = async (files: FileList | null) => {
    const handle = files ? controller.createTransientWorkspace(files) : undefined;
    if (!handle) return;
    const preferredPath = sourceUrl && isLocalMarkdownUrl(sourceUrl)
      ? localMarkdownPathWithinDirectory(sourceUrl, handle.name) ?? localMarkdownTitle(sourceUrl)
      : undefined;
    await activate(handle, preferredPath, undefined, 'push', true);
    if (directoryInput.current) directoryInput.current.value = '';
  };

  const restore = async () => {
    if (!restorable) return;
    if (await controller.requestRead(restorable.handle) !== 'granted') {
      showError({ code: 'permission-denied', retryable: true });
      return;
    }
    await activate(restorable.handle, undefined, restorable.id, 'replace');
    setRestorable(undefined);
  };

  const refresh = async () => {
    if (!workspace) return;
    const refreshed = await activate(workspace.handle, activeFile?.path, workspace.id, 'traverse');
    if (refreshed) showNotice(t('workspaceRefreshed'));
  };

  const toggleDirectory = (path: string) => setCollapsedDirectories((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  return {
    restorable,
    setRestorable,
    scanning,
    collapsedDirectories,
    directoryInput,
    activate,
    cancelScan: () => scanController.current?.abort(),
    openDirectory,
    openTransient,
    restore,
    refresh,
    dismissRestore: () => setRestorable(undefined),
    toggleDirectory,
  };
}
