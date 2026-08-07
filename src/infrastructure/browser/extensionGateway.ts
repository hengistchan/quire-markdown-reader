import type { ImportedDocument } from '../../shared/types';
import {
  isOpenLocalMarkdownMessage, isReadLocalMarkdownAssetMessage, type ReadLocalMarkdownAssetResponse,
} from '../../core/localMarkdown';
import { cleanupExpiredDocumentHandoffs, createDocumentHandoff } from '../handoffStore';

type ExtensionApi = typeof browser;
const MAX_LOCAL_ASSET_BYTES = 5 * 1024 * 1024;

function localAssetMimeType(url: URL): string {
  const extension = url.pathname.split('.').pop()?.toLowerCase();
  return ({
    avif: 'image/avif', gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg',
    png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp',
  } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream';
}

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function readLocalMarkdownAsset(
  sourceUrl: string,
  href: string,
  fetcher: typeof fetch = fetch,
): Promise<ReadLocalMarkdownAssetResponse> {
  try {
    const url = new URL(href, sourceUrl);
    if (url.protocol !== 'file:' || !/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)) return { error: 'invalid-url' };
    url.hash = '';
    const response = await fetcher(url.href);
    if (!response.ok && response.status !== 0) return { error: 'read-failed' };
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_LOCAL_ASSET_BYTES) return { error: 'too-large' };
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_LOCAL_ASSET_BYTES) return { error: 'too-large' };
    return { dataUrl: `data:${localAssetMimeType(url)};base64,${encodeBase64(buffer)}` };
  } catch {
    return { error: 'read-failed' };
  }
}

function isViewerSender(sender: Browser.runtime.MessageSender, api: ExtensionApi): boolean {
  if (sender.tab?.id === undefined || !sender.url) return false;
  try {
    const actual = new URL(sender.url);
    const expected = new URL(api.runtime.getURL('/viewer.html'));
    return actual.protocol === expected.protocol && actual.host === expected.host && actual.pathname === expected.pathname;
  } catch {
    return false;
  }
}

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
        format: 'plain-text' as const,
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
    if (isReadLocalMarkdownAssetMessage(message)) {
      if (!isViewerSender(sender, api)) return undefined;
      return readLocalMarkdownAsset(message.sourceUrl, message.href);
    }
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
