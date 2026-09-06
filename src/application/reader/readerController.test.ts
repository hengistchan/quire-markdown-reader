import { describe, expect, it, vi } from 'vitest';
import type { ReaderControllerDependencies } from './readerController';
import { ReaderController } from './readerController';
import { defaultSettings } from '../../shared/defaultSettings';
import type { DocumentSnapshot, DocumentSource } from '../documents/documentSource';
import { RecentResourceService } from '../recent/recentResourceService';

function dependencies(): ReaderControllerDependencies {
  return {
    settingsRepository: { load: vi.fn(async () => defaultSettings), save: vi.fn(async () => undefined) },
    recentRepository: {
      list: vi.fn(async () => []),
      put: vi.fn(async () => []),
      updatePosition: vi.fn(async () => []),
    },
    recentResourceService: new RecentResourceService({
      list: vi.fn(async () => []),
      put: vi.fn(async () => []),
      remove: vi.fn(async () => []),
      updateWorkspaceDocument: vi.fn(async () => []),
    }),
    handleRepository: {
      saveWorkspace: vi.fn(async () => 'workspace'),
      setActiveWorkspace: vi.fn(async () => undefined),
      saveFile: vi.fn(async () => 'file'),
      getActiveWorkspace: vi.fn(async () => undefined),
      getWorkspace: vi.fn(async () => undefined),
      getFile: vi.fn(async () => undefined),
      clearWorkspace: vi.fn(async () => undefined),
    },
    handoffRepository: { take: vi.fn(async () => ({ title: 'Handoff.md', markdown: '# Handoff' })) },
    documentSourceFactory: {
      createImported: vi.fn(),
      createLocalFile: vi.fn(),
      createWorkspaceFile: vi.fn(),
      createRemote: vi.fn(),
    },
    documentService: {
      open: vi.fn(),
      refresh: vi.fn(),
      resolveAsset: vi.fn(),
      resolveLink: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ReaderControllerDependencies['documentService'],
    importedDocumentRegistry: {
      put: vi.fn((_document, id) => id ?? 'imported'),
      get: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    navigationController: {
      push: vi.fn(),
      replace: vi.fn(),
      pushFragment: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as ReaderControllerDependencies['navigationController'],
    refreshScheduler: { start: vi.fn() },
    permissionGateway: {
      hasRemoteOrigin: vi.fn(async () => true),
      requestRemoteOrigin: vi.fn(async () => true),
      queryRead: vi.fn(async () => 'granted' as const),
      requestRead: vi.fn(async () => 'granted' as const),
    },
    initialHandoffId: 'handoff-1',
    workspaceGateway: { scan: vi.fn(), createTransient: vi.fn() },
  };
}

describe('ReaderController', () => {
  it('initializes repositories and consumes an optional handoff without React', async () => {
    const fakes = dependencies();
    const controller = new ReaderController(fakes);

    await expect(controller.initialize()).resolves.toEqual({
      settings: defaultSettings,
      handoff: { title: 'Handoff.md', markdown: '# Handoff' },
      recent: [],
      recentResources: [],
    });
    expect(fakes.handoffRepository.take).toHaveBeenCalledWith('handoff-1');
  });

  it('routes persistence and navigation through replaceable ports', async () => {
    const fakes = dependencies();
    const controller = new ReaderController(fakes);
    const target = { document: { kind: 'remote' as const, url: 'https://example.com/README.md' } };

    await controller.saveSettings({ ...defaultSettings, theme: 'dark' });
    controller.push(target);

    expect(fakes.settingsRepository.save).toHaveBeenCalledWith({ ...defaultSettings, theme: 'dark' });
    expect(fakes.navigationController.push).toHaveBeenCalledWith(target);
  });

  it('forwards the navigation signal through every document source', async () => {
    const fakes = dependencies();
    const controller = new ReaderController(fakes);
    const signal = new AbortController().signal;
    const importedSource = {} as DocumentSource;
    const localSource = {} as DocumentSource;
    const workspaceSource = {} as DocumentSource;
    const remoteSource = {} as DocumentSource;
    const file = {
      id: 'file',
      name: 'README.md',
      path: 'README.md',
      depth: 0,
      handle: {} as FileSystemFileHandle,
    };
    const workspace = {
      id: 'workspace',
      name: 'Workspace',
      files: [file],
      tree: [],
      handle: {} as FileSystemDirectoryHandle,
    };
    const snapshot: DocumentSnapshot = {
      identity: { sourceKind: 'imported', stableId: 'document', displayName: 'Document' },
      title: 'Document',
      markdown: '# Document',
      format: 'markdown',
      metadata: {},
    };
    vi.mocked(fakes.documentSourceFactory.createImported).mockReturnValue(importedSource);
    vi.mocked(fakes.documentSourceFactory.createLocalFile).mockReturnValue(localSource);
    vi.mocked(fakes.documentSourceFactory.createWorkspaceFile).mockReturnValue(workspaceSource);
    vi.mocked(fakes.documentSourceFactory.createRemote).mockReturnValue(remoteSource);
    vi.mocked(fakes.documentService.open).mockResolvedValue(snapshot);

    await controller.openImported({ title: 'Imported', markdown: '# Imported' }, signal);
    await controller.openLocalFile(file, signal);
    await controller.openWorkspaceFile(workspace, file, signal);
    await controller.openRemote('https://example.com/README.md', signal);

    expect(fakes.documentService.open).toHaveBeenNthCalledWith(1, importedSource, signal);
    expect(fakes.documentService.open).toHaveBeenNthCalledWith(2, localSource, signal);
    expect(fakes.documentService.open).toHaveBeenNthCalledWith(3, workspaceSource, signal);
    expect(fakes.documentService.open).toHaveBeenNthCalledWith(4, remoteSource, signal);
  });

  it('does not register an imported document after its navigation was cancelled', async () => {
    const fakes = dependencies();
    const controller = new ReaderController(fakes);
    const operation = new AbortController();
    const reason = new DOMException('Superseded', 'AbortError');
    vi.mocked(fakes.documentSourceFactory.createImported).mockReturnValue({} as DocumentSource);
    vi.mocked(fakes.documentService.open).mockImplementation(async () => {
      operation.abort(reason);
      return {
        identity: { sourceKind: 'imported', stableId: 'document', displayName: 'Document' },
        title: 'Document',
        markdown: '# Document',
        format: 'markdown',
        metadata: {},
      };
    });

    await expect(controller.openImported({ title: 'Imported', markdown: '# Imported' }, operation.signal)).rejects.toBe(
      reason,
    );
    expect(fakes.importedDocumentRegistry.put).not.toHaveBeenCalled();
  });
});
