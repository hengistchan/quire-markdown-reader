import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, ChevronDown, File, FolderOpen, ListTree, LoaderCircle,
  MoreHorizontal, RotateCw, Search, Settings2, StretchHorizontal, X,
} from 'lucide-react';
import {
  collectWorkspace, createTransientDirectoryHandle, getWorkspaceFileHandle, WorkspaceScanError,
} from '../../core/files';
import { isLocalMarkdownUrl, localMarkdownPathWithinDirectory, localMarkdownTitle } from '../../core/localMarkdown';
import { renderMarkdown, renderPlainText } from '../../core/markdown';
import { RemoteMarkdownError } from '../../core/remote';
import { hostPermissionPattern, isMarkdownLink, isRelativeUrl, isRemoteUrl, linkFragment, resolveWorkspacePath } from '../../core/paths';
import { searchMarkdown } from '../../core/search';
import { createShortcutLabels } from '../../core/shortcuts';
import {
  initialWorkspaceNavigation, workspaceNavigationReducer, type WorkspaceNavigationEntry,
} from '../../core/navigationHistory';
import { createFileDocumentSource, createRemoteDocumentSource } from '../../application/documentSources';
import {
  createFileSession, createImportedSession, createRemoteSession, createWelcomeSession,
  createWorkspaceSession, documentSessionReducer, documentSourceUrl,
} from '../../domain/documentSession';
import {
  loadActiveWorkspace, loadFileRecord, loadWorkspaceRecord, saveFileHandle, saveWorkspaceHandle,
  type PersistedWorkspaceHandle,
} from '../../core/workspacePersistence';
import { takeDocumentHandoff } from '../../infrastructure/handoffStore';
import { createTranslator, resolveLocale } from '../../shared/i18n';
import {
  loadRecentItems, rememberRecentItem, updateRecentPosition, type RecentItem, type RecentItemInput,
} from '../../shared/recent';
import { defaultSettings, loadSettings, saveSettings } from '../../shared/settings';
import type {
  DocumentSearchResult, HeadingItem, ImportedDocument, ReaderSettings, SidebarMode, WorkspaceFile,
  WorkspaceSnapshot,
} from '../../shared/types';
import {
  CommandPalette, MoreMenu, OpenMenu, OutlinePanel, SettingsDrawer, UrlDialog, WorkspaceTree,
} from './components';

type ActiveOverlay = 'open-menu' | 'more-menu' | 'command' | 'settings' | 'url-dialog' | null;
interface ResumeTarget { scrollPosition: number; headingId?: string }
const WIDE_READER_WIDTH = 980;
const MERMAID_CACHE_LIMIT = 50;
const mermaidSvgCache = new Map<string, string>();
const mermaidRenderTokens = new WeakMap<HTMLElement, symbol>();
let mermaidRenderQueue: Promise<void> = Promise.resolve();

function enqueueMermaidRender(task: () => Promise<void>): Promise<void> {
  const next = mermaidRenderQueue.then(task, task);
  mermaidRenderQueue = next.catch(() => undefined);
  return next;
}

function getSystemTheme(): 'light' | 'dark' {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

async function requestReadPermission(handle: FileSystemHandle): Promise<PermissionState> {
  const permissionHandle = handle as FileSystemHandle & {
    queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
    requestPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
  };
  const current = await permissionHandle.queryPermission?.({ mode: 'read' });
  if (current === 'granted') return current;
  return await permissionHandle.requestPermission?.({ mode: 'read' }) ?? 'granted';
}

function useSystemTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(getSystemTheme);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setTheme(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return theme;
}

function extractHeadings(html: string, fallback: string): HeadingItem[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return [...parsed.querySelectorAll<HTMLElement>('h1, h2, h3, h4')].map((heading) => ({
    id: heading.id,
    text: heading.textContent?.replace('#', '').trim() || fallback,
    level: Number(heading.tagName.slice(1)),
  }));
}

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

function useReadingProgress(): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      setProgress(max <= 0 ? 0 : Math.min(100, (scrollY / max) * 100));
    };
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => { removeEventListener('scroll', update); removeEventListener('resize', update); };
  }, []);
  return progress;
}

export function App() {
  const [settings, setSettings] = useState<ReaderSettings>(defaultSettings);
  const initialTranslator = useMemo(() => createTranslator(resolveLocale(defaultSettings.locale)), []);
  const [session, dispatchSession] = useReducer(
    documentSessionReducer,
    undefined,
    () => createWelcomeSession(initialTranslator('welcomeDocumentTitle'), initialTranslator('welcomeDocument')),
  );
  const [navigationHistory, dispatchNavigation] = useReducer(workspaceNavigationReducer, initialWorkspaceNavigation);
  const [restorableWorkspace, setRestorableWorkspace] = useState<PersistedWorkspaceHandle>();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(null);
  const [urlValue, setUrlValue] = useState('');
  const [commandQuery, setCommandQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [activeHeadingId, setActiveHeadingId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [workspaceScanning, setWorkspaceScanning] = useState(false);
  const [remoteRetryUrl, setRemoteRetryUrl] = useState<string>();
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(new Set());
  const [documentNavigationVersion, setDocumentNavigationVersion] = useState(0);
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget>();
  const [dragActive, setDragActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const remoteLoadingRef = useRef(false);
  const remoteRequestController = useRef<AbortController | undefined>(undefined);
  const workspaceScanController = useRef<AbortController | undefined>(undefined);
  const pendingDocumentFragment = useRef<string | undefined>(undefined);
  const pendingHashUpdate = useRef(true);
  const currentNavigationKey = useRef<string | undefined>(undefined);
  const activeHeadingRef = useRef<string | undefined>(undefined);
  const lastScrollPositionRef = useRef(0);
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSettings = useRef<ReaderSettings | undefined>(undefined);
  const initialized = useRef(false);
  const progress = useReadingProgress();
  const systemTheme = useSystemTheme();

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
  const activeModified = session.kind === 'workspace' || session.kind === 'file' ? session.lastModified : undefined;
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
  const html = useMemo(
    () => documentFormat === 'plain-text' ? renderPlainText(source) : renderMarkdown(source, renderOptions),
    [documentFormat, renderOptions, source],
  );
  const htmlMarkup = useMemo(() => ({ __html: html }), [html]);
  const headings = useMemo(() => extractHeadings(html, t('untitledSection')), [html, t]);
  const shortcutLabels = useMemo(() => createShortcutLabels(), []);
  const resolvedTheme = settings.theme === 'system' ? systemTheme : settings.theme;
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
        void saveSettings(next);
      }, 200);
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    if (pendingSettings.current) void saveSettings(pendingSettings.current);
  }, []);

  const recordRecent = useCallback(async (item: RecentItemInput) => {
    setRecent(await rememberRecentItem(item));
  }, []);

  const queueDocumentNavigation = useCallback((fragment?: string, updateHash = true) => {
    pendingDocumentFragment.current = fragment;
    pendingHashUpdate.current = updateHash;
    setDocumentNavigationVersion((version) => version + 1);
  }, []);

  const openImportedDocument = useCallback((imported: ImportedDocument, fragment?: string) => {
    dispatchSession({ type: 'replace', session: createImportedSession(imported) });
    setSidebarMode((current) => current === 'files' ? null : current);
    setError(undefined);
    queueDocumentNavigation(fragment);
    scrollTo({ top: 0 });
  }, [queueDocumentNavigation]);

  const openWorkspaceFile = useCallback(async (file: WorkspaceFile, currentWorkspace?: WorkspaceSnapshot, fragment?: string, navigationMode: 'push' | 'traverse' = 'push') => {
    const snapshot = await createFileDocumentSource(file, 'workspace').load();
    const targetWorkspace = currentWorkspace ?? (session.kind === 'workspace' ? session.workspace : undefined);
    if (!targetWorkspace) throw new Error('A workspace is required to open a workspace file.');
    if (snapshot.lastModified === undefined) throw new Error('A local file snapshot requires modification metadata.');
    dispatchSession({
      type: 'replace',
      session: createWorkspaceSession(targetWorkspace, file, snapshot.markdown, snapshot.lastModified),
    });
    if (targetWorkspace.id) {
      await recordRecent({
        id: `workspace-file:${targetWorkspace.id}:${file.path}`,
        title: file.name,
        kind: 'workspace-file',
        workspaceId: targetWorkspace.id,
        filePath: file.path,
      });
      if (navigationMode === 'push') {
        const entry: WorkspaceNavigationEntry = { workspaceId: targetWorkspace.id, filePath: file.path, fragment };
        const entryKey = `${entry.workspaceId}:${entry.filePath}#${entry.fragment ?? ''}`;
        if (currentNavigationKey.current !== entryKey) {
          currentNavigationKey.current = entryKey;
          dispatchNavigation({ type: 'push', entry });
          const nextUrl = fragment
            ? `${location.pathname}${location.search}#${encodeURIComponent(fragment)}`
            : `${location.pathname}${location.search}`;
          history.pushState({ quireWorkspaceNavigation: entry }, '', nextUrl);
        }
      }
    }
    setError(undefined);
    queueDocumentNavigation(fragment, navigationMode !== 'push');
    scrollTo({ top: 0, behavior: 'smooth' });
  }, [queueDocumentNavigation, recordRecent, session]);

  const activateWorkspace = useCallback(async (handle: FileSystemDirectoryHandle, preferredPath?: string, existingId?: string, navigationMode: 'push' | 'traverse' = 'push', transient = false): Promise<boolean> => {
    workspaceScanController.current?.abort();
    const controller = new AbortController();
    workspaceScanController.current = controller;
    setWorkspaceScanning(true);
    try {
      const workspaceId = transient ? undefined : await saveWorkspaceHandle(handle, existingId);
      const snapshot = await collectWorkspace(handle, { signal: controller.signal, workspaceId });
      snapshot.transient = transient;
      setSidebarMode('files');
      const selected = snapshot.files.find((file) => file.path === preferredPath)
        ?? snapshot.files.find((file) => /^readme\.(md|markdown|mdx)$/i.test(file.path))
        ?? snapshot.files[0];
      if (!selected) {
        setError(t('noMarkdown'));
        return false;
      }
      await openWorkspaceFile(selected, snapshot, undefined, navigationMode);
      return true;
    } catch (caught) {
      if (caught instanceof WorkspaceScanError) {
        if (caught.code !== 'cancelled') setError(t('workspaceScanLimit'));
        return false;
      }
      throw caught;
    } finally {
      if (workspaceScanController.current === controller) {
        workspaceScanController.current = undefined;
        setWorkspaceScanning(false);
      }
    }
  }, [openWorkspaceFile, t]);

  const cancelWorkspaceScan = useCallback(() => workspaceScanController.current?.abort(), []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const handoffId = new URL(location.href).searchParams.get('handoff');
      const [loadedSettings, importedDocument, recentItems] = await Promise.all([
        loadSettings(),
        handoffId ? takeDocumentHandoff(handoffId) : Promise.resolve(undefined),
        loadRecentItems(),
      ]);
      setSettings(loadedSettings);
      setRecent(recentItems);
      if (importedDocument) {
        openImportedDocument(importedDocument);
        history.replaceState(null, '', `${location.pathname}${location.hash}`);
      }
      if ('showDirectoryPicker' in window && !importedDocument) {
        try {
          const storedWorkspace = await loadActiveWorkspace();
          if (!storedWorkspace) return;
          const permission = await storedWorkspace.handle.queryPermission({ mode: 'read' });
          if (permission === 'granted') await activateWorkspace(storedWorkspace.handle, undefined, storedWorkspace.id);
          else { setRestorableWorkspace(storedWorkspace); setSidebarMode('files'); }
        } catch {
          // An old or browser-incompatible handle should not block the reader.
        }
      }
    })();
  }, [activateWorkspace, openImportedDocument]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = locale;
  }, [locale, resolvedTheme]);

  useEffect(() => {
    if (session.kind !== 'welcome') return;
    dispatchSession({ type: 'localize-welcome', title: t('welcomeDocumentTitle'), markdown: t('welcomeDocument') });
  }, [session.kind, t]);

  useEffect(() => {
    if (!settings.enableMermaid || !articleRef.current) return;
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const effectRenders = new Map<HTMLElement, symbol>();
    const theme = resolvedTheme === 'dark' ? 'dark' : 'neutral';
    const renderNode = async (node: HTMLElement) => {
      const encoded = node.dataset.mermaidSource;
      if (!encoded || node.dataset.resourceState === 'ready' && node.querySelector('svg')) return;
      if (node.dataset.resourceState === 'rendering' && mermaidRenderTokens.has(node)) return;
      const cacheKey = `${theme}:${encoded}`;
      const cached = mermaidSvgCache.get(cacheKey);
      if (cached?.includes('<svg')) {
        node.innerHTML = cached;
        node.dataset.resourceState = 'ready';
        node.removeAttribute('aria-busy');
        return;
      }
      if (cached) mermaidSvgCache.delete(cacheKey);
      const token = Symbol(cacheKey);
      mermaidRenderTokens.set(node, token);
      effectRenders.set(node, token);
      node.dataset.resourceState = 'rendering';
      node.setAttribute('aria-busy', 'true');
      node.removeAttribute('data-resource-error');
      const source = decodeURIComponent(encoded);
      await enqueueMermaidRender(async () => {
        let lastError: unknown;
        try {
          const { default: mermaid } = await import('mermaid');
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            if (cancelled || !node.isConnected || mermaidRenderTokens.get(node) !== token) return;
            node.textContent = source;
            node.removeAttribute('data-processed');
            try {
              mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'ui-sans-serif, system-ui, sans-serif' });
              await mermaid.run({ nodes: [node], suppressErrors: true });
              if (cancelled || !node.isConnected || mermaidRenderTokens.get(node) !== token) return;
              if (!node.querySelector('svg')) throw new Error('Mermaid completed without producing an SVG.');
              node.dataset.resourceState = 'ready';
              node.removeAttribute('data-resource-error');
              mermaidSvgCache.set(cacheKey, node.innerHTML);
              if (mermaidSvgCache.size > MERMAID_CACHE_LIMIT) mermaidSvgCache.delete(mermaidSvgCache.keys().next().value!);
              return;
            } catch (caught) {
              lastError = caught;
            }
          }
          if (cancelled || !node.isConnected || mermaidRenderTokens.get(node) !== token) return;
          node.textContent = source;
          node.dataset.resourceState = 'error';
          node.dataset.resourceError = t('diagramRenderError');
          console.error('[quire:mermaid] render failed', { error: lastError });
        } catch (caught) {
          if (cancelled || !node.isConnected || mermaidRenderTokens.get(node) !== token) return;
          node.textContent = source;
          node.dataset.resourceState = 'error';
          node.dataset.resourceError = t('diagramRenderError');
          console.error('[quire:mermaid] load failed', { error: caught });
        } finally {
          if (mermaidRenderTokens.get(node) === token) {
            if (node.dataset.resourceState === 'rendering') node.dataset.resourceState = 'idle';
            node.removeAttribute('aria-busy');
            mermaidRenderTokens.delete(node);
          }
          effectRenders.delete(node);
        }
      });
    };
    const nodes = [...articleRef.current.querySelectorAll<HTMLElement>('.mermaid')];
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          void renderNode(entry.target as HTMLElement);
        }
      }, { rootMargin: '500px 0px' });
      for (const node of nodes) observer.observe(node);
    } else {
      for (const node of nodes) void renderNode(node);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
      for (const [node, token] of effectRenders) {
        if (mermaidRenderTokens.get(node) !== token) continue;
        if (node.dataset.resourceState === 'rendering') node.dataset.resourceState = 'idle';
        node.removeAttribute('aria-busy');
        mermaidRenderTokens.delete(node);
      }
      effectRenders.clear();
    };
  }, [html, resolvedTheme, settings.enableMermaid, t]);

  useEffect(() => {
    if (!articleRef.current) return;
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const objectUrls: string[] = [];
    const resolveImage = async (image: HTMLImageElement) => {
      if (image.dataset.resourceState) return;
      const raw = image.getAttribute('src');
      if (!raw || !isRelativeUrl(raw)) return;
      image.dataset.resourceState = 'resolving';
      if (workspace && activeFile) {
        const path = resolveWorkspacePath(activeFile.path, raw);
        if (!path) return;
        try {
          const handle = await getWorkspaceFileHandle(workspace.handle, path);
          const url = URL.createObjectURL(await handle.getFile());
          objectUrls.push(url);
          if (!cancelled) {
            image.src = url;
            image.dataset.resourceState = 'ready';
          }
        } catch (caught) {
          console.warn('Quire could not load a workspace image.', path, caught);
          image.dataset.resourceError = 'true';
          image.dataset.resourceState = 'error';
          image.alt = `${image.alt || raw} — ${t('resourceUnavailable')}`;
        }
      } else if (sourceUrl) {
        image.src = new URL(raw, sourceUrl).href;
        image.dataset.resourceState = 'ready';
      }
    };
    const images = [...articleRef.current.querySelectorAll<HTMLImageElement>('img[src]')]
      .filter((image) => isRelativeUrl(image.getAttribute('src') ?? ''));
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          void resolveImage(entry.target as HTMLImageElement);
        }
      }, { rootMargin: '500px 0px' });
      for (const image of images) observer.observe(image);
    } else {
      for (const image of images) void resolveImage(image);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [activeFile, html, sourceUrl, t, workspace]);

  useEffect(() => {
    if (documentNavigationVersion === 0) return;
    const fragment = pendingDocumentFragment.current;
    const frame = requestAnimationFrame(() => {
      if (fragment) {
        const target = document.getElementById(fragment);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (target) setActiveHeadingId(fragment);
        if (pendingHashUpdate.current) history.pushState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(fragment)}`);
      } else if (location.hash) {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [documentNavigationVersion]);

  useEffect(() => {
    if (!settings.autoRefresh || !activeFile || (session.kind !== 'workspace' && session.kind !== 'file')) return;
    if (session.kind === 'workspace' && session.workspace.transient) return;
    let checking = false;
    const check = async () => {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const sourceAdapter = createFileDocumentSource(activeFile, session.kind);
        const result = await sourceAdapter.refresh?.({ title, markdown: source, lastModified: activeModified });
        if (result?.changed && result.snapshot.lastModified !== undefined) {
          dispatchSession({ type: 'refresh-local', markdown: result.snapshot.markdown, lastModified: result.snapshot.lastModified });
          setNotice(t('updated'));
        }
      } finally { checking = false; }
    };
    const timer = setInterval(() => void check(), 1500);
    return () => clearInterval(timer);
  }, [activeFile, activeModified, session.kind, settings.autoRefresh, source, t, title]);

  useEffect(() => {
    if (!settings.autoRefresh || !remoteState || session.kind !== 'remote') return;
    let cancelled = false;
    let delay = 30_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const schedule = (wait: number) => {
      if (!cancelled) timer = setTimeout(() => void refresh(), wait);
    };
    const refresh = async () => {
      if (document.hidden || !navigator.onLine) { schedule(30_000); return; }
      controller = new AbortController();
      try {
        const sourceAdapter = createRemoteDocumentSource(remoteState.url);
        const result = await sourceAdapter.refresh?.({ title, markdown: source, sourceUrl, remoteState }, controller.signal);
        if (cancelled) return;
        delay = 30_000;
        if (result?.snapshot.remoteState) {
          dispatchSession({
            type: 'refresh-remote',
            document: result.changed ? { title: result.snapshot.title, markdown: result.snapshot.markdown, sourceUrl: result.snapshot.sourceUrl } : undefined,
            state: result.snapshot.remoteState,
          });
        }
        if (result?.changed) setNotice(t('updated'));
      } catch (caught) {
        if (cancelled || (caught instanceof RemoteMarkdownError && caught.code === 'cancelled')) return;
        delay = Math.min(delay * 2, 5 * 60_000);
      }
      schedule(delay);
    };
    const resumeOnline = () => {
      if (timer) clearTimeout(timer);
      schedule(0);
    };
    addEventListener('online', resumeOnline);
    schedule(delay);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      removeEventListener('online', resumeOnline);
    };
  }, [remoteState, session.kind, settings.autoRefresh, source, sourceUrl, t, title]);

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

  useEffect(() => { activeHeadingRef.current = activeHeadingId; }, [activeHeadingId]);

  useEffect(() => {
    if (!currentRecentId) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    lastScrollPositionRef.current = Math.max(0, scrollY);
    const persist = () => {
      timer = undefined;
      void updateRecentPosition(currentRecentId, lastScrollPositionRef.current, activeHeadingRef.current)
        .then(setRecent)
        .catch(() => undefined);
    };
    const schedule = () => {
      lastScrollPositionRef.current = Math.max(0, scrollY);
      if (timer) clearTimeout(timer);
      timer = setTimeout(persist, 800);
    };
    addEventListener('scroll', schedule, { passive: true });
    return () => {
      removeEventListener('scroll', schedule);
      if (timer) clearTimeout(timer);
      persist();
    };
  }, [currentRecentId]);

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
    if (!file.name.match(/\.(md|markdown|mdx)$/i)) { setError(t('fileTypeError')); return; }
    openImportedDocument({ title: file.name, markdown: await file.text() });
    setActiveOverlay(null);
  };

  const handleFileHandle = async (handle: FileSystemFileHandle, existingId?: string) => {
    if (!handle.name.match(/\.(md|markdown|mdx)$/i)) { setError(t('fileTypeError')); return; }
    const fileId = await saveFileHandle(handle, existingId);
    const file: WorkspaceFile = { id: `file:${fileId}`, name: handle.name, path: handle.name, depth: 0, handle };
    const snapshot = await createFileDocumentSource(file, 'file').load();
    if (snapshot.lastModified === undefined) throw new Error('A local file snapshot requires modification metadata.');
    dispatchSession({ type: 'replace', session: createFileSession(file, snapshot.markdown, snapshot.lastModified) });
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
      if ((caught as DOMException).name !== 'AbortError') setError(t('fileReadError'));
    }
  };

  const handleDirectory = async () => {
    setActiveOverlay(null);
    if (window.top !== window && sourceUrl && isLocalMarkdownUrl(sourceUrl)) {
      directoryInput.current?.setAttribute('webkitdirectory', '');
      directoryInput.current?.click();
      return;
    }
    if (!('showDirectoryPicker' in window)) { setError(t('folderUnsupported')); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      await activateWorkspace(handle);
    } catch (caught) {
      const name = (caught as DOMException).name;
      if (name === 'NotAllowedError') setError(t('permissionDenied'));
      else if (name !== 'AbortError') setError(t('folderReadError'));
    }
  };

  const handleTransientDirectory = async (files: FileList | null) => {
    const handle = files ? createTransientDirectoryHandle(files) : undefined;
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
    if (permission !== 'granted') { setError(t('permissionDenied')); return; }
    await activateWorkspace(restorableWorkspace.handle, undefined, restorableWorkspace.id);
    setRestorableWorkspace(undefined);
  };

  const refreshWorkspace = async () => {
    if (!workspace) return;
    const refreshed = await activateWorkspace(workspace.handle, activeFile?.path, workspace.id);
    if (refreshed) setNotice(t('workspaceRefreshed'));
  };

  const openRemote = useCallback(async (value: string, requestPermission = true) => {
    if (!isRemoteUrl(value)) { setError(t('invalidUrl')); setRemoteRetryUrl(undefined); return; }
    if (remoteLoadingRef.current) return;
    const requestController = new AbortController();
    remoteRequestController.current = requestController;
    remoteLoadingRef.current = true;
    setError(undefined);
    setRemoteRetryUrl(undefined);
    setRemoteLoading(true);
    try {
      const permission = hostPermissionPattern(value);
      if (requestPermission && typeof browser !== 'undefined') {
        const granted = await browser.permissions.request({ origins: [permission] });
        if (!granted) { setError(t('permissionDenied')); return; }
      }
      const snapshot = await createRemoteDocumentSource(value).load(requestController.signal);
      if (!snapshot.remoteState) throw new Error('A remote document snapshot requires refresh state.');
      const document = { title: snapshot.title, markdown: snapshot.markdown, sourceUrl: snapshot.sourceUrl };
      dispatchSession({ type: 'replace', session: createRemoteSession(document, snapshot.remoteState) });
      queueDocumentNavigation(linkFragment(value));
      setSidebarMode((current) => current === 'files' ? null : current);
      scrollTo({ top: 0 });
      setActiveOverlay(null);
      await recordRecent({ id: `remote:${snapshot.remoteState.url}`, title: snapshot.title, kind: 'remote', url: snapshot.remoteState.url });
    } catch (caught) {
      if (caught instanceof RemoteMarkdownError) {
        if (caught.code === 'invalid-url') setError(t('invalidUrl'));
        else if (caught.code === 'too-large') setError(t('remoteTooLarge'));
        else if (caught.code === 'timeout') { setError(t('remoteTimeout')); setRemoteRetryUrl(value); }
        else if (caught.code === 'network-error') { setError(t('remoteReadError')); setRemoteRetryUrl(value); }
        else if (caught.code === 'http-error') { setError(`${t('remoteServerError')} ${caught.status}.`); setRemoteRetryUrl(value); }
      } else setError(t('remoteReadError'));
    } finally {
      if (remoteRequestController.current === requestController) remoteRequestController.current = undefined;
      remoteLoadingRef.current = false;
      setRemoteLoading(false);
    }
  }, [queueDocumentNavigation, recordRecent, t]);

  const cancelRemoteLoad = useCallback(() => {
    remoteRequestController.current?.abort();
    setActiveOverlay(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'k') {
        event.preventDefault();
        setActiveOverlay('command');
      } else if (modifier && key === 'o') {
        event.preventDefault();
        if (event.shiftKey) void handleDirectory();
        else void handleOpenFile();
      } else if (modifier && key === 'l') {
        event.preventDefault();
        setActiveOverlay('url-dialog');
      }
      if (event.key === 'Escape') {
        setActiveOverlay(null);
      }
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  });

  const handleArticleClick = (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const raw = anchor.getAttribute('href');
    if (!raw || raw.startsWith('#')) return;
    if (workspace && activeFile && isRelativeUrl(raw) && isMarkdownLink(raw)) {
      event.preventDefault();
      const path = resolveWorkspacePath(activeFile.path, raw);
      const file = workspace.files.find((candidate) => candidate.path === path);
      if (file) void openWorkspaceFile(file, undefined, linkFragment(raw));
      else setError(t('linkedFileMissing'));
      return;
    }
    if (sourceUrl && isMarkdownLink(raw)) {
      event.preventDefault();
      void openRemote(new URL(raw, sourceUrl).href);
    }
  };

  const toggleDirectory = (path: string) => setCollapsedDirectories((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const commandMatches = useMemo(() => searchMarkdown(source, commandQuery, 8), [commandQuery, source]);
  const workspaceMatches = useMemo(() => {
    const needle = commandQuery.trim().toLocaleLowerCase();
    if (!needle || !workspace) return [];
    return workspace.files.filter((file) => file.path.toLocaleLowerCase().includes(needle)).slice(0, 8);
  }, [commandQuery, workspace]);
  const filteredFiles = fileFilter.trim() && workspace
    ? workspace.files.filter((file) => file.path.toLowerCase().includes(fileFilter.trim().toLowerCase()))
    : [];
  const readMinutes = Math.max(1, Math.ceil(source.replace(/[`#>*_\-[\]]/g, ' ').trim().split(/\s+/).length / 220));
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
      const stored = await loadWorkspaceRecord(item.workspaceId);
      if (!stored) setError(t('folderReadError'));
      else {
        const granted = await requestReadPermission(stored.handle);
        if (granted === 'granted') await activateWorkspace(stored.handle, item.filePath, stored.id);
        else setError(t('permissionDenied'));
      }
    } else if (item.kind === 'local-file') {
      const stored = await loadFileRecord(item.fileId);
      if (!stored) setError(t('fileReadError'));
      else {
        const granted = await requestReadPermission(stored.handle);
        if (granted === 'granted') await handleFileHandle(stored.handle, stored.id);
        else setError(t('permissionDenied'));
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
    const stored = await loadWorkspaceRecord(entry.workspaceId);
    if (!stored || await requestReadPermission(stored.handle) !== 'granted') {
      setError(t('permissionDenied'));
      return;
    }
    const opened = await activateWorkspace(stored.handle, entry.filePath, stored.id, 'traverse');
    if (opened && entry.fragment) queueDocumentNavigation(entry.fragment, false);
  }, [activateWorkspace, openWorkspaceFile, queueDocumentNavigation, t, workspace]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const entry = (event.state as { quireWorkspaceNavigation?: WorkspaceNavigationEntry } | null)?.quireWorkspaceNavigation;
      if (!entry || typeof entry.workspaceId !== 'string' || typeof entry.filePath !== 'string') return;
      dispatchNavigation({ type: 'select', entry });
      void navigateToWorkspaceEntry(entry);
    };
    addEventListener('popstate', handlePopState);
    return () => removeEventListener('popstate', handlePopState);
  }, [navigateToWorkspaceEntry]);

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

  return (
    <div className={`app-shell ${dragActive ? 'drag-active' : ''}`} style={{ '--reader-width': `${readerWidth}px`, '--reader-size': `${settings.fontSize}px`, '--reader-leading': settings.lineHeight } as React.CSSProperties} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event) => void handleDrop(event)} onPaste={handlePaste}>
      {settings.showReadingProgress && <div className="reading-progress" style={{ transform: `scaleX(${progress / 100})` }} />}
      <aside className="navigation-rail" aria-label={t('documentNavigation')}>
        <img className="rail-brand" src="/icon/96.png" alt="Quire" />
        <div className="rail-actions">
          <button className={contextMode === 'files' ? 'active' : ''} onClick={toggleWorkspacePanel} aria-label={t('toggleWorkspace')} aria-expanded={contextMode === 'files'} title={t('toggleWorkspace')}><FolderOpen /></button>
          <button className={contextMode === 'outline' ? 'active' : ''} onClick={toggleOutlinePanel} aria-label={t('toggleOutline')} aria-expanded={contextMode === 'outline'} title={t('toggleOutline')}><ListTree /></button>
          <button className={commandOpen ? 'active' : ''} onClick={() => setActiveOverlay('command')} aria-label={t('commandCenter')} title={`${t('commandCenter')} · ${shortcutLabels.command}`}><Search /></button>
        </div>
        <div className="rail-bottom">
          <button className={settingsOpen ? 'active' : ''} onClick={() => setActiveOverlay('settings')} aria-label={t('settings')} title={t('settings')}><Settings2 /></button>
          <kbd>{shortcutLabels.command}</kbd>
        </div>
      </aside>

      <header className="topbar">
        <div className="identity-cluster">
          <div className="history-actions">
            <button disabled={navigationHistory.index <= 0} onClick={() => history.back()} aria-label={t('previousDocument')} title={t('previousDocument')}><ArrowLeft /></button>
            <button disabled={navigationHistory.index < 0 || navigationHistory.index >= navigationHistory.entries.length - 1} onClick={() => history.forward()} aria-label={t('nextDocument')} title={t('nextDocument')}><ArrowRight /></button>
          </div>
          <div className="document-identity">
            <span>{workspaceName}{activeFile?.path ? ` / ${activeFile.path.split('/').slice(0, -1).join('/')}` : ''}</span>
            <strong>{title}</strong>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="menu-anchor">
            <button className="open-trigger" onClick={() => setActiveOverlay((current) => current === 'open-menu' ? null : 'open-menu')} aria-expanded={openMenuOpen}><span>{t('open')}</span><ChevronDown /></button>
            {openMenuOpen && <OpenMenu t={t} shortcuts={shortcutLabels} onFile={() => void handleOpenFile()} onFolder={() => void handleDirectory()} onUrl={() => setActiveOverlay('url-dialog')} />}
          </div>
          <button className={`topbar-icon ${settings.wideView ? 'active' : ''}`} onClick={() => updateSettings({ wideView: !settings.wideView })} aria-label={settings.wideView ? t('disableWideView') : t('enableWideView')} aria-pressed={settings.wideView} title={settings.wideView ? t('disableWideView') : t('enableWideView')}><StretchHorizontal /></button>
          <button className="topbar-icon" onClick={() => setActiveOverlay('command')} aria-label={t('commandCenter')}><Search /></button>
          <div className="menu-anchor">
            <button className="topbar-icon" onClick={() => setActiveOverlay((current) => current === 'more-menu' ? null : 'more-menu')} aria-label={t('moreActions')} aria-expanded={moreMenuOpen}><MoreHorizontal /></button>
            {moreMenuOpen && <MoreMenu t={t} commandShortcut={shortcutLabels.command} onCommand={() => setActiveOverlay('command')} onOutline={toggleOutlinePanel} onSettings={() => setActiveOverlay('settings')} />}
          </div>
          <input ref={fileInput} hidden type="file" accept=".md,.markdown,.mdx,text/markdown" onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])} />
          <input ref={directoryInput} data-directory-picker hidden type="file" multiple onChange={(event) => void handleTransientDirectory(event.target.files)} />
        </div>
      </header>

      <div className={`workspace ${contextOpen ? 'with-context' : ''}`}>
        {contextMode === 'files' && <aside className="context-panel workspace-panel" aria-label={t('workspace')}>
          <div className="context-heading"><span>{t('workspace')}</span><div><strong>{workspace?.name ?? t('restoreTitle')}</strong>{workspace && !workspace.transient && <button disabled={workspaceScanning} onClick={() => void refreshWorkspace()} aria-label={t('refreshWorkspace')} title={t('refreshWorkspace')}><RotateCw className={workspaceScanning ? 'loading-spinner' : ''} /></button>}</div></div>
          {workspace && <label className="file-filter"><Search /><input value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder={t('filterFiles')} /></label>}
          {restorableWorkspace && <div className="restore-card"><RotateCw /><strong>{t('restoreTitle')}</strong><p>{t('restoreBody')}</p><button onClick={() => void restoreWorkspace()}>{t('restore')}</button><button className="quiet" onClick={() => setRestorableWorkspace(undefined)}>{t('dismiss')}</button></div>}
          <nav className="context-files">
            {fileFilter.trim() ? filteredFiles.map((file) => (
              <button key={file.id} className={`file-row filtered ${activeFile?.id === file.id ? 'active' : ''}`} onClick={() => void openWorkspaceFile(file)}><File /><span>{file.path}</span></button>
            )) : workspace?.tree.length ? (
              <WorkspaceTree nodes={workspace.tree} activeId={activeFile?.id} collapsed={collapsedDirectories} onToggle={toggleDirectory} onOpen={(file) => void openWorkspaceFile(file)} />
            ) : null}
          </nav>
          <div className="context-foot"><span className="status-dot" /> {settings.autoRefresh && !workspace?.transient && (activeFile || remoteState) ? t('watching') : t('localOnly')}</div>
        </aside>}

        {contextMode === 'outline' && <aside className="context-panel outline-panel" aria-label={t('outline')}>
          <div className="context-heading"><span>{t('onThisPage')}</span><div><strong>{title}</strong></div></div>
          <OutlinePanel headings={headings} activeId={activeHeadingId} progress={progress} t={t} onJump={jumpToHeading} />
        </aside>}

        <main className="reader-stage">
          <div className="paper-grain" aria-hidden="true" />
          {error && <div className="error-banner" role="alert"><AlertCircle /><span>{error}</span><div className="error-actions">{remoteRetryUrl && <button className="retry-button" onClick={() => void openRemote(remoteRetryUrl, false)}>{t('retry')}</button>}<button onClick={() => { setError(undefined); setRemoteRetryUrl(undefined); }} aria-label={t('dismissNotice')}><X /></button></div></div>}
          {session.kind !== 'welcome' && <div className="document-meta">{readMinutes} {t('minuteRead')}</div>}
          <article ref={articleRef} className={`markdown-body font-${settings.fontFamily}`} onClick={handleArticleClick} dangerouslySetInnerHTML={htmlMarkup} />
          {settings.customCss && <style>{`@scope (.markdown-body) { ${settings.customCss} }`}</style>}
          <footer className="document-footer"><span>{t('endDocument')}</span><i /></footer>
        </main>
      </div>

      {commandOpen && <CommandPalette query={commandQuery} matches={commandMatches} workspaceMatches={workspaceMatches} recent={recent} shortcuts={shortcutLabels} t={t} onQuery={setCommandQuery} onClose={() => { setActiveOverlay(null); setCommandQuery(''); }} onFile={() => void handleOpenFile()} onFolder={() => void handleDirectory()} onUrl={() => setActiveOverlay('url-dialog')} onTypedUrl={(value) => void openRemote(value)} onWorkspace={toggleWorkspacePanel} onOutline={toggleOutlinePanel} onQuietMode={() => setSidebarMode(null)} onLightTheme={() => updateSettings({ theme: 'light' })} onDarkTheme={() => updateSettings({ theme: 'dark' })} onSettings={() => setActiveOverlay('settings')} onRecent={(item) => void openRecent(item)} onMatch={jumpToSearchResult} onWorkspaceFile={openWorkspaceSearchResult} />}
      {urlOpen && <UrlDialog value={urlValue} loading={remoteLoading} t={t} onValue={setUrlValue} onClose={() => setActiveOverlay(null)} onCancel={cancelRemoteLoad} onOpen={() => void openRemote(urlValue)} />}
      {settingsOpen && <SettingsDrawer settings={settings} t={t} onChange={(patch) => { updateSettings(patch.contentWidth === undefined ? patch : { ...patch, wideView: false }); if (patch.showOutline !== undefined) setSidebarMode((current) => patch.showOutline ? 'outline' : current === 'outline' ? null : current); }} onReset={() => updateSettings(defaultSettings)} onClose={() => setActiveOverlay(null)} />}
      {workspaceScanning && <div className="remote-loading workspace-loading" role="status" aria-live="polite"><LoaderCircle /><span>{t('scanningWorkspace')}</span><button onClick={cancelWorkspaceScan}>{t('cancel')}</button></div>}
      {remoteLoading && <div className="remote-loading" role="status" aria-live="polite"><LoaderCircle /><span>{t('loadingRemote')}</span><button onClick={cancelRemoteLoad}>{t('cancel')}</button></div>}
      {dragActive && <div className="drop-overlay" aria-hidden="true"><FolderOpen /><strong>{t('dropToOpen')}</strong></div>}
      {resumeTarget && <div className="resume-prompt" role="status"><span>{t('resumeReading')}</span><button onClick={continueReading}>{t('continueReading')}</button><button className="quiet" onClick={() => { setResumeTarget(undefined); scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('startFromTop')}</button></div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
