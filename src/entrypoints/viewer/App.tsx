import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Check, ChevronDown, ChevronRight, File, FilePlus2, Files, Folder,
  FolderOpen, Globe2, ListTree, Moon, PanelLeftClose, PanelLeftOpen, RotateCw, Search,
  Settings2, ShieldCheck, Sun, X,
} from 'lucide-react';
import {
  collectWorkspace, getWorkspaceFileHandle, readWorkspaceFileSnapshot,
} from '../../core/files';
import { renderMarkdown } from '../../core/markdown';
import { fetchRemoteMarkdown } from '../../core/remote';
import { hostPermissionPattern, isMarkdownLink, isRelativeUrl, resolveWorkspacePath } from '../../core/paths';
import { loadWorkspaceHandle, saveWorkspaceHandle } from '../../core/workspacePersistence';
import { createTranslator, resolveLocale } from '../../shared/i18n';
import { loadRecentItems, rememberRecentItem, type RecentItem } from '../../shared/recent';
import { defaultSettings, loadSettings, saveSettings } from '../../shared/settings';
import type {
  HeadingItem, ImportedDocument, ReaderSettings, RemoteDocumentState, SidebarMode, WorkspaceFile,
  WorkspaceSnapshot, WorkspaceTreeNode,
} from '../../shared/types';

const welcomeMarkdown = `# Welcome to Quire

Quire turns Markdown into a focused reading space. Open a file, connect a folder, or read a document from the web.

::: note
**Built for reading.** Your documents stay on your device, and Quire never modifies the source.
:::

## A quieter workspace

Switch between a real folder tree and the current document outline. Everything else gets out of the way.

- [x] GitHub-flavoured Markdown
- [x] Footnotes, definitions, and callouts
- [x] Syntax highlighting
- [x] KaTeX and Mermaid diagrams
- [x] Relative images and document links

## Rich technical notes

Inline maths such as $E = mc^2$ stays crisp, while code keeps its language-aware highlighting:

\`\`\`ts
type ReadingState = {
  document: string;
  position: number;
};
\`\`\`

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[Sanitize]
  B --> C[Read]
\`\`\`

## Start here

Use **Open file** for one document, **Open folder** for a local workspace, or **Open URL** for remote Markdown.
`;

type SourceKind = 'welcome' | 'file' | 'workspace' | 'remote' | 'imported';

function getSystemTheme(): 'light' | 'dark' {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function extractHeadings(html: string): HeadingItem[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return [...parsed.querySelectorAll<HTMLElement>('h1, h2, h3, h4')].map((heading) => ({
    id: heading.id,
    text: heading.textContent?.replace('#', '').trim() || 'Untitled section',
    level: Number(heading.tagName.slice(1)),
  }));
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
  const [title, setTitle] = useState('Welcome to Quire');
  const [source, setSource] = useState(welcomeMarkdown);
  const [sourceKind, setSourceKind] = useState<SourceKind>('welcome');
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [remoteState, setRemoteState] = useState<RemoteDocumentState>();
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>();
  const [activeFile, setActiveFile] = useState<WorkspaceFile>();
  const [activeModified, setActiveModified] = useState<number>();
  const [restorableHandle, setRestorableHandle] = useState<FileSystemDirectoryHandle>();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('outline');
  const [sidebarOpen, setSidebarOpen] = useState(() => innerWidth > 760);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const progress = useReadingProgress();

  const locale = resolveLocale(settings.locale);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const html = useMemo(() => renderMarkdown(source, settings), [source, settings]);
  const htmlMarkup = useMemo(() => ({ __html: html }), [html]);
  const headings = useMemo(() => extractHeadings(html), [html]);
  const resolvedTheme = settings.theme === 'system' ? getSystemTheme() : settings.theme;
  const workspaceName = workspace?.name ?? (sourceUrl ? t('fromWeb') : sourceKind === 'welcome' ? t('gettingStarted') : t('imported'));

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const finishOnboarding = useCallback(() => {
    setOnboardingOpen(false);
    if (typeof browser !== 'undefined') void browser.storage.local.set({ onboardingComplete: true });
  }, []);

  const recordRecent = useCallback(async (item: Omit<RecentItem, 'openedAt'>) => {
    setRecent(await rememberRecentItem(item));
  }, []);

  const openImportedDocument = useCallback((imported: ImportedDocument, kind: SourceKind = 'imported') => {
    setTitle(imported.title.replace(/\.(md|markdown|mdx)$/i, ''));
    setSource(imported.markdown);
    setSourceUrl(imported.sourceUrl);
    setSourceKind(kind);
    setWorkspace(undefined);
    setActiveFile(undefined);
    setActiveModified(undefined);
    setSidebarMode('outline');
    setError(undefined);
    scrollTo({ top: 0 });
  }, []);

  const openWorkspaceFile = useCallback(async (file: WorkspaceFile, currentWorkspace?: WorkspaceSnapshot) => {
    const snapshot = await readWorkspaceFileSnapshot(file);
    if (currentWorkspace) setWorkspace(currentWorkspace);
    setActiveFile(file);
    setActiveModified(snapshot.lastModified);
    setTitle(file.name.replace(/\.(md|markdown|mdx)$/i, ''));
    setSource(snapshot.markdown);
    setSourceKind('workspace');
    setSourceUrl(undefined);
    setRemoteState(undefined);
    setError(undefined);
    scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const activateWorkspace = useCallback(async (handle: FileSystemDirectoryHandle, preferredPath?: string) => {
    const snapshot = await collectWorkspace(handle);
    setWorkspace(snapshot);
    setSidebarMode('files');
    setSidebarOpen(true);
    const selected = snapshot.files.find((file) => file.path === preferredPath)
      ?? snapshot.files.find((file) => /^readme\.(md|markdown|mdx)$/i.test(file.path))
      ?? snapshot.files[0];
    if (!selected) {
      setError(t('noMarkdown'));
      return;
    }
    await openWorkspaceFile(selected, snapshot);
    await saveWorkspaceHandle(handle);
    await recordRecent({ id: `workspace:${handle.name}`, title: handle.name, kind: 'workspace' });
  }, [openWorkspaceFile, recordRecent, t]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const [loadedSettings, stored, recentItems] = await Promise.all([
        loadSettings(),
        typeof browser === 'undefined' ? Promise.resolve({} as Record<string, unknown>) : browser.storage.local.get(['importedDocument', 'onboardingComplete']),
        loadRecentItems(),
      ]);
      setSettings(loadedSettings);
      setRecent(recentItems);
      const imported = stored.importedDocument as ImportedDocument | undefined;
      if (imported?.markdown) {
        openImportedDocument(imported);
        if (typeof browser !== 'undefined') await browser.storage.local.remove('importedDocument');
      } else if (!stored.onboardingComplete) {
        setOnboardingOpen(true);
      }
      if ('showDirectoryPicker' in window) {
        try {
          const handle = await loadWorkspaceHandle();
          if (!handle) return;
          const permission = await handle.queryPermission({ mode: 'read' });
          if (permission === 'granted' && !imported) await activateWorkspace(handle);
          else setRestorableHandle(handle);
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
            image.alt = `${image.alt || raw} — resource unavailable`;
          }
        } else if (sourceUrl) {
          image.src = new URL(raw, sourceUrl).href;
        }
      }
    };
    void resolveImages();
    return () => { cancelled = true; for (const url of objectUrls) URL.revokeObjectURL(url); };
  }, [activeFile, html, sourceUrl, workspace]);

  useEffect(() => {
    if (!settings.autoRefresh || !activeFile || (sourceKind !== 'workspace' && sourceKind !== 'file')) return;
    let checking = false;
    const check = async () => {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const snapshot = await readWorkspaceFileSnapshot(activeFile);
        if (activeModified !== undefined && snapshot.lastModified !== activeModified) {
          setSource(snapshot.markdown);
          setActiveModified(snapshot.lastModified);
          setNotice(t('updated'));
        }
      } finally { checking = false; }
    };
    const timer = setInterval(() => void check(), 1500);
    return () => clearInterval(timer);
  }, [activeFile, activeModified, settings.autoRefresh, sourceKind, t]);

  useEffect(() => {
    if (!settings.autoRefresh || !remoteState || sourceKind !== 'remote') return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void fetchRemoteMarkdown(remoteState.url, remoteState).then((result) => {
        setRemoteState(result.state);
        if (result.document) {
          setSource(result.document.markdown);
          setNotice(t('updated'));
        }
      }).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(timer);
  }, [remoteState, settings.autoRefresh, sourceKind, t]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); }
      if (event.key === 'Escape') { setSearchOpen(false); setSettingsOpen(false); setUrlOpen(false); }
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, []);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(md|markdown|mdx)$/i)) { setError(t('fileTypeError')); return; }
    openImportedDocument({ title: file.name, markdown: await file.text() }, 'file');
    finishOnboarding();
  };

  const handleFileHandle = async (handle: FileSystemFileHandle) => {
    if (!handle.name.match(/\.(md|markdown|mdx)$/i)) { setError(t('fileTypeError')); return; }
    const file: WorkspaceFile = { id: handle.name, name: handle.name, path: handle.name, depth: 0, handle };
    const snapshot = await readWorkspaceFileSnapshot(file);
    setTitle(handle.name.replace(/\.(md|markdown|mdx)$/i, ''));
    setSource(snapshot.markdown);
    setSourceKind('file');
    setSourceUrl(undefined);
    setRemoteState(undefined);
    setWorkspace(undefined);
    setActiveFile(file);
    setActiveModified(snapshot.lastModified);
    setSidebarMode('outline');
    setError(undefined);
    scrollTo({ top: 0 });
    finishOnboarding();
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
    finishOnboarding();
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

  const openRemote = useCallback(async (value: string, requestPermission = true) => {
    try {
      const permission = hostPermissionPattern(value);
      if (requestPermission && typeof browser !== 'undefined') {
        const granted = await browser.permissions.request({ origins: [permission] });
        if (!granted) { setError(t('permissionDenied')); return; }
      }
      const result = await fetchRemoteMarkdown(value);
      if (!result.document) return;
      openImportedDocument(result.document, 'remote');
      setRemoteState(result.state);
      setUrlOpen(false);
      finishOnboarding();
      await recordRecent({ id: `remote:${result.state.url}`, title: result.document.title, kind: 'remote', url: result.state.url });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('remoteReadError'));
    }
  }, [finishOnboarding, openImportedDocument, recordRecent, t]);

  const handleArticleClick = (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const raw = anchor.getAttribute('href');
    if (!raw || raw.startsWith('#')) return;
    if (workspace && activeFile && isRelativeUrl(raw) && isMarkdownLink(raw)) {
      event.preventDefault();
      const path = resolveWorkspacePath(activeFile.path, raw);
      const file = workspace.files.find((candidate) => candidate.path === path);
      if (file) void openWorkspaceFile(file);
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

  const matches = query.trim() ? source.split('\n').filter((line) => line.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];

  return (
    <div className="app-shell" style={{ '--reader-width': `${settings.contentWidth}px`, '--reader-size': `${settings.fontSize}px`, '--reader-leading': settings.lineHeight } as React.CSSProperties}>
      {settings.showReadingProgress && <div className="reading-progress" style={{ transform: `scaleX(${progress / 100})` }} />}
      <header className="topbar">
        <div className="topbar-start">
          <button className="icon-button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? t('hideSidebar') : t('showSidebar')}>{sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</button>
          <div className="brand-mark" aria-label="Quire"><span>M</span></div>
          <div className="document-identity"><strong>{title}</strong><span>{sourceUrl ? new URL(sourceUrl).hostname : workspaceName}</span></div>
        </div>
        <div className="topbar-actions">
          <button className="action-button" onClick={() => void handleOpenFile()}><FilePlus2 /> <span>{t('openFile')}</span></button>
          <button className="action-button" onClick={() => void handleDirectory()}><FolderOpen /> <span>{t('openFolder')}</span></button>
          <button className="action-button" onClick={() => setUrlOpen(true)}><Globe2 /> <span>{t('openUrl')}</span></button>
          <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label={t('search')}><Search /></button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label={t('settings')}><Settings2 /></button>
          <input ref={fileInput} hidden type="file" accept=".md,.markdown,.mdx,text/markdown" onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])} />
        </div>
      </header>

      <div className={`workspace ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <aside className="sidebar" aria-label="Document navigation">
          <div className="sidebar-tabs" role="tablist">
            <button className={sidebarMode === 'files' ? 'active' : ''} onClick={() => setSidebarMode('files')} role="tab" aria-selected={sidebarMode === 'files'}><Files /> {t('files')}</button>
            <button className={sidebarMode === 'outline' ? 'active' : ''} onClick={() => setSidebarMode('outline')} role="tab" aria-selected={sidebarMode === 'outline'}><ListTree /> {t('outline')}</button>
          </div>
          <div className="sidebar-heading"><span>{sidebarMode === 'files' ? t('workspace') : t('onThisPage')}</span><strong>{sidebarMode === 'files' ? workspaceName : `${headings.length} ${t('sections')}`}</strong></div>
          {restorableHandle && <div className="restore-card"><RotateCw /><strong>{t('restoreTitle')}</strong><p>{t('restoreBody')}</p><button onClick={() => void restoreWorkspace()}>{t('restore')}</button><button className="quiet" onClick={() => setRestorableHandle(undefined)}>{t('dismiss')}</button></div>}
          <nav className="sidebar-list">
            {sidebarMode === 'files' ? workspace?.tree.length ? (
              <WorkspaceTree nodes={workspace.tree} activeId={activeFile?.id} collapsed={collapsedDirectories} onToggle={toggleDirectory} onOpen={(file) => void openWorkspaceFile(file)} />
            ) : <div className="sidebar-empty"><FolderOpen /><p>{t('noFolder')}</p><button onClick={() => void handleDirectory()}>{t('chooseFolder')}</button></div> : headings.map((heading) => (
              <button key={heading.id} className="outline-row" style={{ paddingInlineStart: `${14 + (heading.level - 1) * 12}px` }} onClick={() => document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span>{heading.text}</span><ChevronRight /></button>
            ))}
          </nav>
          <div className="sidebar-foot"><span className="status-dot" /> {settings.autoRefresh && (activeFile || remoteState) ? t('watching') : t('localOnly')}</div>
        </aside>

        <main className="reader-stage">
          <div className="paper-grain" aria-hidden="true" />
          {error && <div className="error-banner" role="alert"><AlertCircle /><span>{error}</span><button onClick={() => setError(undefined)} aria-label="Dismiss"><X /></button></div>}
          <article ref={articleRef} className={`markdown-body font-${settings.fontFamily}`} onClick={handleArticleClick} dangerouslySetInnerHTML={htmlMarkup} />
          {settings.customCss && <style>{`@scope (.markdown-body) { ${settings.customCss} }`}</style>}
          <footer className="document-footer"><span>{t('endDocument')}</span><i /></footer>
        </main>
      </div>

      {searchOpen && <SearchDialog query={query} matches={matches} t={t} onQuery={setQuery} onClose={() => setSearchOpen(false)} />}
      {urlOpen && <UrlDialog value={urlValue} t={t} onValue={setUrlValue} onClose={() => setUrlOpen(false)} onOpen={() => void openRemote(urlValue)} />}
      {settingsOpen && <SettingsDrawer settings={settings} t={t} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
      {onboardingOpen && <Onboarding recent={recent} t={t} onFile={() => void handleOpenFile()} onFolder={() => void handleDirectory()} onUrl={() => setUrlOpen(true)} onRemote={(url) => void openRemote(url)} onClose={finishOnboarding} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function WorkspaceTree({ nodes, activeId, collapsed, onToggle, onOpen }: { nodes: WorkspaceTreeNode[]; activeId?: string; collapsed: Set<string>; onToggle: (path: string) => void; onOpen: (file: WorkspaceFile) => void }) {
  return <>{nodes.map((node) => node.kind === 'directory' ? <div key={node.id} className="tree-group"><button className="folder-row" style={{ paddingInlineStart: `${12 + node.depth * 13}px` }} onClick={() => onToggle(node.path)}>{collapsed.has(node.path) ? <ChevronRight /> : <ChevronDown />}<Folder /><span>{node.name}</span></button>{!collapsed.has(node.path) && <WorkspaceTree nodes={node.children} activeId={activeId} collapsed={collapsed} onToggle={onToggle} onOpen={onOpen} />}</div> : <button key={node.id} className={`file-row ${activeId === node.id ? 'active' : ''}`} style={{ paddingInlineStart: `${18 + node.depth * 13}px` }} onClick={() => onOpen(node.file)}><File /><span>{node.name}</span>{activeId === node.id && <Check className="row-check" />}</button>)}</>;
}

type Translator = ReturnType<typeof createTranslator>;

function SearchDialog({ query, matches, t, onQuery, onClose }: { query: string; matches: string[]; t: Translator; onQuery: (value: string) => void; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="search-dialog" role="dialog" aria-modal="true" aria-label={t('search')} onMouseDown={(event) => event.stopPropagation()}><div className="search-input"><Search /><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t('searchPlaceholder')} /><kbd>esc</kbd></div><div className="search-results">{!query.trim() && <p className="search-hint">{t('searchHint')}</p>}{query.trim() && !matches.length && <p className="search-hint">{t('noMatches')}</p>}{matches.map((line, index) => <button key={`${line}-${index}`} onClick={onClose}><span>{line.replace(/^#+\s*/, '')}</span></button>)}</div></section></div>;
}

function UrlDialog({ value, t, onValue, onClose, onOpen }: { value: string; t: Translator; onValue: (value: string) => void; onClose: () => void; onOpen: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="url-dialog" role="dialog" aria-modal="true" aria-labelledby="url-title" onMouseDown={(event) => event.stopPropagation()}><div className="url-dialog-icon"><Globe2 /></div><h2 id="url-title">{t('urlTitle')}</h2><p>{t('urlDescription')}</p><input autoFocus type="url" value={value} onChange={(event) => onValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onOpen()} placeholder={t('urlPlaceholder')} /><div className="dialog-actions"><button className="quiet-button" onClick={onClose}>{t('cancel')}</button><button className="primary-button" onClick={onOpen}>{t('open')}</button></div></section></div>;
}

function Onboarding({ recent, t, onFile, onFolder, onUrl, onRemote, onClose }: { recent: RecentItem[]; t: Translator; onFile: () => void; onFolder: () => void; onUrl: () => void; onRemote: (url: string) => void; onClose: () => void }) {
  return <div className="onboarding-backdrop"><section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><button className="onboarding-close" onClick={onClose} aria-label="Close"><X /></button><div className="onboarding-brand"><div className="onboarding-mark">M</div><span>QUIRE / MARKDOWN READER</span></div><h1 id="onboarding-title">{t('welcomeTitle')}</h1><p className="onboarding-lead">{t('welcomeBody')}</p><div className="onboarding-actions"><button onClick={onFile}><FilePlus2 /><span><strong>{t('chooseFileAction')}</strong><small>.md · .markdown · .mdx</small></span><ChevronRight /></button><button onClick={onFolder}><FolderOpen /><span><strong>{t('connectFolderAction')}</strong><small>{t('privateByDesign')}</small></span><ChevronRight /></button><button onClick={onUrl}><Globe2 /><span><strong>{t('pasteUrlAction')}</strong><small>HTTP / HTTPS</small></span><ChevronRight /></button></div>{recent.length > 0 && <div className="recent-list"><label>{t('recent')}</label>{recent.map((item) => <button key={item.id} disabled={!item.url} onClick={() => item.url && onRemote(item.url)}><span>{item.title}</span><small>{item.kind === 'remote' ? t('fromWeb') : t('workspace')}</small></button>)}</div>}<div className="privacy-note"><ShieldCheck /><span><strong>{t('privateByDesign')}</strong>{t('privateBody')}</span></div></section></div>;
}

function SettingsDrawer({ settings, t, onChange, onClose }: { settings: ReaderSettings; t: Translator; onChange: (patch: Partial<ReaderSettings>) => void; onClose: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="settings-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label={t('settings')}><div className="drawer-title"><div><span>{t('readingRoom')}</span><h2>{t('makeItYours')}</h2></div><button className="icon-button" onClick={onClose} aria-label={t('closeSettings')}><X /></button></div><section><label className="section-label">{t('appearance')}</label><div className="segmented">{(['system', 'light', 'dark'] as const).map((theme) => <button key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => onChange({ theme })}>{theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <span className="system-icon" />} {t(theme)}</button>)}</div><div className="setting-row"><div><strong>{t('language')}</strong><span>English / 简体中文</span></div><select aria-label={t('language')} value={settings.locale} onChange={(event) => onChange({ locale: event.target.value as ReaderSettings['locale'] })}><option value="system">{t('system')}</option><option value="en">English</option><option value="zh-CN">简体中文</option></select></div><div className="setting-row"><div><strong>{t('readingFont')}</strong><span>{t('fontDescription')}</span></div><select aria-label={t('readingFont')} value={settings.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value as ReaderSettings['fontFamily'] })}><option value="sans">{t('sans')}</option><option value="serif">{t('serif')}</option></select></div><RangeSetting label={t('textSize')} value={settings.fontSize} min={15} max={24} suffix="px" onChange={(fontSize) => onChange({ fontSize })} /><RangeSetting label={t('lineHeight')} value={settings.lineHeight} min={1.45} max={2} step={0.01} onChange={(lineHeight) => onChange({ lineHeight })} /><RangeSetting label={t('pageWidth')} value={settings.contentWidth} min={560} max={980} step={10} suffix="px" onChange={(contentWidth) => onChange({ contentWidth })} /></section><section><label className="section-label">{t('markdown')}</label><Toggle label={t('mathematics')} description={t('mathDescription')} checked={settings.enableKatex} onChange={(enableKatex) => onChange({ enableKatex })} /><Toggle label={t('diagrams')} description={t('diagramDescription')} checked={settings.enableMermaid} onChange={(enableMermaid) => onChange({ enableMermaid })} /><Toggle label={t('readingProgress')} description={t('progressDescription')} checked={settings.showReadingProgress} onChange={(showReadingProgress) => onChange({ showReadingProgress })} /><Toggle label={t('autoRefresh')} description={t('refreshDescription')} checked={settings.autoRefresh} onChange={(autoRefresh) => onChange({ autoRefresh })} /><Toggle label={t('rawHtml')} description={t('htmlDescription')} checked={settings.enableHtml} onChange={(enableHtml) => onChange({ enableHtml })} /></section><section><label className="section-label" htmlFor="custom-css">{t('customCss')}</label><textarea id="custom-css" value={settings.customCss} onChange={(event) => onChange({ customCss: event.target.value })} placeholder={'.markdown-body h2 {\n  color: rebeccapurple;\n}'} /><p className="setting-note">{t('cssNote')}</p></section></aside></div>;
}

function RangeSetting({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <div className="range-setting"><div><strong>{label}</strong><output>{value}{suffix}</output></div><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-row"><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}
