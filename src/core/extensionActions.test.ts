import { describe, expect, it, vi } from 'vitest';
import { importActiveTab, openViewer, registerBrowserHandlers } from './extensionActions';

function event<T extends (...args: never[]) => unknown>() {
  let listener: T | undefined;
  return {
    addListener: vi.fn((next: T) => { listener = next; }),
    fire: (...args: Parameters<T>) => listener?.(...args),
  };
}

function extensionApi() {
  const onInstalled = event<() => Promise<void>>();
  const onAction = event<(tab: Browser.tabs.Tab) => Promise<void>>();
  const onCommand = event<(command: string) => Promise<void>>();
  const onContext = event<(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) => Promise<void>>();
  return {
    api: {
      storage: { local: { set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) } },
      tabs: {
        create: vi.fn(async () => ({ id: 2 })),
        query: vi.fn(async () => [{ id: 1, title: 'Active' }]),
      },
      runtime: { getURL: vi.fn((path: string) => `moz-extension://quire${path}`), onInstalled },
      scripting: { executeScript: vi.fn(async () => [{ result: { title: 'Page', markdown: '# Page', sourceUrl: 'https://example.com' } }]) },
      i18n: { getMessage: vi.fn(() => 'Open in Quire') },
      contextMenus: { removeAll: vi.fn(async () => undefined), create: vi.fn(), onClicked: onContext },
      action: { onClicked: onAction },
      commands: { onCommand },
    } as unknown as typeof browser,
    onInstalled, onAction, onCommand, onContext,
  };
}

describe('extension entry actions', () => {
  it('opens a clean viewer when there is no imported document', async () => {
    const { api } = extensionApi();
    await openViewer(undefined, api);
    expect(api.storage.local.remove).toHaveBeenCalledWith('importedDocument');
    expect(api.tabs.create).toHaveBeenCalledWith({ url: 'moz-extension://quire/viewer.html' });
  });

  it('imports the active tab before opening the viewer', async () => {
    const { api } = extensionApi();
    await importActiveTab({ id: 7 } as Browser.tabs.Tab, api);
    expect(api.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }));
    expect(api.storage.local.set).toHaveBeenCalledWith({
      importedDocument: { title: 'Page', markdown: '# Page', sourceUrl: 'https://example.com' },
    });
  });

  it('falls back to a clean viewer if page access is denied', async () => {
    const { api } = extensionApi();
    vi.mocked(api.scripting.executeScript).mockRejectedValueOnce(new Error('denied'));
    await importActiveTab({ id: 7 } as Browser.tabs.Tab, api);
    expect(api.storage.local.remove).toHaveBeenCalledWith('importedDocument');
    expect(api.tabs.create).toHaveBeenCalledOnce();
  });

  it('wires installation, action, shortcut, and context-menu flows', async () => {
    const harness = extensionApi();
    registerBrowserHandlers(harness.api);

    await harness.onInstalled.fire();
    expect(harness.api.contextMenus.removeAll).toHaveBeenCalledOnce();
    expect(harness.api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'open-in-quire' }));

    await harness.onAction.fire({ id: 1 } as Browser.tabs.Tab);
    await harness.onCommand.fire('ignored');
    await harness.onCommand.fire('open-reader');
    await harness.onContext.fire({ menuItemId: 'ignored' } as Browser.contextMenus.OnClickData);
    await harness.onContext.fire({ menuItemId: 'open-in-quire' } as Browser.contextMenus.OnClickData, { id: 1 } as Browser.tabs.Tab);
    expect(harness.api.scripting.executeScript).toHaveBeenCalledTimes(3);
  });

  it('uses the Firefox MV2 browserAction API when action is unavailable', async () => {
    const harness = extensionApi();
    const firefoxApi = harness.api as unknown as Record<string, unknown>;
    firefoxApi.browserAction = harness.api.action;
    delete firefoxApi.action;

    registerBrowserHandlers(firefoxApi as unknown as typeof browser);
    await harness.onAction.fire({ id: 1 } as Browser.tabs.Tab);

    expect(harness.api.scripting.executeScript).toHaveBeenCalledOnce();
  });
});
