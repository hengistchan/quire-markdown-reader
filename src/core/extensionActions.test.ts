import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { beforeEach } from 'vitest';
import { takeDocumentHandoff } from '../infrastructure/handoffStore';
import { OPEN_LOCAL_MARKDOWN } from './localMarkdown';
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
  const onMessage = event<(message: unknown, sender: Browser.runtime.MessageSender) => Promise<void> | undefined>();
  return {
    api: {
      storage: { local: { set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) } },
      tabs: {
        create: vi.fn(async () => ({ id: 2 })),
        update: vi.fn(async () => ({ id: 1 })),
        query: vi.fn(async () => [{ id: 1, title: 'Active' }]),
      },
      runtime: { getURL: vi.fn((path: string) => `moz-extension://quire${path}`), onInstalled, onMessage },
      scripting: { executeScript: vi.fn(async () => [{ result: { title: 'Page', markdown: '# Page', sourceUrl: 'https://example.com' } }]) },
      i18n: { getMessage: vi.fn(() => 'Open in Quire') },
      contextMenus: { removeAll: vi.fn(async () => undefined), create: vi.fn(), onClicked: onContext },
      action: { onClicked: onAction },
      commands: { onCommand },
    } as unknown as typeof browser,
    onInstalled, onAction, onCommand, onContext, onMessage,
  };
}

async function deleteHandoffDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('quire-document-handoffs');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function handoffIdFromUrl(value: string): string {
  return new URL(value).searchParams.get('handoff') ?? '';
}

describe('extension entry actions', () => {
  beforeEach(deleteHandoffDatabase);

  it('opens a clean viewer when there is no imported document', async () => {
    const { api } = extensionApi();
    await openViewer(undefined, api);
    expect(api.tabs.create).toHaveBeenCalledWith({ url: 'moz-extension://quire/viewer.html' });
  });

  it('imports the active tab before opening the viewer', async () => {
    const { api } = extensionApi();
    await importActiveTab({ id: 7 } as Browser.tabs.Tab, api);
    expect(api.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }));
    const url = vi.mocked(api.tabs.create).mock.calls[0]?.[0].url ?? '';
    await expect(takeDocumentHandoff(handoffIdFromUrl(url))).resolves.toEqual({
      title: 'Page', markdown: '# Page', sourceUrl: 'https://example.com',
    });
  });

  it('falls back to a clean viewer if page access is denied', async () => {
    const { api } = extensionApi();
    vi.mocked(api.scripting.executeScript).mockRejectedValueOnce(new Error('denied'));
    await importActiveTab({ id: 7 } as Browser.tabs.Tab, api);
    expect(api.tabs.create).toHaveBeenCalledWith({ url: 'moz-extension://quire/viewer.html' });
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

  it('stages a local Markdown document without navigating away from its path', async () => {
    const harness = extensionApi();
    registerBrowserHandlers(harness.api);
    const document = { title: 'README.md', markdown: '# Local', sourceUrl: 'file:///tmp/README.md' };

    const response = await harness.onMessage.fire(
      { type: OPEN_LOCAL_MARKDOWN, document },
      { tab: { id: 9 } } as Browser.runtime.MessageSender,
    );

    const viewerUrl = (response as unknown as { viewerUrl?: string } | undefined)?.viewerUrl ?? '';
    expect(viewerUrl).toMatch(/^moz-extension:\/\/quire\/viewer\.html\?handoff=/);
    await expect(takeDocumentHandoff(handoffIdFromUrl(viewerUrl))).resolves.toEqual(document);
    expect(harness.api.tabs.update).not.toHaveBeenCalled();
    expect(harness.api.tabs.create).not.toHaveBeenCalled();
  });

  it('ignores local-import messages without a Markdown file URL or sender tab', async () => {
    const harness = extensionApi();
    registerBrowserHandlers(harness.api);

    await harness.onMessage.fire(
      { type: OPEN_LOCAL_MARKDOWN, document: { title: 'Page', markdown: 'text', sourceUrl: 'file:///tmp/page.txt' } },
      { tab: { id: 9 } } as Browser.runtime.MessageSender,
    );
    await harness.onMessage.fire(
      { type: OPEN_LOCAL_MARKDOWN, document: { title: 'README.md', markdown: '# Local', sourceUrl: 'file:///tmp/README.md' } },
      {} as Browser.runtime.MessageSender,
    );

    expect(harness.api.tabs.update).not.toHaveBeenCalled();
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
