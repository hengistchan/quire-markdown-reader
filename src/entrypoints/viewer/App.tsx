import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenText,
  Check,
  ChevronRight,
  File,
  FilePlus2,
  Files,
  FolderOpen,
  ListTree,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sun,
  X,
} from 'lucide-react';
import { collectMarkdownFiles, readWorkspaceFile } from '../../core/files';
import { renderMarkdown } from '../../core/markdown';
import { defaultSettings, loadSettings, saveSettings } from '../../shared/settings';
import type { HeadingItem, ImportedDocument, ReaderSettings, SidebarMode, WorkspaceFile } from '../../shared/types';

const welcomeMarkdown = `# Welcome to Folio

Folio turns Markdown into a focused reading space. Open a file, choose a folder, or send the current browser page here from the extension button.

::: note
**Built for reading.** Your documents stay on your device. Folio asks for access only when you choose a file or folder.
:::

## A quieter workspace

The sidebar follows the way you read: switch between the files in your workspace and the structure of the current document. Everything else gets out of the way.

- [x] GitHub-flavoured Markdown
- [x] Footnotes, definitions, and callouts
- [x] Syntax highlighting
- [x] KaTeX and Mermaid diagrams
- [x] Light, dark, and system themes

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

Use **Open file** for one document, or **Open folder** to build a local workspace. Your reading preferences are remembered automatically.

---

Folio is intentionally read-only. Your original documents are never modified.
`;

function getSystemTheme(): 'light' | 'dark' {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function extractHeadings(html: string): HeadingItem[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return [...document.querySelectorAll<HTMLElement>('h1, h2, h3, h4')].map((heading) => ({
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
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  }, []);

  return progress;
}

export function App() {
  const [settings, setSettings] = useState<ReaderSettings>(defaultSettings);
  const [title, setTitle] = useState('Welcome to Folio');
  const [source, setSource] = useState(welcomeMarkdown);
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [workspaceName, setWorkspaceName] = useState('Getting started');
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('outline');
  const [sidebarOpen, setSidebarOpen] = useState(() => innerWidth > 760);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const progress = useReadingProgress();

  const html = useMemo(() => renderMarkdown(source, settings), [source, settings]);
  const headings = useMemo(() => extractHeadings(html), [html]);
  const resolvedTheme = settings.theme === 'system' ? getSystemTheme() : settings.theme;

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  const openImportedDocument = useCallback((document: ImportedDocument) => {
    setTitle(document.title.replace(/\.(md|markdown|mdx)$/i, ''));
    setSource(document.markdown || `# ${document.title}\n\nThe linked document could not be fetched automatically. Open it as a local file, or grant Folio access to its website and try again.`);
    setSourceUrl(document.sourceUrl);
    setWorkspaceName(document.sourceUrl ? 'From the web' : 'Imported document');
    setFiles([]);
    setActiveFile(undefined);
    scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    void loadSettings().then(setSettings);
    if (typeof browser !== 'undefined' && browser.storage) {
      void browser.storage.local.get('importedDocument').then((result) => {
        const imported = result.importedDocument as ImportedDocument | undefined;
        if (!imported) return;
        openImportedDocument(imported);
        void browser.storage.local.remove('importedDocument');
      });
    }
  }, [openImportedDocument]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (!settings.enableMermaid || !articleRef.current) return;
    let cancelled = false;
    void import('mermaid').then(({ default: mermaid }) => {
      if (cancelled || !articleRef.current) return;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: resolvedTheme === 'dark' ? 'dark' : 'neutral',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      });
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
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setSettingsOpen(false);
      }
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, []);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(md|markdown|mdx)$/i)) {
      setNotice('Choose a Markdown file: .md, .markdown, or .mdx');
      return;
    }
    openImportedDocument({ title: file.name, markdown: await file.text() });
  };

  const handleDirectory = async () => {
    if (!('showDirectoryPicker' in window)) {
      setNotice('Folder access is not supported in this browser.');
      return;
    }
    try {
      const directory = await window.showDirectoryPicker({ mode: 'read' });
      const nextFiles = await collectMarkdownFiles(directory);
      setWorkspaceName(directory.name);
      setFiles(nextFiles);
      setSidebarMode('files');
      setSidebarOpen(true);
      if (!nextFiles[0]) {
        setNotice('No Markdown files were found in this folder.');
        return;
      }
      setActiveFile(nextFiles[0].id);
      setTitle(nextFiles[0].name.replace(/\.(md|markdown|mdx)$/i, ''));
      setSource(await readWorkspaceFile(nextFiles[0]));
      setSourceUrl(undefined);
      scrollTo({ top: 0 });
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setNotice('Folio could not read that folder.');
    }
  };

  const openWorkspaceFile = async (file: WorkspaceFile) => {
    setActiveFile(file.id);
    setTitle(file.name.replace(/\.(md|markdown|mdx)$/i, ''));
    setSource(await readWorkspaceFile(file));
    setSourceUrl(undefined);
    scrollTo({ top: 0, behavior: 'smooth' });
  };

  const jumpToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const matches = query.trim()
    ? source.split('\n').filter((line) => line.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="app-shell" style={{ '--reader-width': `${settings.contentWidth}px`, '--reader-size': `${settings.fontSize}px`, '--reader-leading': settings.lineHeight } as React.CSSProperties}>
      {settings.showReadingProgress && <div className="reading-progress" style={{ transform: `scaleX(${progress / 100})` }} />}

      <header className="topbar">
        <div className="topbar-start">
          <button className="icon-button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
            {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
          <div className="brand-mark"><BookOpenText aria-hidden="true" /></div>
          <div className="document-identity">
            <strong>{title}</strong>
            <span>{sourceUrl ? new URL(sourceUrl).hostname : workspaceName}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="action-button" onClick={() => fileInput.current?.click()}><FilePlus2 /> <span>Open file</span></button>
          <button className="action-button" onClick={handleDirectory}><FolderOpen /> <span>Open folder</span></button>
          <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label="Search document"><Search /></button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Reader settings"><Settings2 /></button>
          <input ref={fileInput} hidden type="file" accept=".md,.markdown,.mdx,text/markdown" onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])} />
        </div>
      </header>

      <div className={`workspace ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <aside className="sidebar" aria-label="Document navigation">
          <div className="sidebar-tabs" role="tablist">
            <button className={sidebarMode === 'files' ? 'active' : ''} onClick={() => setSidebarMode('files')} role="tab" aria-selected={sidebarMode === 'files'}><Files /> Files</button>
            <button className={sidebarMode === 'outline' ? 'active' : ''} onClick={() => setSidebarMode('outline')} role="tab" aria-selected={sidebarMode === 'outline'}><ListTree /> Outline</button>
          </div>
          <div className="sidebar-heading">
            <span>{sidebarMode === 'files' ? 'Workspace' : 'On this page'}</span>
            <strong>{sidebarMode === 'files' ? workspaceName : `${headings.length} sections`}</strong>
          </div>
          <nav className="sidebar-list">
            {sidebarMode === 'files' ? (
              files.length ? files.map((file) => (
                <button key={file.id} className={`file-row ${activeFile === file.id ? 'active' : ''}`} style={{ paddingInlineStart: `${14 + file.depth * 14}px` }} onClick={() => void openWorkspaceFile(file)}>
                  <File /> <span>{file.name}</span>{activeFile === file.id && <Check className="row-check" />}
                </button>
              )) : (
                <div className="sidebar-empty"><FolderOpen /><p>No folder open</p><button onClick={handleDirectory}>Choose a folder</button></div>
              )
            ) : (
              headings.map((heading) => (
                <button key={heading.id} className="outline-row" style={{ paddingInlineStart: `${14 + (heading.level - 1) * 12}px` }} onClick={() => jumpToHeading(heading.id)}>
                  <span>{heading.text}</span><ChevronRight />
                </button>
              ))
            )}
          </nav>
          <div className="sidebar-foot"><span className="status-dot" /> Local-only reading</div>
        </aside>

        <main className="reader-stage">
          <div className="paper-grain" aria-hidden="true" />
          <article
            ref={articleRef}
            className={`markdown-body font-${settings.fontFamily}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {settings.customCss && <style>{`@scope (.markdown-body) { ${settings.customCss} }`}</style>}
          <footer className="document-footer"><span>End of document</span><i /></footer>
        </main>
      </div>

      {searchOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSearchOpen(false)}>
          <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search document" onMouseDown={(event) => event.stopPropagation()}>
            <div className="search-input"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this document…" /><kbd>esc</kbd></div>
            <div className="search-results">
              {!query.trim() && <p className="search-hint">Type a word or phrase to search the Markdown source.</p>}
              {query.trim() && !matches.length && <p className="search-hint">No matches in this document.</p>}
              {matches.map((line, index) => <button key={`${line}-${index}`} onClick={() => setSearchOpen(false)}><span>{line.replace(/^#+\s*/, '')}</span></button>)}
            </div>
          </section>
        </div>
      )}

      {settingsOpen && <SettingsDrawer settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function SettingsDrawer({ settings, onChange, onClose }: { settings: ReaderSettings; onChange: (patch: Partial<ReaderSettings>) => void; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="settings-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Reader settings">
        <div className="drawer-title"><div><span>Reading room</span><h2>Make it yours</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X /></button></div>
        <section>
          <label className="section-label">Appearance</label>
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((theme) => <button key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => onChange({ theme })}>{theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <span className="system-icon" />} {theme}</button>)}
          </div>
          <div className="setting-row"><div><strong>Reading font</strong><span>Choose the voice of the page</span></div><select value={settings.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value as ReaderSettings['fontFamily'] })}><option value="sans">Sans</option><option value="serif">Serif</option></select></div>
          <RangeSetting label="Text size" value={settings.fontSize} min={15} max={24} suffix="px" onChange={(fontSize) => onChange({ fontSize })} />
          <RangeSetting label="Line height" value={settings.lineHeight} min={1.45} max={2} step={0.01} onChange={(lineHeight) => onChange({ lineHeight })} />
          <RangeSetting label="Page width" value={settings.contentWidth} min={560} max={980} step={10} suffix="px" onChange={(contentWidth) => onChange({ contentWidth })} />
        </section>
        <section>
          <label className="section-label">Markdown</label>
          <Toggle label="Mathematics" description="Render KaTeX expressions" checked={settings.enableKatex} onChange={(enableKatex) => onChange({ enableKatex })} />
          <Toggle label="Diagrams" description="Render Mermaid blocks" checked={settings.enableMermaid} onChange={(enableMermaid) => onChange({ enableMermaid })} />
          <Toggle label="Reading progress" description="Show a fine progress line" checked={settings.showReadingProgress} onChange={(showReadingProgress) => onChange({ showReadingProgress })} />
          <Toggle label="Raw HTML" description="Sanitized before display" checked={settings.enableHtml} onChange={(enableHtml) => onChange({ enableHtml })} />
        </section>
        <section>
          <label className="section-label" htmlFor="custom-css">Custom CSS</label>
          <textarea id="custom-css" value={settings.customCss} onChange={(event) => onChange({ customCss: event.target.value })} placeholder={'.markdown-body h2 {\n  color: rebeccapurple;\n}'} />
          <p className="setting-note">Scoped to the document. Changes are saved automatically.</p>
        </section>
      </aside>
    </div>
  );
}

function RangeSetting({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <div className="range-setting"><div><strong>{label}</strong><output>{value}{suffix}</output></div><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-row"><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}
