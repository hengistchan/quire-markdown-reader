import type { ImportedDocument } from '../shared/types';
import { cleanupExpiredDocumentHandoffs, createDocumentHandoff } from '../infrastructure/handoffStore';
import { isOpenLocalMarkdownMessage } from './localMarkdown';

type ExtensionApi = typeof browser;

export async function openViewer(document?: ImportedDocument, api: ExtensionApi = browser): Promise<void> {
  const viewerUrl = api.runtime.getURL('/viewer.html');
  const url = document
    ? `${viewerUrl}?handoff=${encodeURIComponent(await createDocumentHandoff(document))}`
    : viewerUrl;
  await api.tabs.create({ url });
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
  void api.storage.local.remove('importedDocument');
  void cleanupExpiredDocumentHandoffs().catch(() => undefined);

  api.runtime.onMessage.addListener((message, sender) => {
    if (!isOpenLocalMarkdownMessage(message) || sender.tab?.id === undefined) return undefined;
    return createDocumentHandoff(message.document).then((handoffId) => ({
      viewerUrl: `${api.runtime.getURL('/viewer.html')}?handoff=${encodeURIComponent(handoffId)}`,
    }));
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
