import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReaderController } from '../../../application/reader/readerController';
import { isLocalMarkdownUrl } from '../../../core/localMarkdown';
import { renderMarkdownDocument, renderPlainTextDocument } from '../../../core/markdown';
import type { DocumentSession, DocumentSessionAction } from '../../../domain/documentSession';
import type { Translator } from '../../../shared/i18n';
import type { ReaderSettings } from '../../../shared/types';
import { enhanceDocument } from '../documentEnhancements';
import { useDocumentNavigation } from './useDocumentNavigation';
import { useDocumentRefresh } from './useDocumentRefresh';
import { useDocumentResources } from './useDocumentResources';
import { useMermaidRuntime } from './useMermaidRuntime';
import { useReadingProgress } from './useReadingProgress';

interface ReaderDocumentOptions {
  controller: ReaderController;
  session: DocumentSession;
  settings: ReaderSettings;
  resolvedTheme: 'light' | 'dark';
  t: Translator;
  dispatch(action: DocumentSessionAction): void;
  showNotice(notice: string): void;
}

export function useReaderDocument(options: ReaderDocumentOptions) {
  const { controller, session, settings, resolvedTheme, t, dispatch, showNotice } = options;
  const [activeHeadingId, setActiveHeadingId] = useState<string>();
  const articleRef = useRef<HTMLElement>(null);
  const progress = useReadingProgress();
  const queueDocumentNavigation = useDocumentNavigation(setActiveHeadingId);
  const documentFormat = session.kind === 'imported' ? session.format : 'markdown';
  const renderOptions = useMemo(() => ({
    enableKatex: settings.enableKatex,
    enableMermaid: settings.enableMermaid,
    enableHtml: settings.enableHtml,
  }), [settings.enableHtml, settings.enableKatex, settings.enableMermaid]);
  const rendered = useMemo(
    () => documentFormat === 'plain-text'
      ? renderPlainTextDocument(session.markdown)
      : renderMarkdownDocument(session.markdown, renderOptions),
    [documentFormat, renderOptions, session.markdown],
  );
  const htmlMarkup = useMemo(() => ({ __html: rendered.html }), [rendered.html]);

  useMermaidRuntime(articleRef, {
    enabled: settings.enableMermaid,
    documentHtml: rendered.html,
    theme: resolvedTheme,
    errorMessage: t('diagramRenderError'),
  });
  useDocumentResources(articleRef, rendered.html, controller, t('resourceUnavailable'), {
    loadRemoteImages: settings.loadRemoteImages,
    referrerPolicy: settings.remoteImageReferrerPolicy,
  });

  const refreshKind = session.kind === 'remote'
    ? 'remote'
    : session.kind === 'file' || session.kind === 'workspace' ? 'local' : undefined;
  const refreshSourceKey = session.kind === 'remote'
    ? session.state.url
    : session.kind === 'file' || session.kind === 'workspace' ? session.file.id : undefined;
  useDocumentRefresh({
    enabled: settings.autoRefresh && !(session.kind === 'workspace' && session.workspace.transient),
    kind: refreshKind,
    sourceKey: refreshSourceKey,
    service: controller,
    scheduler: controller,
    onResult(result) {
      if (refreshKind === 'local' && result.changed
        && result.snapshot.metadata.lastModified !== undefined
        && result.snapshot.metadata.size !== undefined) {
        dispatch({
          type: 'refresh-local',
          markdown: result.snapshot.markdown,
          lastModified: result.snapshot.metadata.lastModified,
          size: result.snapshot.metadata.size,
        });
        showNotice(t('updated'));
      } else if (refreshKind === 'remote' && result.snapshot.remoteState) {
        dispatch({
          type: 'refresh-remote',
          document: result.changed ? {
            title: result.snapshot.title,
            markdown: result.snapshot.markdown,
            sourceUrl: result.snapshot.metadata.sourceUrl,
          } : undefined,
          state: result.snapshot.remoteState,
        });
        if (result.changed) showNotice(t('updated'));
      }
    },
  });

  useEffect(() => {
    if (!articleRef.current) return;
    return enhanceDocument(articleRef.current, {
      copied: t('copied'),
      copyCode: t('copyCode'),
      copyFailed: t('copyFailed'),
      diagramControls: t('diagramControls'),
      expandDiagram: t('expandDiagram'),
      closeLightbox: t('closeLightbox'),
      interactiveDiagram: t('interactiveDiagram'),
      resetZoom: t('resetZoom'),
      zoomIn: t('zoomIn'),
      zoomOut: t('zoomOut'),
    });
  }, [rendered.html, t]);

  useEffect(() => {
    const elements = rendered.headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) {
      setActiveHeadingId(undefined);
      return undefined;
    }
    const updateActiveHeading = () => {
      let next = rendered.headings[0]?.id;
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= 170) next = element.id;
      }
      setActiveHeadingId(next);
    };
    updateActiveHeading();
    if (!('IntersectionObserver' in window)) {
      addEventListener('scroll', updateActiveHeading, { passive: true });
      return () => removeEventListener('scroll', updateActiveHeading);
    }
    const observer = new IntersectionObserver(updateActiveHeading, {
      rootMargin: '-120px 0px -70% 0px',
      threshold: [0, 1],
    });
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [rendered.headings]);

  const sourceUrl = session.kind === 'imported'
    ? session.sourceUrl
    : session.kind === 'remote' ? session.state.url : undefined;
  const workspace = session.kind === 'workspace' ? session.workspace : undefined;
  const workspaceName = workspace?.name
    ?? (documentFormat === 'plain-text'
      ? t('plainTextSnapshot')
      : sourceUrl
      ? (isLocalMarkdownUrl(sourceUrl) ? t('localFile') : t('fromWeb'))
      : session.kind === 'welcome' ? t('gettingStarted')
      : session.kind === 'unavailable' ? t('unavailableDocument') : t('imported'));

  const jumpToHeading = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    setActiveHeadingId(id);
  };

  return {
    articleRef,
    activeHeadingId,
    progress,
    queueDocumentNavigation,
    htmlMarkup,
    headings: rendered.headings,
    readMinutes: rendered.estimatedReadMinutes,
    workspaceName,
    jumpToHeading,
  };
}
