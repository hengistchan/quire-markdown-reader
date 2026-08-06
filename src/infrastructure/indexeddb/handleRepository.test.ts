import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearWorkspaceHandle, loadActiveWorkspace, loadFileRecord, loadWorkspaceHandle, loadWorkspaceRecord,
  saveFileHandle, saveWorkspaceHandle,
} from './handleRepository';

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
    const id = await saveWorkspaceHandle(handle);
    await expect(loadWorkspaceHandle()).resolves.toEqual(handle);
    await expect(loadWorkspaceRecord(id)).resolves.toMatchObject({ id, name: 'notes', handle });
    await clearWorkspaceHandle();
    await expect(loadWorkspaceHandle()).resolves.toBeUndefined();
  });

  it('keeps same-named workspaces under separate stable IDs', async () => {
    const first = { kind: 'directory', name: 'docs' } as FileSystemDirectoryHandle;
    const second = { kind: 'directory', name: 'docs' } as FileSystemDirectoryHandle;
    const firstId = await saveWorkspaceHandle(first);
    const secondId = await saveWorkspaceHandle(second);

    expect(firstId).not.toBe(secondId);
    await expect(loadWorkspaceHandle(firstId)).resolves.toEqual(first);
    await expect(loadWorkspaceHandle(secondId)).resolves.toEqual(second);
    await expect(loadActiveWorkspace()).resolves.toMatchObject({ id: secondId, handle: second });
  });

  it('persists individual file handles independently', async () => {
    const first = { kind: 'file', name: 'README.md' } as FileSystemFileHandle;
    const second = { kind: 'file', name: 'README.md' } as FileSystemFileHandle;
    const firstId = await saveFileHandle(first);
    const secondId = await saveFileHandle(second);

    expect(firstId).not.toBe(secondId);
    await expect(loadFileRecord(firstId)).resolves.toMatchObject({ id: firstId, handle: first });
    await expect(loadFileRecord(secondId)).resolves.toMatchObject({ id: secondId, handle: second });
  });
});
