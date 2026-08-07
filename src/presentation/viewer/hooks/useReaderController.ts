import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { WorkspaceScanError } from '../../../shared/errors/workspaceScanError';
import { readerErrorMessage, type ReaderError } from '../../../shared/errors/readerError';
import {
  isLocalMarkdownUrl, isSelectLocalMarkdownWorkspaceFileMessage, localMarkdownPathWithinDirectory,
  localMarkdownTitle, NAVIGATE_LOCAL_MARKDOWN_WORKSPACE,
} from '../../../core/localMarkdown';
import { renderMarkdownDocument, renderPlainTextDocument } from '../../../core/markdown';
import { RemoteDocumentError } from '../../../shared/errors/remoteDocumentError';
import { isRemoteUrl, linkFragment } from '../../../core/paths';
import { searchMarkdown } from '../../../core/search';
import { createShortcutLabels } from '../../../core/shortcuts';
import {
  initialWorkspaceNavigation, workspaceNavigationReducer, type WorkspaceNavigationEntry,
} from '../../../core/navigationHistory';
import {
  createFileSession, createImportedSession, createRemoteSession, createWelcomeSession,
  createWorkspaceSession, documentSessionReducer, documentSourceUrl,
} from '../../../domain/documentSession';
import type { PersistedWorkspaceHandle } from '../../../application/ports/handleRepository';
import { createTranslator, resolveLocale } from '../../../shared/i18n';
import type { RecentItem, RecentItemInput } from '../../../application/ports/recentRepository';
import { defaultSettings } from '../../../shared/defaultSettings';
import type {
  DocumentSearchResult, ImportedDocument, ReaderSettings, SidebarMode, WorkspaceFile,
  WorkspaceSnapshot,
} from '../../../shared/types';
import { useReadingProgress } from './useReadingProgress';
import { useMermaidRuntime } from './useMermaidRuntime';
import { useDocumentNavigation } from './useDocumentNavigation';
import { useDocumentResources } from './useDocumentResources';
import { useSystemTheme } from './useSystemTheme';
import { useDocumentRefresh } from './useDocumentRefresh';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useReadingPosition } from './useReadingPosition';
import type { ReaderController } from '../../../application/reader/readerController';
import { enhanceDocument } from '../documentEnhancements';

type ActiveOverlay = 'open-menu' | 'more-menu' | 'command' | 'settings' | 'url-dialog' | null;
interface ResumeTarget { scrollPosition: number; headingId?: string }
const WIDE_READER_WIDTH = 980;

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

export function useReaderController(controller: ReaderController) {
  const navigationController = controller;
  const [settings, setSettings] = useState<ReaderSettings>(defaultSettings);
  const initialTranslator = useMemo(() => createTranslator(resolveLocale(defaultSettings.locale)), []);
  const [session, dispatchSession] = useReducer(
    documentSessionReducer,
    undefined,
    () => createWelcomeSession(initialTranslator('welcomeDocumentTitle'), initialTranslator('welcomeDocument')),
  );
  const [navigationHistory, dispatchNavigation] = useReducer(workspaceNavigationReducer, initialWorkspaceNavigation);
  const [restorableWorkspace, setRestorableWorkspace] = useState<PersistedWorkspaceHandle>();
  const [restorableWorkspaceTarget, setRestorableWorkspaceTarget] = useState<WorkspaceNavigationEntry>();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(null);
  const [urlValue, setUrlValue] = useState('');
  const [commandQuery, setCommandQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [activeHeadingId, setActiveHeadingId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<ReaderError>();
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [workspaceScanning, setWorkspaceScanning] = useState(false);
  const [remoteRetryUrl, setRemoteRetryUrl] = useState<string>();
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(new Set());
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget>();
  const [dragActive, setDragActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const remoteLoadingRef = useRef(false);
  const remoteRequestController = useRef<AbortController | undefined>(undefined);
  const workspaceScanController = useRef<AbortController | undefined>(undefined);
  const currentNavigationKey = useRef<string | undefined>(undefined);
  const embeddedLocalSourceUrl = useRef<string | undefined>(undefined);
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSettings = useRef<ReaderSettings | undefined>(undefined);
  const initialized = useRef(false);
  const progress = useReadingProgress();
  const systemTheme = useSystemTheme();
  const queueDocumentNavigation = useDocumentNavigation(setActiveHeadingId);

  const openMenuOpen = activeOverlay === 'open-menu';
  const moreMenuOpen = activeOverlay === 'more-menu';
  const commandOpen = activeOverlay === 'command';
  const settingsOpen = activeOverlay === 'settings';
  const urlOpen = activeOverlay === 'url-dialog';
  const title = session.title;
  const source = session.markdown;
  const sourceUrl = documentSourceUrl(session);
  const documentFormat = session.kind === 'imported' ? session.format : 'markdown';
  const remoteState = session.kind === 'remote' ? session.state : undefined;
  const workspace = session.kind === 'workspace' ? session.workspace : undefined;
  const activeFile = session.kind === 'workspace' || session.kind === 'file' ? session.file : undefined;
  const currentRecentId = session.kind === 'remote'
    ? `remote:${session.state.url}`
    : session.kind === 'workspace' && session.workspace.id
      ? `workspace-file:${session.workspace.id}:${session.file.path}`
      : session.kind === 'file' && session.file.id.startsWith('file:')
        ? `local-file:${session.file.id.slice('file:'.length)}`
        : undefined;

  const locale = resolveLocale(settings.locale);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const renderOptions = useMemo(() => ({
    enableKatex: settings.enableKatex,
    enableMermaid: settings.enableMermaid,
    enableHtml: settings.enableHtml,
  }), [settings.enableHtml, settings.enableKatex, settings.enableMermaid]);
  const renderedDocument = useMemo(
    () => documentFormat === 'plain-text'
      ? renderPlainTextDocument(source)
      : renderMarkdownDocument(source, renderOptions),
    [documentFormat, renderOptions, source],
  );
  const html = renderedDocument.html;
  const htmlMarkup = useMemo(() => ({ __html: html }), [html]);
  const headings = renderedDocument.headings;
  const shortcutLabels = useMemo(() => createShortcutLabels(), []);
  const resolvedTheme = settings.theme === 'system' ? systemTheme : settings.theme;
  useMermaidRuntime(articleRef, {
    enabled: settings.enableMermaid,
    documentHtml: html,
    theme: resolvedTheme,
    errorMessage: t('diagramRenderError'),
  });
  useDocumentResources(articleRef, html, controller, t('resourceUnavailable'), {
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
        dispatchSession({
          type: 'refresh-local',
          markdown: result.snapshot.markdown,
          lastModified: result.snapshot.metadata.lastModified,
          size: result.snapshot.metadata.size,
        });
        setNotice(t('updated'));
      } else if (refreshKind === 'remote' && result.snapshot.remoteState) {
        dispatchSession({
          type: 'refresh-remote',
          document: result.changed ? {
            title: result.snapshot.title,
            markdown: result.snapshot.markdown,
            sourceUrl: result.snapshot.metadata.sourceUrl,
          } : undefined,
          state: result.snapshot.remoteState,
        });
        if (result.changed) setNotice(t('updated'));
      }
    },
  });
  useEffect(() => () => controller.dispose(), [controller]);
  const workspaceName = workspace?.name
    ?? (documentFormat === 'plain-text'
      ? t('plainTextSnapshot')
      : sourceUrl
      ? (isLocalMarkdownUrl(sourceUrl) ? t('localFile') : t('fromWeb'))
      : session.kind === 'welcome' ? t('gettingStarted') : t('imported'));

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      pendingSettings.current = next;
      if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
      settingsSaveTimer.current = setTimeout(() => {
        settingsSaveTimer.current = undefined;
        pendingSettings.current = undefined;
        void controller.saveSettings(next);
      }, 200);
      return next;
    });
  }, [controller]);

  useEffect(() => () => {
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    if (pendingSettings.current) void controller.saveSettings(pendingSettings.current);
  }, [controller]);

  const recordRecent = useCallback(async (item: RecentItemInput) => {
    setRecent(await controller.rememberRecent(item));
  }, [controller]);

  const openImportedDocument = useCallback(async (imported: ImportedDocument, fragment?: string) => {
    await controller.openImported(imported);
    if (window.top !== window && imported.sourceUrl && isLocalMarkdownUrl(imported.sourceUrl)) {
      embeddedLocalSourceUrl.current = imported.sourceUrl;
    }
    dispatchSession({ type: 'replace', session: createImportedSession(imported) });
    navigationController.replace({
      document: { kind: 'imported', sessionId: imported.sourceUrl ?? imported.title },
      fragment,
    });
    setSidebarMode((current) => current === 'files' ? null : current);
    setError(undefined);
    queueDocumentNavigation(fragment);
    scrollTo({ top: 0 });
  }, [controller, navigationController, queueDocumentNavigation]);

  const openWorkspaceFile = useCallback(async (file: WorkspaceFile, currentWorkspace?: WorkspaceSnapshot, fragment?: string, navigationMode: 'push' | 'replace' | 'traverse' = 'push') => {
    const targetWorkspace = currentWorkspace ?? (session.kind === 'workspace' ? session.workspace : undefined);
    if (!targetWorkspace) throw new Error('A workspace is required to open a workspace file.');
    const snapshot = await controller.openWorkspaceFile(targetWorkspace, file);
    if (snapshot.metadata.lastModified === undefined || snapshot.metadata.size === undefined) throw new Error('A local file snapshot requires modification metadata.');
    dispatchSession({
      type: 'replace',
      session: createWorkspaceSession(targetWorkspace, file, snapshot.markdown, snapshot.metadata.lastModified, snapshot.metadata.size),
    });
    if (targetWorkspace.id) {
      await recordRecent({
        id: `workspace-file:${targetWorkspace.id}:${file.path}`,
        title: file.name,
        kind: 'workspace-file',
        workspaceId: targetWorkspace.id,
        filePath: file.path,
      });
      if (navigationMode !== 'traverse') {
        const entry: WorkspaceNavigationEntry = { workspaceId: targetWorkspace.id, filePath: file.path, fragment };
        const entryKey = `${entry.workspaceId}:${entry.filePath}#${entry.fragment ?? ''}`;
        if (currentNavigationKey.current !== entryKey) {
          currentNavigationKey.current = entryKey;
          dispatchNavigation({ type: navigationMode === 'push' ? 'push' : 'select', entry });
          navigationController[navigationMode]({
            document: { kind: 'workspace-file', workspaceId: entry.workspaceId, filePath: entry.filePath },
            fragment: entry.fragment,
          });
        }
      }
    }
    if (targetWorkspace.transient && navigationMode === 'push' && embeddedLocalSourceUrl.current && window.top !== window) {
      window.parent.postMessage({
        type: NAVIGATE_LOCAL_MARKDOWN_WORKSPACE,
        workspaceName: targetWorkspace.name,
        filePath: file.path,
      }, '*');
    }
    setError(undefined);
    queueDocumentNavigation(fragment);
    scrollTo({ top: 0, behavior: 'smooth' });
  }, [controller, navigationController, queueDocumentNavigation, recordRecent, session]);

  useEffect(() => {
    if (window.top === window || !workspace?.transient) return;
    const selectFile = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (event.source !== window.parent || !isSelectLocalMarkdownWorkspaceFileMessage(message)) return;
      const file = workspace.files.find((candidate) => candidate.path === message.filePath);
      if (file) void openWorkspaceFile(file, workspace, undefined, 'traverse');
    };
    window.addEventListener('message', selectFile);
    return () => window.removeEventListener('message', selectFile);
  }, [openWorkspaceFile, workspace]);

  const activateWorkspace = useCallback(async (handle: FileSystemDirectoryHandle, preferredPath?: string, existingId?: string, navigationMode: 'push' | 'replace' | 'traverse' = 'push', transient = false, fragment?: string): Promise<boolean> => {
    workspaceScanController.current?.abort();
    const scanController = new AbortController();
    workspaceScanController.current = scanController;
    setWorkspaceScanning(true);
    try {
      const workspaceId = transient ? undefined : await controller.saveWorkspace(handle, existingId);
      const snapshot = await controller.scanWorkspace(handle, scanController.signal, workspaceId);
      snapshot.transient = transient;
      setSidebarMode('files');
      const selected = snapshot.files.find((file) => file.path === preferredPath)
        ?? snapshot.files.find((file) => /^readme\.(md|markdown|mdx)$/i.test(file.path))
        ?? snapshot.files[0];
      if (!selected) {
        setError({ code: 'workspace-empty', retryable: false });
        return false;
      }
      await openWorkspaceFile(selected, snapshot, fragment, navigationMode);
      return true;
    } catch (caught) {
      if (caught instanceof WorkspaceScanError) {
        if (caught.code !== 'cancelled') setError({ code: 'workspace-scan-limit', cause: caught, retryable: true });
        return false;
      }
      throw caught;
    } finally {
      if (workspaceScanController.current === scanController) {
        workspaceScanController.current = undefined;
        setWorkspaceScanning(false);
      }
    }
  }, [controller, openWorkspaceFile, t]);

  const cancelWorkspaceScan = useCallback(() => workspaceScanController.current?.abort(), []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const initializedReader = await controller.initialize();
      setSettings(initializedReader.settings);
      setRecent(initializedReader.recent);
      if (initializedReader.handoff) {
        await openImportedDocument(initializedReader.handoff);
      }
      if ('showDirectoryPicker' in window && !initializedReader.handoff) {
        try {
          const initialTarget = navigationController.current();
          const workspaceTarget = initialTarget?.document.kind === 'workspace-file'
            ? { document: initialTarget.document, fragment: initialTarget.fragment }
            : undefined;
          const storedWorkspace = workspaceTarget
            ? await controller.getWorkspace(workspaceTarget.document.workspaceId)
            : await controller.getActiveWorkspace();
          if (!storedWorkspace) return;
          const permission = await storedWorkspace.handle.queryPermission({ mode: 'read' });
          if (permission === 'granted') {
            await activateWorkspace(
              storedWorkspace.handle,
              workspaceTarget?.document.filePath,
              storedWorkspace.id,
              'replace',
              false,
              workspaceTarget?.fragment,
            );
          }
          else {
            setRestorableWorkspace(storedWorkspace);
            setRestorableWorkspaceTarget(workspaceTarget ? {
              workspaceId: workspaceTarget.document.workspaceId,
              filePath: workspaceTarget.document.filePath,
              fragment: workspaceTarget.fragment,
            } : undefined);
            setSidebarMode('files');
          }
        } catch {
          // An old or browser-incompatible handle should not block the reader.
        }
      }
    })();
  }, [activateWorkspace, controller, openImportedDocument]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = locale;
  }, [locale, resolvedTheme]);

  useEffect(() => {
    if (session.kind !== 'welcome') return;
    dispatchSession({ type: 'localize-welcome', title: t('welcomeDocumentTitle'), markdown: t('welcomeDocument') });
  }, [session.kind, t]);

  useEffect(() => {
    if (!articleRef.current) return;
    return enhanceDocument(articleRef.current, {
      copied: t('copied'),
      copyCode: t('copyCode'),
      copyFailed: t('copyFailed'),
      diagramControls: t('diagramControls'),
      interactiveDiagram: t('interactiveDiagram'),
      resetZoom: t('resetZoom'),
      zoomIn: t('zoomIn'),
      zoomOut: t('zoomOut'),
    });
  }, [html, t]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) {
      setActiveHeadingId(undefined);
      return undefined;
    }
    const updateActiveHeading = () => {
      let next = headings[0]?.id;
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
  }, [headings]);

  useReadingPosition(
    currentRecentId,
    activeHeadingId,
    (id, position, headingId) => controller.updateRecentPosition(id, position, headingId),
    setRecent,
  );

  useEffect(() => {
    if (!openMenuOpen && !moreMenuOpen) return;
    const closeMenus = (event: PointerEvent) => {
      if ((event.target as Element).closest('.menu-anchor')) return;
      setActiveOverlay(null);
    };
    addEventListener('pointerdown', closeMenus);
    return () => removeEventListener('pointerdown', closeMenus);
  }, [moreMenuOpen, openMenuOpen]);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(md|markdown|mdx)$/i)) { setError({ code: 'file-type-invalid', retryable: false }); return; }
    await openImportedDocument({ title: file.name, markdown: await file.text() });
    setActiveOverlay(null);
  };

  const handleFileHandle = async (handle: FileSystemFileHandle, existingId?: string) => {
    if (!handle.name.match(/\.(md|markdown|mdx)$/i)) { setError({ code: 'file-type-invalid', retryable: false }); return; }
    const fileId = await controller.saveFile(handle, existingId);
    const file: WorkspaceFile = { id: `file:${fileId}`, name: handle.name, path: handle.name, depth: 0, handle };
    const snapshot = await controller.openLocalFile(file);
    if (snapshot.metadata.lastModified === undefined || snapshot.metadata.size === undefined) throw new Error('A local file snapshot requires modification metadata.');
    dispatchSession({
      type: 'replace',
      session: createFileSession(file, snapshot.markdown, snapshot.metadata.lastModified, snapshot.metadata.size),
    });
    navigationController.push({ document: { kind: 'local-file', fileId }, fragment: undefined });
    setSidebarMode((current) => current === 'files' ? null : current);
    setError(undefined);
    scrollTo({ top: 0 });
    setActiveOverlay(null);
    await recordRecent({ id: `local-file:${fileId}`, title: handle.name, kind: 'local-file', fileId });
  };

  const handleOpenFile = async () => {
    if (!('showOpenFilePicker' in window)) { fileInput.current?.click(); return; }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdx'] } }],
      });
      if (handle) await handleFileHandle(handle);
    } catch (caught) {
      if ((caught as DOMException).name !== 'AbortError') setError({ code: 'file-read-failed', cause: caught, retryable: true });
    }
  };

  const handleDirectory = async () => {
    setActiveOverlay(null);
    if (window.top !== window && sourceUrl && isLocalMarkdownUrl(sourceUrl)) {
      directoryInput.current?.setAttribute('webkitdirectory', '');
      directoryInput.current?.click();
      return;
    }
    if (!('showDirectoryPicker' in window)) { setError({ code: 'folder-unsupported', retryable: false }); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      await activateWorkspace(handle);
    } catch (caught) {
      const name = (caught as DOMException).name;
      if (name === 'NotAllowedError') setError({ code: 'permission-denied', cause: caught, retryable: true });
      else if (name !== 'AbortError') setError({ code: 'workspace-read-failed', cause: caught, retryable: true });
    }
  };

  const handleTransientDirectory = async (files: FileList | null) => {
    const handle = files ? controller.createTransientWorkspace(files) : undefined;
    if (!handle) return;
    const preferredPath = sourceUrl && isLocalMarkdownUrl(sourceUrl)
      ? localMarkdownPathWithinDirectory(sourceUrl, handle.name) ?? localMarkdownTitle(sourceUrl)
      : undefined;
    await activateWorkspace(handle, preferredPath, undefined, 'push', true);
    if (directoryInput.current) directoryInput.current.value = '';
  };

  const restoreWorkspace = async () => {
    if (!restorableWorkspace) return;
    const permission = await restorableWorkspace.handle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') { setError({ code: 'permission-denied', retryable: true }); return; }
    await activateWorkspace(
      restorableWorkspace.handle,
      restorableWorkspaceTarget?.filePath,
      restorableWorkspace.id,
      'replace',
      false,
      restorableWorkspaceTarget?.fragment,
    );
    setRestorableWorkspace(undefined);
    setRestorableWorkspaceTarget(undefined);
  };

  const refreshWorkspace = async () => {
    if (!workspace) return;
    const refreshed = await activateWorkspace(workspace.handle, activeFile?.path, workspace.id);
    if (refreshed) setNotice(t('workspaceRefreshed'));
  };

  const openRemote = useCallback(async (value: string, requestPermission = true) => {
    if (!isRemoteUrl(value)) { setError({ code: 'invalid-url', retryable: false }); setRemoteRetryUrl(undefined); return; }
    if (remoteLoadingRef.current) return;
    const requestController = new AbortController();
    remoteRequestController.current = requestController;
    remoteLoadingRef.current = true;
    setError(undefined);
    setRemoteRetryUrl(undefined);
    setRemoteLoading(true);
    try {
      if (requestPermission) {
        const granted = await controller.requestRemoteOrigin(value);
        if (!granted) { setError({ code: 'permission-denied', retryable: true }); return; }
      }
      const snapshot = await controller.openRemote(value, requestController.signal);
      if (!snapshot.remoteState) throw new Error('A remote document snapshot requires refresh state.');
      const document = { title: snapshot.title, markdown: snapshot.markdown, sourceUrl: snapshot.metadata.sourceUrl };
      dispatchSession({ type: 'replace', session: createRemoteSession(document, snapshot.remoteState) });
      const fragment = linkFragment(value);
      navigationController.push({ document: { kind: 'remote', url: snapshot.remoteState.url }, fragment });
      queueDocumentNavigation(fragment);
      setSidebarMode((current) => current === 'files' ? null : current);
      scrollTo({ top: 0 });
      setActiveOverlay(null);
      await recordRecent({ id: `remote:${snapshot.remoteState.url}`, title: snapshot.title, kind: 'remote', url: snapshot.remoteState.url });
    } catch (caught) {
      if (caught instanceof RemoteDocumentError) {
        if (caught.code === 'invalid-url') setError({ code: 'invalid-url', cause: caught, retryable: false });
        else if (caught.code === 'too-large') setError({ code: 'remote-too-large', cause: caught, retryable: false });
        else if (caught.code === 'timeout') { setError({ code: 'remote-timeout', cause: caught, retryable: true }); setRemoteRetryUrl(value); }
        else if (caught.code === 'network-error') { setError({ code: 'remote-network-error', cause: caught, retryable: true }); setRemoteRetryUrl(value); }
        else if (caught.code === 'http-error') { setError({ code: 'remote-http-error', cause: caught, details: { status: caught.status ?? 0 }, retryable: true }); setRemoteRetryUrl(value); }
      } else setError({ code: 'remote-network-error', cause: caught, retryable: true });
    } finally {
      if (remoteRequestController.current === requestController) remoteRequestController.current = undefined;
      remoteLoadingRef.current = false;
      setRemoteLoading(false);
    }
  }, [controller, navigationController, queueDocumentNavigation, recordRecent, t]);

  const cancelRemoteLoad = useCallback(() => {
    remoteRequestController.current?.abort();
    setActiveOverlay(null);
  }, []);

  useKeyboardShortcuts({
    openCommand: () => setActiveOverlay('command'),
    openFile: () => void handleOpenFile(),
    openFolder: () => void handleDirectory(),
    openUrl: () => setActiveOverlay('url-dialog'),
    close: () => setActiveOverlay(null),
  });

  const handleArticleClick = (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const raw = anchor.getAttribute('href');
    if (!raw) return;
    const resolution = controller.resolveLink(raw);
    if (resolution.type === 'fragment') {
      if (!resolution.fragment) return;
      event.preventDefault();
      navigationController.pushFragment(resolution.fragment);
      queueDocumentNavigation(resolution.fragment);
      return;
    }
    if (resolution.type === 'workspace-document' && workspace) {
      event.preventDefault();
      const file = workspace.files.find((candidate) => candidate.path === resolution.path);
      if (file) void openWorkspaceFile(file, undefined, resolution.fragment);
      else setError({ code: 'linked-file-missing', retryable: false });
      return;
    }
    if (resolution.type === 'remote-document') {
      event.preventDefault();
      void openRemote(resolution.url);
    }
  };

  const toggleDirectory = (path: string) => setCollapsedDirectories((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const deferredCommandQuery = useDeferredValue(commandQuery);
  const commandMatches = useMemo(() => searchMarkdown(source, deferredCommandQuery, 8), [deferredCommandQuery, source]);
  const workspaceMatches = useMemo(() => {
    const needle = deferredCommandQuery.trim().toLocaleLowerCase();
    if (!needle || !workspace) return [];
    return workspace.files.filter((file) => file.path.toLocaleLowerCase().includes(needle)).slice(0, 8);
  }, [deferredCommandQuery, workspace]);
  const filteredFiles = fileFilter.trim() && workspace
    ? workspace.files.filter((file) => file.path.toLowerCase().includes(fileFilter.trim().toLowerCase()))
    : [];
  const readMinutes = renderedDocument.estimatedReadMinutes;
  const contextMode = sidebarMode === 'files' && (workspace || restorableWorkspace)
    ? 'files'
    : sidebarMode === 'outline' && settings.showOutline
      ? 'outline'
      : null;
  const contextOpen = contextMode !== null;
  const readerWidth = settings.wideView ? WIDE_READER_WIDTH : settings.contentWidth;

  const openRecent = async (item: RecentItem) => {
    setResumeTarget(undefined);
    if (item.kind === 'remote' && item.url) await openRemote(item.url);
    else if (item.kind === 'workspace-file') {
      const stored = await controller.getWorkspace(item.workspaceId);
      if (!stored) setError({ code: 'workspace-read-failed', retryable: true });
      else {
        const granted = await controller.requestRead(stored.handle);
        if (granted === 'granted') await activateWorkspace(stored.handle, item.filePath, stored.id);
        else setError({ code: 'permission-denied', retryable: true });
      }
    } else if (item.kind === 'local-file') {
      const stored = await controller.getFile(item.fileId);
      if (!stored) setError({ code: 'file-read-failed', retryable: true });
      else {
        const granted = await controller.requestRead(stored.handle);
        if (granted === 'granted') await handleFileHandle(stored.handle, stored.id);
        else setError({ code: 'permission-denied', retryable: true });
      }
    }
    if ((item.scrollPosition ?? 0) > 80 || item.headingId) {
      setResumeTarget({ scrollPosition: item.scrollPosition ?? 0, headingId: item.headingId });
    }
    setActiveOverlay(null);
  };

  const navigateToWorkspaceEntry = useCallback(async (entry: WorkspaceNavigationEntry) => {
    currentNavigationKey.current = `${entry.workspaceId}:${entry.filePath}#${entry.fragment ?? ''}`;
    if (workspace?.id === entry.workspaceId) {
      const file = workspace.files.find((candidate) => candidate.path === entry.filePath);
      if (file) await openWorkspaceFile(file, workspace, entry.fragment, 'traverse');
      return;
    }
    const stored = await controller.getWorkspace(entry.workspaceId);
    if (!stored || await controller.requestRead(stored.handle) !== 'granted') {
      setError({ code: 'permission-denied', retryable: true });
      return;
    }
    await activateWorkspace(stored.handle, entry.filePath, stored.id, 'traverse', false, entry.fragment);
  }, [activateWorkspace, controller, openWorkspaceFile, queueDocumentNavigation, t, workspace]);

  useEffect(() => navigationController.subscribe((target) => {
    if (target.document.kind !== 'workspace-file') return;
    const entry: WorkspaceNavigationEntry = {
      workspaceId: target.document.workspaceId,
      filePath: target.document.filePath,
      fragment: target.fragment,
    };
    dispatchNavigation({ type: 'select', entry });
    void navigateToWorkspaceEntry(entry);
  }), [navigateToWorkspaceEntry, navigationController]);

  const continueReading = () => {
    const target = resumeTarget;
    setResumeTarget(undefined);
    requestAnimationFrame(() => {
      const heading = target?.headingId ? document.getElementById(target.headingId) : undefined;
      if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else scrollTo({ top: target?.scrollPosition ?? 0, behavior: 'smooth' });
    });
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    for (const item of [...event.dataTransfer.items]) {
      const getHandle = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }).getAsFileSystemHandle;
      const handle = await getHandle?.call(item);
      if (handle?.kind === 'directory') { await activateWorkspace(handle as FileSystemDirectoryHandle); return; }
      if (handle?.kind === 'file') { await handleFileHandle(handle as FileSystemFileHandle); return; }
    }
    const file = event.dataTransfer.files[0];
    if (file) await handleFile(file);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('input, textarea, select, [contenteditable="true"]')) return;
    const file = event.clipboardData.files[0];
    if (file) {
      event.preventDefault();
      void handleFile(file);
      return;
    }
    const markdown = event.clipboardData.getData('text/plain');
    if (!markdown.trim()) return;
    event.preventDefault();
    openImportedDocument({ title: t('pastedDocument'), markdown });
    setActiveOverlay(null);
  };

  const jumpToHeading = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    setActiveHeadingId(id);
  };

  const jumpToSearchResult = (result: DocumentSearchResult) => {
    const query = commandQuery;
    setActiveOverlay(null);
    setCommandQuery('');
    requestAnimationFrame(() => {
      if (articleRef.current) revealSearchResult(articleRef.current, result, query);
    });
  };

  const openWorkspaceSearchResult = (file: WorkspaceFile) => {
    setActiveOverlay(null);
    setCommandQuery('');
    void openWorkspaceFile(file);
  };

  const toggleWorkspacePanel = () => {
    setActiveOverlay(null);
    if (!workspace && !restorableWorkspace) {
      void handleDirectory();
      return;
    }
    setSidebarMode((current) => current === 'files' ? null : 'files');
  };

  const toggleOutlinePanel = () => {
    setActiveOverlay(null);
    if (!settings.showOutline) updateSettings({ showOutline: true });
    setSidebarMode((current) => current === 'outline' ? null : 'outline');
  };

  const dismissError = () => { setError(undefined); setRemoteRetryUrl(undefined); };
  const dismissRestore = () => {
    setRestorableWorkspace(undefined);
    setRestorableWorkspaceTarget(undefined);
  };
  const startFromTop = () => {
    setResumeTarget(undefined);
    scrollTo({ top: 0, behavior: 'smooth' });
  };
  const toggleOpenMenu = () => setActiveOverlay((current) => current === 'open-menu' ? null : 'open-menu');
  const toggleMoreMenu = () => setActiveOverlay((current) => current === 'more-menu' ? null : 'more-menu');
  const openImportedSettings = (patch: Partial<ReaderSettings>) => {
    updateSettings(patch.contentWidth === undefined ? patch : { ...patch, wideView: false });
    if (patch.showOutline !== undefined) {
      setSidebarMode((current) => patch.showOutline ? 'outline' : current === 'outline' ? null : current);
    }
  };
  const resetSettings = () => updateSettings(defaultSettings);
  const errorText = error ? readerErrorMessage(error, t) : undefined;

  return {
    activeFile, activeHeadingId, articleRef, cancelRemoteLoad, cancelWorkspaceScan, collapsedDirectories,
    commandMatches, commandOpen, commandQuery, contextMode, contextOpen, continueReading, directoryInput,
    dismissError, dismissRestore, dragActive, error: errorText, fileFilter, fileInput, filteredFiles, handleArticleClick,
    handleDirectory, handleDrop, handleFile, handleOpenFile, handlePaste, handleTransientDirectory, headings,
    htmlMarkup, jumpToHeading, jumpToSearchResult, moreMenuOpen, navigationController, navigationHistory,
    notice, openImportedSettings, openMenuOpen, openRecent, openRemote, openWorkspaceFile,
    openWorkspaceSearchResult, progress, readMinutes, recent, refreshWorkspace, remoteLoading, remoteRetryUrl,
    remoteState, resetSettings, restorableWorkspace, restoreWorkspace, resumeTarget, settings, settingsOpen,
    session, setActiveOverlay, setCommandQuery, setDragActive, setFileFilter, setSidebarMode, setUrlValue,
    shortcutLabels, startFromTop, t, title, toggleDirectory, toggleMoreMenu, toggleOpenMenu, toggleOutlinePanel,
    toggleWorkspacePanel, updateSettings, urlOpen, urlValue, workspace, workspaceMatches, workspaceName,
    workspaceScanning, readerWidth,
  };
}

export type ReaderViewModel = ReturnType<typeof useReaderController>;
