import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReaderController } from '../../../application/reader/readerController';
import { NavigationOperationController } from '../../../application/navigation/navigationOperationController';
import { useRecentResourceActions } from './useRecentResources';

function options(overrides: Record<string, unknown> = {}) {
  const controller = {
    getWorkspace: vi.fn(async () => undefined),
    getFile: vi.fn(async () => undefined),
    requestRead: vi.fn(async () => 'granted' as PermissionState),
  } as unknown as ReaderController;
  return {
    controller,
    navigationOperation: new NavigationOperationController(),
    readingHistory: [],
    clearResume: vi.fn(),
    prepareResume: vi.fn(),
    openRemote: vi.fn(async () => undefined),
    activateWorkspace: vi.fn(async () => true),
    openLocalHandle: vi.fn(async () => undefined),
    closeOverlay: vi.fn(),
    showError: vi.fn(),
    ...overrides,
  };
}

describe('Recent Resource actions', () => {
  it('reopens and promotes a remote resource as an explicit Open action', async () => {
    const input = options();
    const { result } = renderHook(() => useRecentResourceActions(input));

    await act(() => result.current.open({
      id: 'remote:https://example.com/a.md',
      title: 'A',
      kind: 'remote',
      url: 'https://example.com/a.md',
      openedAt: 1,
    }));

    expect(input.openRemote).toHaveBeenCalledWith(
      'https://example.com/a.md', true, 'push', undefined, expect.any(AbortSignal), true,
    );
    expect(input.closeOverlay).toHaveBeenCalledOnce();
  });

  it('requests permission and restores a workspace last document', async () => {
    const handle = {} as FileSystemDirectoryHandle;
    const input = options();
    vi.mocked(input.controller.getWorkspace).mockResolvedValue({
      id: 'workspace-a', kind: 'workspace', name: 'A', handle, savedAt: 1,
    });
    const { result } = renderHook(() => useRecentResourceActions(input));

    await act(() => result.current.open({
      id: 'workspace:workspace-a',
      title: 'A',
      kind: 'workspace',
      workspaceId: 'workspace-a',
      lastFilePath: 'docs/design.md',
      openedAt: 1,
    }));

    expect(input.controller.requestRead).toHaveBeenCalledWith(handle);
    expect(input.activateWorkspace).toHaveBeenCalledWith(
      handle, 'docs/design.md', 'workspace-a', 'push', false, undefined, expect.any(AbortSignal), true,
    );
  });

  it('keeps unavailable entries while reporting the existing reopen error', async () => {
    const input = options();
    const { result } = renderHook(() => useRecentResourceActions(input));

    await act(() => result.current.open({
      id: 'local-file:missing',
      title: 'Missing.md',
      kind: 'local-file',
      fileId: 'missing',
      openedAt: 1,
    }));

    expect(input.showError).toHaveBeenCalledWith({ code: 'file-read-failed', retryable: true });
    expect(input.openLocalHandle).not.toHaveBeenCalled();
    expect(input.closeOverlay).toHaveBeenCalledOnce();
  });

  it('does not continue a superseded reopen after navigation cancellation', async () => {
    const operation = new NavigationOperationController();
    const input = options({ navigationOperation: operation });
    vi.mocked(input.controller.getWorkspace).mockImplementation(async () => {
      operation.cancel();
      return {
        id: 'workspace-a',
        kind: 'workspace',
        name: 'A',
        handle: {} as FileSystemDirectoryHandle,
        savedAt: 1,
      };
    });
    const { result } = renderHook(() => useRecentResourceActions(input));

    await act(() => result.current.open({
      id: 'workspace:workspace-a',
      title: 'A',
      kind: 'workspace',
      workspaceId: 'workspace-a',
      openedAt: 1,
    }));

    expect(input.controller.requestRead).not.toHaveBeenCalled();
    expect(input.activateWorkspace).not.toHaveBeenCalled();
    expect(input.showError).not.toHaveBeenCalled();
  });
});
