import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { PersistedWorkspaceHandle } from '../../../application/ports/handleRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import type { NavigationTarget } from '../../../domain/navigation/navigationTarget';
import type { ImportedDocument, ReaderSettings, SidebarMode } from '../../../shared/types';
import type { RecentItem } from '../../../application/ports/recentRepository';

interface ReaderInitializationOptions {
  controller: ReaderController;
  currentTarget?: NavigationTarget;
  replaceSettings(settings: ReaderSettings): void;
  replaceRecent(items: RecentItem[]): void;
  openImported(document: ImportedDocument): Promise<void>;
  navigateToTarget(target: NavigationTarget): Promise<void>;
  activateWorkspace(handle: FileSystemDirectoryHandle, path?: string, id?: string): Promise<boolean>;
  setRestorableWorkspace(value: PersistedWorkspaceHandle): void;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode | null>>;
}

export function useReaderInitialization(options: ReaderInitializationOptions): void {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const initializedReader = await options.controller.initialize();
      options.replaceSettings(initializedReader.settings);
      options.replaceRecent(initializedReader.recent);
      if (initializedReader.handoff) {
        await options.openImported(initializedReader.handoff);
        return;
      }
      if (options.currentTarget) {
        await options.navigateToTarget(options.currentTarget);
        return;
      }
      if (!('showDirectoryPicker' in window)) return;
      try {
        const storedWorkspace = await options.controller.getActiveWorkspace();
        if (!storedWorkspace) return;
        if (await options.controller.queryRead(storedWorkspace.handle) === 'granted') {
          await options.activateWorkspace(storedWorkspace.handle, undefined, storedWorkspace.id);
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
