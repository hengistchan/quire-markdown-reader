import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReaderController } from '../../../application/reader/readerController';
import { NavigationOperationController } from '../../../application/navigation/navigationOperationController';
import { WorkspaceScanError } from '../../../shared/errors/workspaceScanError';
import type { WorkspaceFile, WorkspaceSnapshot } from '../../../shared/types';
import { useWorkspace } from './useWorkspace';

function workspaceFixture(name = 'Candidate B'): WorkspaceSnapshot {
  const handle = { kind: 'directory', name } as FileSystemDirectoryHandle;
  const file: WorkspaceFile = {
    id: 'README.md',
    name: 'README.md',
    path: 'README.md',
    depth: 0,
    handle: { kind: 'file', name: 'README.md' } as FileSystemFileHandle,
  };
  return {
    name,
    handle,
    files: [file],
    tree: [{ id: file.id, name: file.name, path: file.path, depth: 0, kind: 'file', file }],
  };
}

function setup(scanWorkspace: ReturnType<typeof vi.fn>) {
  const controller = {
    scanWorkspace,
    saveWorkspace: vi.fn(async () => 'candidate-b'),
    setActiveWorkspace: vi.fn(async () => undefined),
  } as unknown as ReaderController;
  const openWorkspaceFile = vi.fn(async () => undefined);
  const showError = vi.fn();
  const navigationOperation = new NavigationOperationController();
  const options = {
    controller,
    openWorkspaceFile,
    rememberRecentResource: vi.fn(async () => undefined),
    navigationOperation,
    setSidebarMode: vi.fn(),
    closeOverlay: vi.fn(),
    showError,
    showNotice: vi.fn(),
    t: vi.fn((key: string) => key),
  };
  const hook = renderHook(() => useWorkspace(options));
  return { ...hook, controller, navigationOperation, openWorkspaceFile, showError };
}

describe('useWorkspace activation transaction', () => {
  it('persists a candidate without replacing the active workspace until its first file opens', async () => {
    const snapshot = workspaceFixture();
    const scanWorkspace = vi.fn(async () => snapshot);
    const { result, controller, openWorkspaceFile } = setup(scanWorkspace);

    await act(async () => {
      await expect(result.current.activate(snapshot.handle)).resolves.toBe(true);
    });

    expect(controller.saveWorkspace).toHaveBeenCalledWith(snapshot.handle, undefined);
    expect(openWorkspaceFile).toHaveBeenCalledWith(
      snapshot.files[0],
      expect.objectContaining({ id: 'candidate-b' }),
      undefined,
      'push',
      expect.any(AbortSignal),
    );
    expect(controller.setActiveWorkspace).toHaveBeenCalledWith('candidate-b');
    expect(vi.mocked(openWorkspaceFile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(controller.setActiveWorkspace).mock.invocationCallOrder[0]!,
    );
  });

  it('does not persist or activate an empty candidate workspace', async () => {
    const snapshot = { ...workspaceFixture(), files: [], tree: [] };
    const { result, controller, openWorkspaceFile, showError } = setup(vi.fn(async () => snapshot));

    await act(async () => {
      await expect(result.current.activate(snapshot.handle)).resolves.toBe(false);
    });

    expect(controller.saveWorkspace).not.toHaveBeenCalled();
    expect(openWorkspaceFile).not.toHaveBeenCalled();
    expect(controller.setActiveWorkspace).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith({ code: 'workspace-empty', retryable: false });
  });

  it('keeps the current workspace active when scanning exceeds a limit', async () => {
    const snapshot = workspaceFixture();
    const error = new WorkspaceScanError('max-entries');
    const { result, controller, openWorkspaceFile, showError } = setup(vi.fn(async () => Promise.reject(error)));

    await act(async () => {
      await expect(result.current.activate(snapshot.handle)).resolves.toBe(false);
    });

    expect(controller.saveWorkspace).not.toHaveBeenCalled();
    expect(openWorkspaceFile).not.toHaveBeenCalled();
    expect(controller.setActiveWorkspace).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith({
      code: 'workspace-scan-limit',
      cause: error,
      retryable: true,
    });
  });

  it('keeps the current workspace active when the scan is cancelled', async () => {
    const snapshot = workspaceFixture();
    const scanWorkspace = vi.fn(
      (_handle: FileSystemDirectoryHandle, signal: AbortSignal) =>
        new Promise<WorkspaceSnapshot>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new WorkspaceScanError('cancelled')), { once: true });
        }),
    );
    const { result, controller, navigationOperation, openWorkspaceFile, showError } = setup(scanWorkspace);

    let activation!: Promise<boolean>;
    act(() => {
      activation = result.current.activate(snapshot.handle);
    });
    await waitFor(() => expect(result.current.scanning).toBe(true));
    act(() => navigationOperation.cancel());
    await act(async () => {
      await expect(activation).resolves.toBe(false);
    });

    expect(controller.saveWorkspace).not.toHaveBeenCalled();
    expect(openWorkspaceFile).not.toHaveBeenCalled();
    expect(controller.setActiveWorkspace).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });
});
