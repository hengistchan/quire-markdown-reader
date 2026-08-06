export interface PersistedWorkspaceHandle {
  id: string;
  kind: 'workspace';
  name: string;
  handle: FileSystemDirectoryHandle;
  savedAt: number;
}

export interface PersistedFileHandle {
  id: string;
  kind: 'file';
  name: string;
  handle: FileSystemFileHandle;
  savedAt: number;
}

export interface HandleRepository {
  saveWorkspace(handle: FileSystemDirectoryHandle, existingId?: string): Promise<string>;
  saveFile(handle: FileSystemFileHandle, existingId?: string): Promise<string>;
  getActiveWorkspace(): Promise<PersistedWorkspaceHandle | undefined>;
  getWorkspace(id: string): Promise<PersistedWorkspaceHandle | undefined>;
  getFile(id: string): Promise<PersistedFileHandle | undefined>;
  clearWorkspace(): Promise<void>;
}
