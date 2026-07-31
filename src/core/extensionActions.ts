import type { ImportedDocument } from '../shared/types';
import { isOpenLocalMarkdownMessage } from './localMarkdown';

type ExtensionApi = typeof browser;

export async function openViewer(document?: ImportedDocument, api: ExtensionApi = browser): Promise<void> {
  if (document) await api.storage.local.set({ importedDocument: document });
  else await api.storage.local.remove('importedDocument');
  await api.tabs.create({ url: api.runtime.getURL('/viewer.html') });
}

export async function importActiveTab(tab?: Browser.tabs.Tab, api: ExtensionApi = browser): Promise<void> {
  if (!tab?.id) return openViewer(undefined, api);
  try {
    const injection = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title || location.pathname.split('/').pop() || 'Untitled',
        markdown: document.body?.innerText ?? '',
        sourceUrl: location.href,
      }),
    });
    await openViewer(injection[0]?.result as ImportedDocument | undefined, api);
  } catch {
    await openViewer(undefined, api);
  }
}

export function registerBrowserHandlers(api: ExtensionApi = browser): void {
  api.runtime.onMessage.addListener((message, sender) => {
    if (!isOpenLocalMarkdownMessage(message) || sender.tab?.id === undefined) return undefined;
    return api.storage.local.set({ importedDocument: message.document })
      .then(() => ({ viewerUrl: api.runtime.getURL('/viewer.html') }));
  });

  api.runtime.onInstalled.addListener(async () => {
    await api.contextMenus.removeAll();
    api.contextMenus.create({
      id: 'open-in-quire',
      title: (api.i18n.getMessage as (name: string) => string)('contextMenuTitle') || 'Open in Quire',
      contexts: ['page'],
    });
  });

  const action = api.action ?? api.browserAction;
  action.onClicked.addListener((tab) => importActiveTab(tab, api));
  api.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-reader') return;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    await importActiveTab(tab, api);
  });
  api.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'open-in-quire') return;
    await importActiveTab(tab, api);
  });
}
