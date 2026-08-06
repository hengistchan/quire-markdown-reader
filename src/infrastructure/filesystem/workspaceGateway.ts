import type { WorkspaceGateway, WorkspaceScanRequest } from '../../application/ports/workspaceGateway';
import { collectWorkspace, createTransientDirectoryHandle } from '../../core/files';

export class FileSystemWorkspaceGateway implements WorkspaceGateway {
  scan(handle: FileSystemDirectoryHandle, request: WorkspaceScanRequest = {}) {
    return collectWorkspace(handle, request);
  }

  createTransient(files: Iterable<File>): FileSystemDirectoryHandle | undefined {
    return createTransientDirectoryHandle(files);
  }
}
