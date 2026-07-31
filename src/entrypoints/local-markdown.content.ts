import { createLocalMarkdownImport, OPEN_LOCAL_MARKDOWN } from '../core/localMarkdown';

export default defineContentScript({
  matches: ['file:///*'],
  runAt: 'document_idle',
  main() {
    const imported = createLocalMarkdownImport(location.href, document);
    if (!imported) return;
    void browser.runtime.sendMessage({ type: OPEN_LOCAL_MARKDOWN, document: imported });
  },
});
