import { useDeferredValue, useMemo, useState, type RefObject } from 'react';
import { searchMarkdown } from '../../../core/search';
import type { DocumentSearchResult, WorkspaceFile, WorkspaceSnapshot } from '../../../shared/types';

function clearSearchHighlights(article: HTMLElement): void {
  for (const mark of article.querySelectorAll('mark[data-quire-search-hit]')) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
  }
  article.normalize();
}

function revealSearchResult(article: HTMLElement, result: DocumentSearchResult, query: string): void {
  clearSearchHighlights(article);
  const candidates = [...article.querySelectorAll<HTMLElement>('[data-source-line-start]')]
    .filter((element) => {
      const start = Number(element.dataset.sourceLineStart);
      const end = Number(element.dataset.sourceLineEnd);
      return start <= result.lineNumber && end >= result.lineNumber;
    })
    .sort((left, right) => {
      const leftSpan = Number(left.dataset.sourceLineEnd) - Number(left.dataset.sourceLineStart);
      const rightSpan = Number(right.dataset.sourceLineEnd) - Number(right.dataset.sourceLineStart);
      return leftSpan - rightSpan;
    });
  const target = candidates[0] ?? (result.headingId ? document.getElementById(result.headingId) : undefined) ?? article;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? '';
    const matchIndex = text.toLocaleLowerCase().indexOf(needle);
    if (matchIndex >= 0) {
      const range = document.createRange();
      range.setStart(node, matchIndex);
      range.setEnd(node, matchIndex + query.trim().length);
      const mark = document.createElement('mark');
      mark.dataset.quireSearchHit = 'true';
      range.surroundContents(mark);
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    node = walker.nextNode();
  }
}

interface ReaderSearchOptions {
  source: string;
  workspace?: WorkspaceSnapshot;
  articleRef: RefObject<HTMLElement | null>;
  closeOverlay(): void;
  openWorkspaceFile(file: WorkspaceFile): void;
}

export function useReaderSearch(options: ReaderSearchOptions) {
  const [commandQuery, setCommandQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const deferredQuery = useDeferredValue(commandQuery);
  const commandMatches = useMemo(
    () => searchMarkdown(options.source, deferredQuery, 8),
    [deferredQuery, options.source],
  );
  const workspaceMatches = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase();
    if (!needle || !options.workspace) return [];
    return options.workspace.files.filter((file) => file.path.toLocaleLowerCase().includes(needle)).slice(0, 8);
  }, [deferredQuery, options.workspace]);
  const filteredFiles =
    fileFilter.trim() && options.workspace
      ? options.workspace.files.filter((file) => file.path.toLowerCase().includes(fileFilter.trim().toLowerCase()))
      : [];

  const jumpToSearchResult = (result: DocumentSearchResult) => {
    const query = commandQuery;
    options.closeOverlay();
    setCommandQuery('');
    requestAnimationFrame(() => {
      if (options.articleRef.current) revealSearchResult(options.articleRef.current, result, query);
    });
  };

  const openWorkspaceSearchResult = (file: WorkspaceFile) => {
    options.closeOverlay();
    setCommandQuery('');
    options.openWorkspaceFile(file);
  };

  return {
    commandQuery,
    setCommandQuery,
    fileFilter,
    setFileFilter,
    commandMatches,
    workspaceMatches,
    filteredFiles,
    jumpToSearchResult,
    openWorkspaceSearchResult,
  };
}
