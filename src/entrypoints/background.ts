import type { ImportedDocument } from '../shared/types';

export default defineBackground(() => {
  const openViewer = async (document?: ImportedDocument) => {
    if (document) await browser.storage.local.set({ importedDocument: document });
    await browser.tabs.create({ url: browser.runtime.getURL('/viewer.html') });
  };

  const importActiveTab = async (tab?: Browser.tabs.Tab) => {
    if (!tab?.id) return openViewer();
    try {
      const injection = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          title: document.title || location.pathname.split('/').pop() || 'Untitled',
          markdown: document.body?.innerText ?? '',
          sourceUrl: location.href,
        }),
      });
      await openViewer(injection[0]?.result as ImportedDocument | undefined);
    } catch {
      await openViewer();
    }
  };

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'open-in-folio',
      title: 'Open in Folio',
      contexts: ['page'],
    });
  });

  browser.action.onClicked.addListener(importActiveTab);
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-reader') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await importActiveTab(tab);
  });
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'open-in-folio') return;
    await importActiveTab(tab);
  });
});
