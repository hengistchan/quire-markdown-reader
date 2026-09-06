import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PersistedWorkspaceHandle } from '../../../application/ports/handleRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import type { RecentResourceInput } from '../../../application/ports/recentResourceRepository';
import type { NavigationIntent } from '../../../application/navigation/navigationController';
import type { NavigationOperationController } from '../../../application/navigation/navigationOperationController';
import { isLocalMarkdownUrl, localMarkdownPathWithinDirectory, localMarkdownTitle } from '../../../core/localMarkdown';
import { WorkspaceScanError } from '../../../shared/errors/workspaceScanError';
import type { ReaderError } from '../../../shared/errors/readerError';
import type { Translator } from '../../../shared/i18n';
import type { SidebarMode, WorkspaceFile, WorkspaceSnapshot, WorkspaceTreeNode } from '../../../shared/types';

function directoryPaths(nodes: WorkspaceTreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === 'directory' ? [node.path, ...directoryPaths(node.children)] : []));
}

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
    signal?: AbortSignal,
  ): Promise<void>;
  rememberRecentResource(resource: RecentResourceInput, signal?: AbortSignal): Promise<void>;
  navigationOperation: NavigationOperationController;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode | null>>;
  closeOverlay(): void;
  showError(error: ReaderError | undefined): void;
  showNotice(notice: string): void;
  t: Translator;
}

export function useWorkspace(options: WorkspaceOptions) {
  const {
    controller,
    sourceUrl,
    workspace,
    activeFile,
    openWorkspaceFile,
    setSidebarMode,
    closeOverlay,
    showError,
    showNotice,
    t,
    navigationOperation,
    rememberRecentResource,
  } = options;
  const [restorable, setRestorable] = useState<PersistedWorkspaceHandle>();
  const [scanning, setScanning] = useState(false);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(new Set());
  const workspaceDirectoryPaths = useMemo(() => directoryPaths(workspace?.tree ?? []), [workspace?.tree]);
  const allDirectoriesCollapsed =
    workspaceDirectoryPaths.length > 0 && workspaceDirectoryPaths.every((path) => collapsedDirectories.has(path));
  const directoryInput = useRef<HTMLInputElement>(null);
  const currentScan = useRef<AbortSignal | undefined>(undefined);

  const activate = useCallback(
    async (
      handle: FileSystemDirectoryHandle,
      preferredPath?: string,
      existingId?: string,
      navigationMode: NavigationIntent = 'push',
      transient = false,
      fragment?: string,
      operationSignal?: AbortSignal,
      rememberResource = false,
    ): Promise<boolean> => {
      const signal = operationSignal ?? navigationOperation.begin();
      if (signal.aborted) return false;
      currentScan.current = signal;
      setScanning(true);
      try {
        const snapshot = await controller.scanWorkspace(handle, signal, existingId);
        if (signal.aborted) return false;
        snapshot.transient = transient;
        const selected =
          snapshot.files.find((file) => file.path === preferredPath) ??
          snapshot.files.find((file) => /^readme\.(md|markdown|mdx)$/i.test(file.path)) ??
          snapshot.files[0];
        if (!selected) {
          if (signal.aborted) return false;
          showError({ code: 'workspace-empty', retryable: false });
          return false;
        }
        if (!transient) {
          snapshot.id = await controller.saveWorkspace(handle, existingId);
          if (signal.aborted) return false;
        }
        await openWorkspaceFile(selected, snapshot, fragment, navigationMode, signal);
        if (signal.aborted) return false;
        if (snapshot.id) {
          await controller.setActiveWorkspace(snapshot.id);
          if (signal.aborted) return false;
        }
        if (rememberResource && snapshot.id) {
          await rememberRecentResource(
            {
              id: `workspace:${snapshot.id}`,
              title: snapshot.name,
              kind: 'workspace',
              workspaceId: snapshot.id,
              lastFilePath: selected.path,
            },
            signal,
          );
          if (signal.aborted) return false;
        }
        setSidebarMode('files');
        return true;
      } catch (caught) {
        if (signal.aborted) return false;
        if (caught instanceof WorkspaceScanError) {
          if (caught.code !== 'cancelled') {
            showError({ code: 'workspace-scan-limit', cause: caught, retryable: true });
          }
          return false;
        }
        throw caught;
      } finally {
        if (currentScan.current === signal) {
          currentScan.current = undefined;
          setScanning(false);
        }
      }
    },
    [controller, navigationOperation, openWorkspaceFile, rememberRecentResource, setSidebarMode, showError],
  );

  const openDirectory = async () => {
    const signal = navigationOperation.begin();
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
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      if (signal.aborted) return;
      await activate(handle, undefined, undefined, 'push', false, undefined, signal, true);
    } catch (caught) {
      if (signal.aborted) return;
      const name = (caught as DOMException).name;
      if (name === 'NotAllowedError') showError({ code: 'permission-denied', cause: caught, retryable: true });
      else if (name !== 'AbortError') showError({ code: 'workspace-read-failed', cause: caught, retryable: true });
    }
  };

  const openTransient = async (files: FileList | null) => {
    const handle = files ? controller.createTransientWorkspace(files) : undefined;
    if (!handle) return;
    const signal = navigationOperation.begin();
    const preferredPath =
      sourceUrl && isLocalMarkdownUrl(sourceUrl)
        ? (localMarkdownPathWithinDirectory(sourceUrl, handle.name) ?? localMarkdownTitle(sourceUrl))
        : undefined;
    await activate(handle, preferredPath, undefined, 'push', true, undefined, signal);
    if (signal.aborted) return;
    if (directoryInput.current) directoryInput.current.value = '';
  };

  const restore = async () => {
    if (!restorable) return;
    const signal = navigationOperation.begin();
    const permission = await controller.requestRead(restorable.handle);
    if (signal.aborted) return;
    if (permission !== 'granted') {
      showError({ code: 'permission-denied', retryable: true });
      return;
    }
    await activate(restorable.handle, undefined, restorable.id, 'replace', false, undefined, signal);
    if (signal.aborted) return;
    setRestorable(undefined);
  };

  const refresh = async () => {
    if (!workspace) return;
    const refreshed = await activate(workspace.handle, activeFile?.path, workspace.id, 'traverse');
    if (refreshed) showNotice(t('workspaceRefreshed'));
  };

  const toggleDirectory = (path: string) =>
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const toggleAllDirectories = () =>
    setCollapsedDirectories((current) => {
      const allCollapsed =
        workspaceDirectoryPaths.length > 0 && workspaceDirectoryPaths.every((path) => current.has(path));
      return allCollapsed ? new Set() : new Set(workspaceDirectoryPaths);
    });

  return {
    restorable,
    setRestorable,
    scanning,
    collapsedDirectories,
    allDirectoriesCollapsed,
    hasDirectories: workspaceDirectoryPaths.length > 0,
    directoryInput,
    activate,
    cancelScan: () => navigationOperation.cancel(),
    openDirectory,
    openTransient,
    restore,
    refresh,
    dismissRestore: () => setRestorable(undefined),
    toggleDirectory,
    toggleAllDirectories,
  };
}
