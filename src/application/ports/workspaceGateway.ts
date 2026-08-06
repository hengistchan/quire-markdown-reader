import type { WorkspaceSnapshot } from '../../shared/types';

export interface WorkspaceScanRequest {
  signal?: AbortSignal;
  workspaceId?: string;
}

export interface WorkspaceGateway {
  scan(handle: FileSystemDirectoryHandle, request?: WorkspaceScanRequest): Promise<WorkspaceSnapshot>;
  createTransient(files: Iterable<File>): FileSystemDirectoryHandle | undefined;
}
