import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { PersistedWorkspaceHandle } from '../../../application/ports/handleRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import type { NavigationTarget } from '../../../domain/navigation/navigationTarget';
import type { ImportedDocument, ReaderSettings, SidebarMode } from '../../../shared/types';
import type { RecentItem } from '../../../application/ports/recentRepository';
import type { RecentResource } from '../../../application/ports/recentResourceRepository';
import type { NavigationOperationController } from '../../../application/navigation/navigationOperationController';

interface ReaderInitializationOptions {
  controller: ReaderController;
  currentTarget?: NavigationTarget;
  replaceSettings(settings: ReaderSettings): void;
  replaceRecent(items: RecentItem[]): void;
  replaceRecentResources(items: RecentResource[]): void;
  openImported(document: ImportedDocument, signal?: AbortSignal): Promise<void>;
  navigateToTarget(target: NavigationTarget, signal?: AbortSignal): Promise<void>;
  activateWorkspace(
    handle: FileSystemDirectoryHandle,
    path?: string,
    id?: string,
    signal?: AbortSignal,
  ): Promise<boolean>;
  navigationOperation: NavigationOperationController;
  setRestorableWorkspace(value: PersistedWorkspaceHandle): void;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode | null>>;
}

export function useReaderInitialization(options: ReaderInitializationOptions): void {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const signal = options.navigationOperation.begin();
      const initializedReader = await options.controller.initialize();
      options.replaceSettings(initializedReader.settings);
      options.replaceRecent(initializedReader.recent);
      options.replaceRecentResources(initializedReader.recentResources);
      if (signal.aborted) return;
      if (initializedReader.handoff) {
        await options.openImported(initializedReader.handoff, signal);
        return;
      }
      if (options.currentTarget) {
        await options.navigateToTarget(options.currentTarget, signal);
        return;
      }
      if (!('showDirectoryPicker' in window)) return;
      try {
        const storedWorkspace = await options.controller.getActiveWorkspace();
        if (signal.aborted) return;
        if (!storedWorkspace) return;
        const permission = await options.controller.queryRead(storedWorkspace.handle);
        if (signal.aborted) return;
        if (permission === 'granted') {
          const recentWorkspace = initializedReader.recentResources.find(
            (resource) => resource.kind === 'workspace' && resource.workspaceId === storedWorkspace.id,
          );
          await options.activateWorkspace(
            storedWorkspace.handle,
            recentWorkspace?.kind === 'workspace' ? recentWorkspace.lastFilePath : undefined,
            storedWorkspace.id,
            signal,
          );
        } else {
          options.setRestorableWorkspace(storedWorkspace);
          options.setSidebarMode('files');
        }
      } catch {
        // An old or browser-incompatible handle should not block the reader.
      }
    })();
  }, [options]);
}
