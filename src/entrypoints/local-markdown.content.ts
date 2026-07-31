import {
  createLocalMarkdownImport, isLocalMarkdownUrl, isOpenLocalMarkdownResponse, OPEN_LOCAL_MARKDOWN,
} from '../core/localMarkdown';

function mountReader(viewerUrl: string): void {
  const iframe = document.createElement('iframe');
  iframe.src = viewerUrl;
  iframe.title = 'Quire Markdown Reader';
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
}

export default defineContentScript({
  matches: ['file:///*'],
  runAt: 'document_start',
  main() {
    if (!isLocalMarkdownUrl(location.href)) return;
    document.documentElement.style.visibility = 'hidden';
    const open = async () => {
      const imported = createLocalMarkdownImport(location.href, document);
      if (!imported) return;
      try {
        const response: unknown = await browser.runtime.sendMessage({ type: OPEN_LOCAL_MARKDOWN, document: imported });
        if (isOpenLocalMarkdownResponse(response)) mountReader(response.viewerUrl);
        else document.documentElement.style.visibility = 'visible';
      } catch {
        document.documentElement.style.visibility = 'visible';
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void open(), { once: true });
    else void open();
  },
});
