import { describe, expect, it, vi } from 'vitest';
import type { ReaderControllerDependencies } from './readerController';
import { ReaderController } from './readerController';
import { defaultSettings } from '../../shared/defaultSettings';

function dependencies(): ReaderControllerDependencies {
  return {
    settingsRepository: { load: vi.fn(async () => defaultSettings), save: vi.fn(async () => undefined) },
    recentRepository: {
      list: vi.fn(async () => []), put: vi.fn(async () => []), updatePosition: vi.fn(async () => []),
    },
    handleRepository: {
      saveWorkspace: vi.fn(async () => 'workspace'), saveFile: vi.fn(async () => 'file'),
      getActiveWorkspace: vi.fn(async () => undefined), getWorkspace: vi.fn(async () => undefined),
      getFile: vi.fn(async () => undefined), clearWorkspace: vi.fn(async () => undefined),
    },
    handoffRepository: { take: vi.fn(async () => ({ title: 'Handoff.md', markdown: '# Handoff' })) },
    documentSourceFactory: {
      createImported: vi.fn(), createLocalFile: vi.fn(), createWorkspaceFile: vi.fn(), createRemote: vi.fn(),
    },
    documentService: {
      open: vi.fn(), refresh: vi.fn(), resolveAsset: vi.fn(), resolveLink: vi.fn(), dispose: vi.fn(),
    } as unknown as ReaderControllerDependencies['documentService'],
    importedDocumentRegistry: {
      put: vi.fn((_document, id) => id ?? 'imported'), get: vi.fn(), remove: vi.fn(), clear: vi.fn(),
    },
    navigationController: {
      push: vi.fn(), replace: vi.fn(), pushFragment: vi.fn(), back: vi.fn(), forward: vi.fn(), subscribe: vi.fn(),
    } as unknown as ReaderControllerDependencies['navigationController'],
    refreshScheduler: { start: vi.fn() },
    permissionGateway: {
      hasRemoteOrigin: vi.fn(async () => true), requestRemoteOrigin: vi.fn(async () => true),
      queryRead: vi.fn(async () => 'granted' as const), requestRead: vi.fn(async () => 'granted' as const),
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
});
