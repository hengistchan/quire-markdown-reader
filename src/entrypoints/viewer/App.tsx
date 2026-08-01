import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AlertCircle, Check, ChevronDown, ChevronRight, Command, File, FilePlus2, Folder,
  FolderOpen, Globe2, ListTree, LoaderCircle, Moon, MoreHorizontal, RotateCw, Search, Settings2,
  ShieldCheck, StretchHorizontal, Sun, X,
} from 'lucide-react';
import {
  collectWorkspace, getWorkspaceFileHandle, WorkspaceScanError,
} from '../../core/files';
import { isLocalMarkdownUrl } from '../../core/localMarkdown';
import { renderMarkdown } from '../../core/markdown';
import { RemoteMarkdownError } from '../../core/remote';
import { hostPermissionPattern, isMarkdownLink, isRelativeUrl, isRemoteUrl, linkFragment, resolveWorkspacePath } from '../../core/paths';
import { searchMarkdown } from '../../core/search';
import { createShortcutLabels, type ShortcutLabels } from '../../core/shortcuts';
import { createFileDocumentSource, createRemoteDocumentSource } from '../../application/documentSources';
import {
  createFileSession, createImportedSession, createRemoteSession, createWelcomeSession,
  createWorkspaceSession, documentSessionReducer, documentSourceUrl,
} from '../../domain/documentSession';
import { loadWorkspaceHandle, saveWorkspaceHandle } from '../../core/workspacePersistence';
import { takeDocumentHandoff } from '../../infrastructure/handoffStore';
import { createTranslator, resolveLocale } from '../../shared/i18n';
import { loadRecentItems, rememberRecentItem, type RecentItem } from '../../shared/recent';
import { defaultSettings, loadSettings, saveSettings } from '../../shared/settings';
import type {
  DocumentSearchResult, HeadingItem, ImportedDocument, ReaderSettings, WorkspaceFile,
  WorkspaceSnapshot, WorkspaceTreeNode,
} from '../../shared/types';

type ActiveOverlay = 'open-menu' | 'more-menu' | 'command' | 'settings' | 'url-dialog' | null;
const WIDE_READER_WIDTH = 980;

function getSystemTheme(): 'light' | 'dark' {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
  const [restorableHandle, setRestorableHandle] = useState<FileSystemDirectoryHandle>();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(true);
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
  const fileInput = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const remoteLoadingRef = useRef(false);
  const remoteRequestController = useRef<AbortController | undefined>(undefined);
  const workspaceScanController = useRef<AbortController | undefined>(undefined);
  const pendingDocumentFragment = useRef<string | undefined>(undefined);
  const initialized = useRef(false);
  const progress = useReadingProgress();

  const openMenuOpen = activeOverlay === 'open-menu';
  const moreMenuOpen = activeOverlay === 'more-menu';
  const commandOpen = activeOverlay === 'command';
  const settingsOpen = activeOverlay === 'settings';
  const urlOpen = activeOverlay === 'url-dialog';
  const title = session.title;
  const source = session.markdown;
  const sourceUrl = documentSourceUrl(session);
  const remoteState = session.kind === 'remote' ? session.state : undefined;
  const workspace = session.kind === 'workspace' ? session.workspace : undefined;
  const activeFile = session.kind === 'workspace' || session.kind === 'file' ? session.file : undefined;
  const activeModified = session.kind === 'workspace' || session.kind === 'file' ? session.lastModified : undefined;

  const locale = resolveLocale(settings.locale);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const html = useMemo(() => renderMarkdown(source, settings), [source, settings]);
  const htmlMarkup = useMemo(() => ({ __html: html }), [html]);
  const headings = useMemo(() => extractHeadings(html, t('untitledSection')), [html, t]);
  const shortcutLabels = useMemo(() => createShortcutLabels(), []);
  const resolvedTheme = settings.theme === 'system' ? getSystemTheme() : settings.theme;
  const workspaceName = workspace?.name
    ?? (sourceUrl
      ? (isLocalMarkdownUrl(sourceUrl) ? t('localFile') : t('fromWeb'))
      : session.kind === 'welcome' ? t('gettingStarted') : t('imported'));

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const recordRecent = useCallback(async (item: Omit<RecentItem, 'openedAt'>) => {
    setRecent(await rememberRecentItem(item));
  }, []);

  const queueDocumentNavigation = useCallback((fragment?: string) => {
    pendingDocumentFragment.current = fragment;
    setDocumentNavigationVersion((version) => version + 1);
  }, []);

  const openImportedDocument = useCallback((imported: ImportedDocument, fragment?: string) => {
    dispatchSession({ type: 'replace', session: createImportedSession(imported) });
    setWorkspaceOpen(false);
    setError(undefined);
    queueDocumentNavigation(fragment);
    scrollTo({ top: 0 });
  }, [queueDocumentNavigation]);

  const openWorkspaceFile = useCallback(async (file: WorkspaceFile, currentWorkspace?: WorkspaceSnapshot, fragment?: string) => {
    const snapshot = await createFileDocumentSource(file, 'workspace').load();
    const targetWorkspace = currentWorkspace ?? (session.kind === 'workspace' ? session.workspace : undefined);
    if (!targetWorkspace) throw new Error('A workspace is required to open a workspace file.');
    if (snapshot.lastModified === undefined) throw new Error('A local file snapshot requires modification metadata.');
    dispatchSession({
      type: 'replace',
      session: createWorkspaceSession(targetWorkspace, file, snapshot.markdown, snapshot.lastModified),
    });
    setError(undefined);
    queueDocumentNavigation(fragment);
    scrollTo({ top: 0, behavior: 'smooth' });
  }, [queueDocumentNavigation, session]);

  const activateWorkspace = useCallback(async (handle: FileSystemDirectoryHandle, preferredPath?: string): Promise<boolean> => {
    workspaceScanController.current?.abort();
    const controller = new AbortController();
    workspaceScanController.current = controller;
    setWorkspaceScanning(true);
    try {
      const snapshot = await collectWorkspace(handle, { signal: controller.signal });
      setWorkspaceOpen(true);
      const selected = snapshot.files.find((file) => file.path === preferredPath)
        ?? snapshot.files.find((file) => /^readme\.(md|markdown|mdx)$/i.test(file.path))
        ?? snapshot.files[0];
      if (!selected) {
        setError(t('noMarkdown'));
        return false;
      }
      await openWorkspaceFile(selected, snapshot);
      await saveWorkspaceHandle(handle);
      await recordRecent({ id: `workspace:${handle.name}`, title: handle.name, kind: 'workspace' });
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
  }, [openWorkspaceFile, recordRecent, t]);

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
          const handle = await loadWorkspaceHandle();
          if (!handle) return;
          const permission = await handle.queryPermission({ mode: 'read' });
          if (permission === 'granted') await activateWorkspace(handle);
          else { setRestorableHandle(handle); setWorkspaceOpen(true); }
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
    void import('mermaid').then(({ default: mermaid }) => {
      if (cancelled || !articleRef.current) return;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: resolvedTheme === 'dark' ? 'dark' : 'neutral', fontFamily: 'ui-sans-serif, system-ui, sans-serif' });
      const nodes = [...articleRef.current.querySelectorAll<HTMLElement>('.mermaid')];
      for (const node of nodes) {
        const encoded = node.dataset.mermaidSource;
        if (encoded) node.textContent = decodeURIComponent(encoded);
        node.removeAttribute('data-processed');
      }
      if (nodes.length) void mermaid.run({ nodes, suppressErrors: true });
    });
    return () => { cancelled = true; };
  }, [html, resolvedTheme, settings.enableMermaid]);

  useEffect(() => {
    if (!articleRef.current) return;
    let cancelled = false;
    const objectUrls: string[] = [];
    const resolveImages = async () => {
      const images = [...articleRef.current!.querySelectorAll<HTMLImageElement>('img[src]')];
      for (const image of images) {
        const raw = image.getAttribute('src');
        if (!raw || !isRelativeUrl(raw)) continue;
        image.dataset.resourceState = 'resolving';
        if (workspace && activeFile) {
          const path = resolveWorkspacePath(activeFile.path, raw);
          if (!path) continue;
          try {
            const handle = await getWorkspaceFileHandle(workspace.handle, path);
            const url = URL.createObjectURL(await handle.getFile());
            objectUrls.push(url);
            if (!cancelled) {
              image.src = url;
              image.dataset.resourceState = 'ready';
            }
          } catch (error) {
            console.warn('Quire could not load a workspace image.', path, error);
            image.dataset.resourceError = 'true';
            image.dataset.resourceState = 'error';
            image.alt = `${image.alt || raw} — ${t('resourceUnavailable')}`;
          }
        } else if (sourceUrl) {
          image.src = new URL(raw, sourceUrl).href;
        }
      }
    };
    void resolveImages();
    return () => { cancelled = true; for (const url of objectUrls) URL.revokeObjectURL(url); };
  }, [activeFile, html, sourceUrl, t, workspace]);

  useEffect(() => {
    if (documentNavigationVersion === 0) return;
    const fragment = pendingDocumentFragment.current;
    const frame = requestAnimationFrame(() => {
      if (fragment) {
        const target = document.getElementById(fragment);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (target) setActiveHeadingId(fragment);
        history.pushState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(fragment)}`);
      } else if (location.hash) {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [documentNavigationVersion]);

  useEffect(() => {
    if (!settings.autoRefresh || !activeFile || (session.kind !== 'workspace' && session.kind !== 'file')) return;
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
    const updateActiveHeading = () => {
      let next = headings[0]?.id;
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element && element.getBoundingClientRect().top <= 170) next = heading.id;
      }
      setActiveHeadingId(next);
    };
    updateActiveHeading();
    addEventListener('scroll', updateActiveHeading, { passive: true });
    return () => removeEventListener('scroll', updateActiveHeading);
  }, [headings]);

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

  const handleFileHandle = async (handle: FileSystemFileHandle) => {
    if (!handle.name.match(/\.(md|markdown|mdx)$/i)) { setError(t('fileTypeError')); return; }
    const file: WorkspaceFile = { id: handle.name, name: handle.name, path: handle.name, depth: 0, handle };
    const snapshot = await createFileDocumentSource(file, 'file').load();
    if (snapshot.lastModified === undefined) throw new Error('A local file snapshot requires modification metadata.');
    dispatchSession({ type: 'replace', session: createFileSession(file, snapshot.markdown, snapshot.lastModified) });
    setWorkspaceOpen(false);
    setError(undefined);
    scrollTo({ top: 0 });
    setActiveOverlay(null);
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

  const restoreWorkspace = async () => {
    if (!restorableHandle) return;
    const permission = await restorableHandle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') { setError(t('permissionDenied')); return; }
    await activateWorkspace(restorableHandle);
    setRestorableHandle(undefined);
  };

  const refreshWorkspace = async () => {
    if (!workspace) return;
    const refreshed = await activateWorkspace(workspace.handle, activeFile?.path);
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
      setWorkspaceOpen(false);
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
  const contextOpen = workspaceOpen && Boolean(workspace || restorableHandle);
  const readerWidth = settings.wideView ? WIDE_READER_WIDTH : settings.contentWidth;

  const openRecent = async (item: RecentItem) => {
    if (item.kind === 'remote' && item.url) await openRemote(item.url);
    else if (workspace && item.title === workspace.name) setWorkspaceOpen(true);
    else if (restorableHandle) await restoreWorkspace();
    setActiveOverlay(null);
  };

  const jumpToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  return (
    <div className="app-shell" style={{ '--reader-width': `${readerWidth}px`, '--reader-size': `${settings.fontSize}px`, '--reader-leading': settings.lineHeight } as React.CSSProperties}>
      {settings.showReadingProgress && <div className="reading-progress" style={{ transform: `scaleX(${progress / 100})` }} />}
      <aside className="navigation-rail" aria-label={t('documentNavigation')}>
        <img className="rail-brand" src="/icon/96.png" alt="Quire" />
        <div className="rail-actions">
          <button className={contextOpen ? 'active' : ''} onClick={() => workspace ? setWorkspaceOpen((open) => !open) : void handleDirectory()} aria-label={t('toggleWorkspace')} title={t('toggleWorkspace')}><FolderOpen /></button>
          <button className={outlineOpen ? 'active' : ''} onClick={() => setOutlineOpen((open) => !open)} aria-label={t('toggleOutline')} title={t('toggleOutline')}><ListTree /></button>
          <button className={commandOpen ? 'active' : ''} onClick={() => setActiveOverlay('command')} aria-label={t('commandCenter')} title={`${t('commandCenter')} · ${shortcutLabels.command}`}><Search /></button>
        </div>
        <div className="rail-bottom">
          <button className={settingsOpen ? 'active' : ''} onClick={() => setActiveOverlay('settings')} aria-label={t('settings')} title={t('settings')}><Settings2 /></button>
          <kbd>{shortcutLabels.command}</kbd>
        </div>
      </aside>

      <header className="topbar">
        <div className="document-identity">
          <span>{workspaceName}{activeFile?.path ? ` / ${activeFile.path.split('/').slice(0, -1).join('/')}` : ''}</span>
          <strong>{title}</strong>
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
            {moreMenuOpen && <MoreMenu t={t} commandShortcut={shortcutLabels.command} onCommand={() => setActiveOverlay('command')} onOutline={() => { setActiveOverlay(null); setOutlineOpen((open) => !open); }} onSettings={() => setActiveOverlay('settings')} />}
          </div>
          <input ref={fileInput} hidden type="file" accept=".md,.markdown,.mdx,text/markdown" onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])} />
        </div>
      </header>

      <div className={`workspace ${contextOpen ? 'with-context' : ''}`}>
        {contextOpen && <aside className="context-panel" aria-label={t('workspace')}>
          <div className="context-heading"><span>{t('workspace')}</span><div><strong>{workspace?.name ?? t('restoreTitle')}</strong>{workspace && <button disabled={workspaceScanning} onClick={() => void refreshWorkspace()} aria-label={t('refreshWorkspace')} title={t('refreshWorkspace')}><RotateCw className={workspaceScanning ? 'loading-spinner' : ''} /></button>}</div></div>
          {workspace && <label className="file-filter"><Search /><input value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder={t('filterFiles')} /></label>}
          {restorableHandle && <div className="restore-card"><RotateCw /><strong>{t('restoreTitle')}</strong><p>{t('restoreBody')}</p><button onClick={() => void restoreWorkspace()}>{t('restore')}</button><button className="quiet" onClick={() => setRestorableHandle(undefined)}>{t('dismiss')}</button></div>}
          <nav className="context-files">
            {fileFilter.trim() ? filteredFiles.map((file) => (
              <button key={file.id} className={`file-row filtered ${activeFile?.id === file.id ? 'active' : ''}`} onClick={() => void openWorkspaceFile(file)}><File /><span>{file.path}</span></button>
            )) : workspace?.tree.length ? (
              <WorkspaceTree nodes={workspace.tree} activeId={activeFile?.id} collapsed={collapsedDirectories} onToggle={toggleDirectory} onOpen={(file) => void openWorkspaceFile(file)} />
            ) : null}
          </nav>
          <div className="context-foot"><span className="status-dot" /> {settings.autoRefresh && (activeFile || remoteState) ? t('watching') : t('localOnly')}</div>
        </aside>}

        <main className="reader-stage">
          <div className="paper-grain" aria-hidden="true" />
          {error && <div className="error-banner" role="alert"><AlertCircle /><span>{error}</span><div className="error-actions">{remoteRetryUrl && <button className="retry-button" onClick={() => void openRemote(remoteRetryUrl, false)}>{t('retry')}</button>}<button onClick={() => { setError(undefined); setRemoteRetryUrl(undefined); }} aria-label={t('dismissNotice')}><X /></button></div></div>}
          {session.kind !== 'welcome' && <div className="document-meta">{readMinutes} {t('minuteRead')}</div>}
          <article ref={articleRef} className={`markdown-body font-${settings.fontFamily}`} onClick={handleArticleClick} dangerouslySetInnerHTML={htmlMarkup} />
          {settings.customCss && <style>{`@scope (.markdown-body) { ${settings.customCss} }`}</style>}
          <footer className="document-footer"><span>{t('endDocument')}</span><i /></footer>
          {settings.showOutline && outlineOpen && !settingsOpen && headings.length > 0 && <OutlinePopover headings={headings} activeId={activeHeadingId} progress={progress} t={t} onJump={jumpToHeading} />}
        </main>
      </div>

      {commandOpen && <CommandPalette query={commandQuery} matches={commandMatches} workspaceMatches={workspaceMatches} recent={recent} shortcuts={shortcutLabels} t={t} onQuery={setCommandQuery} onClose={() => { setActiveOverlay(null); setCommandQuery(''); }} onFile={() => void handleOpenFile()} onFolder={() => void handleDirectory()} onUrl={() => setActiveOverlay('url-dialog')} onTypedUrl={(value) => void openRemote(value)} onWorkspace={() => setWorkspaceOpen((open) => !open)} onOutline={() => setOutlineOpen((open) => !open)} onQuietMode={() => { setWorkspaceOpen(false); setOutlineOpen(false); }} onLightTheme={() => updateSettings({ theme: 'light' })} onDarkTheme={() => updateSettings({ theme: 'dark' })} onSettings={() => setActiveOverlay('settings')} onRecent={(item) => void openRecent(item)} onMatch={jumpToSearchResult} onWorkspaceFile={openWorkspaceSearchResult} />}
      {urlOpen && <UrlDialog value={urlValue} loading={remoteLoading} t={t} onValue={setUrlValue} onClose={() => setActiveOverlay(null)} onCancel={cancelRemoteLoad} onOpen={() => void openRemote(urlValue)} />}
      {settingsOpen && <SettingsDrawer settings={settings} t={t} onChange={(patch) => { updateSettings(patch.contentWidth === undefined ? patch : { ...patch, wideView: false }); if (patch.showOutline !== undefined) setOutlineOpen(patch.showOutline); }} onReset={() => updateSettings(defaultSettings)} onClose={() => setActiveOverlay(null)} />}
      {workspaceScanning && <div className="remote-loading workspace-loading" role="status" aria-live="polite"><LoaderCircle /><span>{t('scanningWorkspace')}</span><button onClick={cancelWorkspaceScan}>{t('cancel')}</button></div>}
      {remoteLoading && <div className="remote-loading" role="status" aria-live="polite"><LoaderCircle /><span>{t('loadingRemote')}</span><button onClick={cancelRemoteLoad}>{t('cancel')}</button></div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function WorkspaceTree({ nodes, activeId, collapsed, onToggle, onOpen }: { nodes: WorkspaceTreeNode[]; activeId?: string; collapsed: Set<string>; onToggle: (path: string) => void; onOpen: (file: WorkspaceFile) => void }) {
  return <>{nodes.map((node) => node.kind === 'directory' ? <div key={node.id} className="tree-group"><button className="folder-row" style={{ paddingInlineStart: `${12 + node.depth * 13}px` }} onClick={() => onToggle(node.path)}>{collapsed.has(node.path) ? <ChevronRight /> : <ChevronDown />}<Folder /><span>{node.name}</span></button>{!collapsed.has(node.path) && <WorkspaceTree nodes={node.children} activeId={activeId} collapsed={collapsed} onToggle={onToggle} onOpen={onOpen} />}</div> : <button key={node.id} className={`file-row ${activeId === node.id ? 'active' : ''}`} style={{ paddingInlineStart: `${18 + node.depth * 13}px` }} onClick={() => onOpen(node.file)}><File /><span>{node.name}</span>{activeId === node.id && <Check className="row-check" />}</button>)}</>;
}

type Translator = ReturnType<typeof createTranslator>;

function OpenMenu({ t, shortcuts, onFile, onFolder, onUrl }: { t: Translator; shortcuts: ShortcutLabels; onFile: () => void; onFolder: () => void; onUrl: () => void }) {
  return <div className="popover-menu open-menu"><label>{t('openContent')}</label><button onClick={onFile}><FilePlus2 /><span><strong>{t('openFile')}</strong><small>.md · .markdown · .mdx</small></span><kbd>{shortcuts.openFile}</kbd></button><button onClick={onFolder}><FolderOpen /><span><strong>{t('openFolder')}</strong><small>{t('workspace')}</small></span><kbd>{shortcuts.openFolder}</kbd></button><button onClick={onUrl}><Globe2 /><span><strong>{t('openUrl')}</strong><small>HTTP / HTTPS</small></span><kbd>{shortcuts.openUrl}</kbd></button></div>;
}

function MoreMenu({ t, commandShortcut, onCommand, onOutline, onSettings }: { t: Translator; commandShortcut: string; onCommand: () => void; onOutline: () => void; onSettings: () => void }) {
  return <div className="popover-menu more-menu"><button onClick={onCommand}><Command /><span>{t('commandCenter')}</span><kbd>{commandShortcut}</kbd></button><button onClick={onOutline}><ListTree /><span>{t('toggleOutline')}</span></button><button onClick={onSettings}><Settings2 /><span>{t('settings')}</span></button></div>;
}

function OutlinePopover({ headings, activeId, progress, t, onJump }: { headings: HeadingItem[]; activeId?: string; progress: number; t: Translator; onJump: (id: string) => void }) {
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector<HTMLButtonElement>('.active')?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);
  return <aside className="outline-popover" aria-label={t('outline')}><label>{t('onThisPage')}</label><nav ref={navRef}>{headings.map((heading) => <button key={heading.id} className={activeId === heading.id ? 'active' : ''} style={{ paddingInlineStart: `${10 + Math.max(0, heading.level - 1) * 8}px` }} onClick={() => onJump(heading.id)}>{heading.text}</button>)}</nav><div className="outline-progress"><span>{t('readingProgress')} {Math.round(progress)}%</span><i><b style={{ width: `${progress}%` }} /></i></div></aside>;
}

function CommandPalette({ query, matches, workspaceMatches, recent, shortcuts, t, onQuery, onClose, onFile, onFolder, onUrl, onTypedUrl, onWorkspace, onOutline, onQuietMode, onLightTheme, onDarkTheme, onSettings, onRecent, onMatch, onWorkspaceFile }: { query: string; matches: DocumentSearchResult[]; workspaceMatches: WorkspaceFile[]; recent: RecentItem[]; shortcuts: ShortcutLabels; t: Translator; onQuery: (value: string) => void; onClose: () => void; onFile: () => void; onFolder: () => void; onUrl: () => void; onTypedUrl: (value: string) => void; onWorkspace: () => void; onOutline: () => void; onQuietMode: () => void; onLightTheme: () => void; onDarkTheme: () => void; onSettings: () => void; onRecent: (item: RecentItem) => void; onMatch: (match: DocumentSearchResult) => void; onWorkspaceFile: (file: WorkspaceFile) => void }) {
  const needle = query.trim().toLowerCase();
  const actions = [
    { key: 'file', label: t('openFile'), detail: '.md · .markdown · .mdx', icon: <FilePlus2 />, shortcut: shortcuts.openFile, run: onFile },
    { key: 'folder', label: t('openFolder'), detail: t('workspace'), icon: <FolderOpen />, shortcut: shortcuts.openFolder, run: onFolder },
    { key: 'url', label: t('openUrl'), detail: 'HTTP / HTTPS', icon: <Globe2 />, shortcut: shortcuts.openUrl, run: onUrl },
    { key: 'workspace', label: t('toggleWorkspace'), detail: t('files'), icon: <Folder />, shortcut: '', run: onWorkspace },
    { key: 'outline', label: t('toggleOutline'), detail: t('onThisPage'), icon: <ListTree />, shortcut: '', run: onOutline },
    { key: 'quiet', label: t('quietMode'), detail: t('readingRoom'), icon: <Moon />, shortcut: '', run: onQuietMode },
    { key: 'light-theme', label: t('useLightTheme'), detail: t('appearance'), icon: <Sun />, shortcut: '', run: onLightTheme },
    { key: 'dark-theme', label: t('useDarkTheme'), detail: t('appearance'), icon: <Moon />, shortcut: '', run: onDarkTheme },
    { key: 'settings', label: t('settings'), detail: t('settingsLive'), icon: <Settings2 />, shortcut: '', run: onSettings },
  ].filter((action) => !needle || `${action.label} ${action.detail}`.toLowerCase().includes(needle));
  const visibleRecent = recent.filter((item) => !needle || item.title.toLowerCase().includes(needle)).slice(0, 5);
  const hasResults = actions.length || visibleRecent.length || matches.length || workspaceMatches.length || isRemoteUrl(query.trim());
  const navigateRows = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.command-row')];
    const active = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Enter' && active < 0) { event.preventDefault(); rows[0]?.click(); return; }
    if (event.key === 'Enter') return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? (active + 1) % rows.length : (active <= 0 ? rows.length - 1 : active - 1);
    rows[next]?.focus();
  };
  return <div className="command-backdrop" onMouseDown={onClose}><section className="command-palette" role="dialog" aria-modal="true" aria-label={t('commandCenter')} onKeyDown={navigateRows} onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search /><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t('commandPlaceholder')} /><kbd>esc</kbd></div><div className="command-results">{isRemoteUrl(query.trim()) && <div className="command-group"><label>URL</label><button className="command-row active" onClick={() => onTypedUrl(query.trim())}><Globe2 /><span><strong>{t('openUrl')}</strong><small>{query.trim()}</small></span><kbd>↵</kbd></button></div>}{visibleRecent.length > 0 && <div className="command-group"><label>{t('recentlyOpened')}</label>{visibleRecent.map((item, index) => <button key={item.id} className={`command-row ${!needle && index === 0 ? 'active' : ''}`} onClick={() => onRecent(item)}><File /><span><strong>{item.title}</strong><small>{item.kind === 'remote' ? t('fromWeb') : t('workspace')}</small></span></button>)}</div>}{workspaceMatches.length > 0 && <div className="command-group"><label>{t('workspaceFiles')}</label>{workspaceMatches.map((file) => <button key={file.id} className="command-row workspace-match" onClick={() => onWorkspaceFile(file)}><File /><span><strong>{file.name}</strong><small>{file.path}</small></span></button>)}</div>}{actions.length > 0 && <div className="command-group"><label>{t('commands')}</label>{actions.map((action) => <button key={action.key} className="command-row" onClick={() => { action.run(); if (action.key !== 'url' && action.key !== 'settings') onClose(); }}>{action.icon}<span><strong>{action.label}</strong><small>{action.detail}</small></span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>)}</div>}{matches.length > 0 && <div className="command-group"><label>{t('currentDocument')}</label>{matches.map((match) => <button key={match.id} className="command-row document-match" onClick={() => onMatch(match)}><Search /><span><strong>{match.text}</strong><small>{t('line')} {match.lineNumber}</small></span></button>)}</div>}{!hasResults && <p className="command-empty">{t('noCommandResults')}</p>}</div><footer><span>↑↓ {t('search')}</span><span>↵ {t('open')}</span><span>Esc {t('close')}</span></footer></section></div>;
}

function UrlDialog({ value, loading, t, onValue, onClose, onCancel, onOpen }: { value: string; loading: boolean; t: Translator; onValue: (value: string) => void; onClose: () => void; onCancel: () => void; onOpen: () => void }) {
  return <div className="modal-backdrop" onMouseDown={loading ? undefined : onClose}><section className="url-dialog" role="dialog" aria-modal="true" aria-labelledby="url-title" aria-busy={loading} onMouseDown={(event) => event.stopPropagation()}><div className="url-dialog-icon"><Globe2 /></div><h2 id="url-title">{t('urlTitle')}</h2><p>{t('urlDescription')}</p><input autoFocus disabled={loading} type="url" value={value} onChange={(event) => onValue(event.target.value)} onKeyDown={(event) => !loading && event.key === 'Enter' && onOpen()} placeholder={t('urlPlaceholder')} /><div className="dialog-actions"><button className="quiet-button" onClick={loading ? onCancel : onClose}>{t('cancel')}</button><button className="primary-button" disabled={loading} onClick={onOpen}>{loading && <LoaderCircle className="loading-spinner" />}<span>{loading ? t('loadingRemote') : t('open')}</span></button></div></section></div>;
}

function SettingsDrawer({ settings, t, onChange, onReset, onClose }: { settings: ReaderSettings; t: Translator; onChange: (patch: Partial<ReaderSettings>) => void; onReset: () => void; onClose: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="settings-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label={t('settings')}><div className="drawer-title"><div><h2>{t('settings')}</h2><p>{t('settingsLive')}</p></div><button className="icon-button" onClick={onClose} aria-label={t('closeSettings')}><X /></button></div><section><label className="section-label">{t('appearance')}</label><strong className="control-label">{t('system')}</strong><div className="segmented">{(['light', 'dark', 'system'] as const).map((theme) => <button key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => onChange({ theme })}>{theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <span className="system-icon" />} {t(theme)}</button>)}</div><div className="font-choice"><button className={settings.fontFamily === 'serif' ? 'active' : ''} onClick={() => onChange({ fontFamily: 'serif' })}><strong>{t('serif')}</strong><span>Aa</span></button><button className={settings.fontFamily === 'sans' ? 'active' : ''} onClick={() => onChange({ fontFamily: 'sans' })}><strong>{t('sans')}</strong><span>Aa</span></button></div><RangeSetting label={t('textSize')} value={settings.fontSize} min={15} max={24} suffix=" px" onChange={(fontSize) => onChange({ fontSize })} /><RangeSetting label={t('pageWidth')} value={settings.contentWidth} min={560} max={980} step={10} suffix=" px" onChange={(contentWidth) => onChange({ contentWidth })} /><RangeSetting label={t('lineHeight')} value={settings.lineHeight} min={1.45} max={2} step={0.01} onChange={(lineHeight) => onChange({ lineHeight })} /><div className="setting-row"><div><strong>{t('language')}</strong><span>English / 简体中文</span></div><select aria-label={t('language')} value={settings.locale} onChange={(event) => onChange({ locale: event.target.value as ReaderSettings['locale'] })}><option value="system">{t('system')}</option><option value="en">English</option><option value="zh-CN">简体中文</option></select></div></section><section><label className="section-label">{t('readingAids')}</label><Toggle label={t('readingProgress')} description={t('progressDescription')} checked={settings.showReadingProgress} onChange={(showReadingProgress) => onChange({ showReadingProgress })} /><Toggle label={t('autoRefresh')} description={t('refreshDescription')} checked={settings.autoRefresh} onChange={(autoRefresh) => onChange({ autoRefresh })} /><Toggle label={t('floatingOutline')} description={t('outlineDescription')} checked={settings.showOutline} onChange={(showOutline) => onChange({ showOutline })} /></section><details className="settings-group"><summary><span><strong>{t('markdownExtensions')}</strong><small>KaTeX · Mermaid · HTML</small></span><ChevronRight /></summary><div><Toggle label={t('mathematics')} description={t('mathDescription')} checked={settings.enableKatex} onChange={(enableKatex) => onChange({ enableKatex })} /><Toggle label={t('diagrams')} description={t('diagramDescription')} checked={settings.enableMermaid} onChange={(enableMermaid) => onChange({ enableMermaid })} /><Toggle label={t('rawHtml')} description={t('htmlDescription')} checked={settings.enableHtml} onChange={(enableHtml) => onChange({ enableHtml })} /></div></details><details className="settings-group"><summary><span><strong>{t('advanced')}</strong><small>{t('customCss')}</small></span><ChevronRight /></summary><div><label className="section-label" htmlFor="custom-css">{t('customCss')}</label><textarea id="custom-css" value={settings.customCss} onChange={(event) => onChange({ customCss: event.target.value })} placeholder={'.markdown-body h2 {\n  color: rebeccapurple;\n}'} /><p className="setting-note">{t('cssNote')}</p></div></details><div className="settings-footer"><button onClick={onReset}>{t('resetSettings')}</button><span><ShieldCheck />{t('savedLocally')}</span></div></aside></div>;
}

function RangeSetting({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <div className="range-setting"><div><strong>{label}</strong><output>{value}{suffix}</output></div><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-row"><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}
