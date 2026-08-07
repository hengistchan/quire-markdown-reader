import {
  createLocalMarkdownImport, isLocalMarkdownUrl, isNavigateLocalMarkdownWorkspaceMessage,
  isOpenLocalMarkdownResponse, localMarkdownPathWithinDirectory, localMarkdownWorkspaceFileUrl,
  localMarkdownWorkspaceHash, localMarkdownWorkspaceRoute, OPEN_LOCAL_MARKDOWN,
  SELECT_LOCAL_MARKDOWN_WORKSPACE_FILE,
} from '../core/localMarkdown';

function mountReader(viewerUrl: string, sourceUrl: string): void {
  const iframe = document.createElement('iframe');
  iframe.src = viewerUrl;
  iframe.title = 'Quire Markdown Reader';
  iframe.allow = 'clipboard-write';
  iframe.dataset.quireReader = '';
  Object.assign(iframe.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    border: '0',
    background: '#fff',
  });
  document.head.replaceChildren();
  document.body.replaceChildren(iframe);
  Object.assign(document.documentElement.style, { margin: '0', height: '100%', visibility: 'visible' });
  Object.assign(document.body.style, { margin: '0', height: '100%', overflow: 'hidden' });

  let activeWorkspaceName: string | undefined;
  let activeFilePath: string | undefined;
  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow || !isNavigateLocalMarkdownWorkspaceMessage(event.data)) return;
    const targetUrl = localMarkdownWorkspaceFileUrl(sourceUrl, event.data.workspaceName, event.data.filePath);
    if (!targetUrl) return;
    activeWorkspaceName = event.data.workspaceName;
    activeFilePath = event.data.filePath;
    const source = new URL(sourceUrl);
    const target = new URL(targetUrl);
    const nextHash = source.pathname === target.pathname
      ? ''
      : localMarkdownWorkspaceHash(event.data);
    if (location.hash.slice(1) !== nextHash) location.hash = nextHash;
  });
  window.addEventListener('hashchange', () => {
    if (!activeWorkspaceName) return;
    const route = localMarkdownWorkspaceRoute(location.href);
    const filePath = route?.workspaceName === activeWorkspaceName
      ? route.filePath
      : localMarkdownPathWithinDirectory(sourceUrl, activeWorkspaceName);
    if (!filePath || filePath === activeFilePath) return;
    activeFilePath = filePath;
    iframe.contentWindow?.postMessage({
      type: SELECT_LOCAL_MARKDOWN_WORKSPACE_FILE,
      filePath,
    }, '*');
  });
}

export default defineContentScript({
  matches: ['file:///*'],
  runAt: 'document_start',
  main() {
    if (!isLocalMarkdownUrl(location.href)) return;
    const initialRoute = localMarkdownWorkspaceRoute(location.href);
    if (initialRoute) {
      const targetUrl = localMarkdownWorkspaceFileUrl(location.href, initialRoute.workspaceName, initialRoute.filePath);
      const currentUrl = new URL(location.href);
      currentUrl.hash = '';
      if (targetUrl && targetUrl !== currentUrl.href) {
        location.replace(targetUrl);
        return;
      }
    }
    const sourceUrl = new URL(location.href);
    sourceUrl.hash = '';
    document.documentElement.style.visibility = 'hidden';
    const open = async () => {
      const imported = createLocalMarkdownImport(sourceUrl.href, document);
      if (!imported) return;
      try {
        const response: unknown = await browser.runtime.sendMessage({ type: OPEN_LOCAL_MARKDOWN, document: imported });
        if (isOpenLocalMarkdownResponse(response)) mountReader(response.viewerUrl, sourceUrl.href);
        else document.documentElement.style.visibility = 'visible';
      } catch {
        document.documentElement.style.visibility = 'visible';
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void open(), { once: true });
    else void open();
  },
});
