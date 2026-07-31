import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearWorkspaceHandle, loadWorkspaceHandle, saveWorkspaceHandle } from './workspacePersistence';

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('quire-workspaces');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe('workspace handle persistence', () => {
  beforeEach(deleteDatabase);

  it('restores and clears the active directory handle', async () => {
    const handle = { kind: 'directory', name: 'notes' } as FileSystemDirectoryHandle;
    await saveWorkspaceHandle(handle);
    await expect(loadWorkspaceHandle()).resolves.toEqual(handle);
    await clearWorkspaceHandle();
    await expect(loadWorkspaceHandle()).resolves.toBeUndefined();
  });
});
