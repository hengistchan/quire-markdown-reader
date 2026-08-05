import { useEffect, useRef } from 'react';
import {
  Check, ChevronDown, ChevronRight, Command, File, FilePlus2, Folder, FolderOpen, Globe2,
  ListTree, LoaderCircle, Moon, Search, Settings2, ShieldCheck, Sun, X,
} from 'lucide-react';
import { isRemoteUrl } from '../../../core/paths';
import type { ShortcutLabels } from '../../../core/shortcuts';
import type { RecentItem } from '../../../shared/recent';
import type { createTranslator } from '../../../shared/i18n';
import type {
  DocumentSearchResult, HeadingItem, ReaderSettings, WorkspaceFile, WorkspaceTreeNode,
} from '../../../shared/types';

type Translator = ReturnType<typeof createTranslator>;

export function WorkspaceTree({ nodes, activeId, collapsed, onToggle, onOpen }: {
  nodes: WorkspaceTreeNode[];
  activeId?: string;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (file: WorkspaceFile) => void;
}) {
  return <>{nodes.map((node) => node.kind === 'directory' ? (
    <div key={node.id} className="tree-group">
      <button className="folder-row" style={{ paddingInlineStart: `${12 + node.depth * 13}px` }} onClick={() => onToggle(node.path)}>
        {collapsed.has(node.path) ? <ChevronRight /> : <ChevronDown />}<Folder /><span>{node.name}</span>
      </button>
      {!collapsed.has(node.path) && <WorkspaceTree nodes={node.children} activeId={activeId} collapsed={collapsed} onToggle={onToggle} onOpen={onOpen} />}
    </div>
  ) : (
    <button key={node.id} className={`file-row ${activeId === node.id ? 'active' : ''}`} style={{ paddingInlineStart: `${18 + node.depth * 13}px` }} onClick={() => onOpen(node.file)}>
      <File /><span>{node.name}</span>{activeId === node.id && <Check className="row-check" />}
    </button>
  ))}</>;
}

export function OpenMenu({ t, shortcuts, onFile, onFolder, onUrl }: {
  t: Translator;
  shortcuts: ShortcutLabels;
  onFile: () => void;
  onFolder: () => void;
  onUrl: () => void;
}) {
  return <div className="popover-menu open-menu">
    <label>{t('openContent')}</label>
    <button onClick={onFile}><FilePlus2 /><span><strong>{t('openFile')}</strong><small>.md · .markdown · .mdx</small></span><kbd>{shortcuts.openFile}</kbd></button>
    <button onClick={onFolder}><FolderOpen /><span><strong>{t('openFolder')}</strong><small>{t('workspace')}</small></span><kbd>{shortcuts.openFolder}</kbd></button>
    <button onClick={onUrl}><Globe2 /><span><strong>{t('openUrl')}</strong><small>HTTP / HTTPS</small></span><kbd>{shortcuts.openUrl}</kbd></button>
  </div>;
}

export function MoreMenu({ t, commandShortcut, onCommand, onOutline, onSettings }: {
  t: Translator;
  commandShortcut: string;
  onCommand: () => void;
  onOutline: () => void;
  onSettings: () => void;
}) {
  return <div className="popover-menu more-menu">
    <button onClick={onCommand}><Command /><span>{t('commandCenter')}</span><kbd>{commandShortcut}</kbd></button>
    <button onClick={onOutline}><ListTree /><span>{t('toggleOutline')}</span></button>
    <button onClick={onSettings}><Settings2 /><span>{t('settings')}</span></button>
  </div>;
}

export function OutlinePanel({ headings, activeId, progress, t, onJump }: {
  headings: HeadingItem[];
  activeId?: string;
  progress: number;
  t: Translator;
  onJump: (id: string) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector<HTMLButtonElement>('.active')?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);
  return <>
    <nav className="outline-navigation" ref={navRef}>{headings.map((heading) => (
      <button key={heading.id} className={activeId === heading.id ? 'active' : ''} style={{ paddingInlineStart: `${10 + Math.max(0, heading.level - 1) * 8}px` }} onClick={() => onJump(heading.id)}>{heading.text}</button>
    ))}{headings.length === 0 && <p className="outline-empty">{t('noOutline')}</p>}</nav>
    <div className="outline-progress"><span>{t('readingProgress')} {Math.round(progress)}%</span><i><b style={{ width: `${progress}%` }} /></i></div>
  </>;
}

interface CommandPaletteProps {
  query: string;
  matches: DocumentSearchResult[];
  workspaceMatches: WorkspaceFile[];
  recent: RecentItem[];
  shortcuts: ShortcutLabels;
  t: Translator;
  onQuery: (value: string) => void;
  onClose: () => void;
  onFile: () => void;
  onFolder: () => void;
  onUrl: () => void;
  onTypedUrl: (value: string) => void;
  onWorkspace: () => void;
  onOutline: () => void;
  onQuietMode: () => void;
  onLightTheme: () => void;
  onDarkTheme: () => void;
  onSettings: () => void;
  onRecent: (item: RecentItem) => void;
  onMatch: (match: DocumentSearchResult) => void;
  onWorkspaceFile: (file: WorkspaceFile) => void;
}

export function CommandPalette({ query, matches, workspaceMatches, recent, shortcuts, t, onQuery, onClose, onFile, onFolder, onUrl, onTypedUrl, onWorkspace, onOutline, onQuietMode, onLightTheme, onDarkTheme, onSettings, onRecent, onMatch, onWorkspaceFile }: CommandPaletteProps) {
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
  const visibleRecent = recent
    .filter((item) => !needle || item.title.toLowerCase().includes(needle))
    .filter((item) => item.kind !== 'workspace-file' || !workspaceMatches.some((file) => file.path === item.filePath))
    .slice(0, 5);
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
  return <div className="command-backdrop" onMouseDown={onClose}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label={t('commandCenter')} onKeyDown={navigateRows} onMouseDown={(event) => event.stopPropagation()}>
      <div className="command-input"><Search /><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t('commandPlaceholder')} /><kbd>esc</kbd></div>
      <div className="command-results">
        {isRemoteUrl(query.trim()) && <div className="command-group"><label>URL</label><button className="command-row active" onClick={() => onTypedUrl(query.trim())}><Globe2 /><span><strong>{t('openUrl')}</strong><small>{query.trim()}</small></span><kbd>↵</kbd></button></div>}
        {visibleRecent.length > 0 && <div className="command-group"><label>{t('recentlyOpened')}</label>{visibleRecent.map((item, index) => <button key={item.id} className={`command-row ${!needle && index === 0 ? 'active' : ''}`} onClick={() => onRecent(item)}><File /><span><strong>{item.title}</strong><small>{item.kind === 'remote' ? t('fromWeb') : item.kind === 'local-file' ? t('localFile') : t('workspace')}</small></span></button>)}</div>}
        {workspaceMatches.length > 0 && <div className="command-group"><label>{t('workspaceFiles')}</label>{workspaceMatches.map((file) => <button key={file.id} className="command-row workspace-match" onClick={() => onWorkspaceFile(file)}><File /><span><strong>{file.name}</strong><small>{file.path}</small></span></button>)}</div>}
        {actions.length > 0 && <div className="command-group"><label>{t('commands')}</label>{actions.map((action) => <button key={action.key} className="command-row" onClick={() => { action.run(); if (action.key !== 'url' && action.key !== 'settings') onClose(); }}>{action.icon}<span><strong>{action.label}</strong><small>{action.detail}</small></span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>)}</div>}
        {matches.length > 0 && <div className="command-group"><label>{t('currentDocument')}</label>{matches.map((match) => <button key={match.id} className="command-row document-match" onClick={() => onMatch(match)}><Search /><span><strong>{match.text}</strong><small>{t('line')} {match.lineNumber}</small></span></button>)}</div>}
        {!hasResults && <p className="command-empty">{t('noCommandResults')}</p>}
      </div>
      <footer><span>↑↓ {t('search')}</span><span>↵ {t('open')}</span><span>Esc {t('close')}</span></footer>
    </section>
  </div>;
}

export function UrlDialog({ value, loading, t, onValue, onClose, onCancel, onOpen }: {
  value: string;
  loading: boolean;
  t: Translator;
  onValue: (value: string) => void;
  onClose: () => void;
  onCancel: () => void;
  onOpen: () => void;
}) {
  return <div className="modal-backdrop" onMouseDown={loading ? undefined : onClose}>
    <section className="url-dialog" role="dialog" aria-modal="true" aria-labelledby="url-title" aria-busy={loading} onMouseDown={(event) => event.stopPropagation()}>
      <div className="url-dialog-icon"><Globe2 /></div><h2 id="url-title">{t('urlTitle')}</h2><p>{t('urlDescription')}</p>
      <input autoFocus disabled={loading} type="url" value={value} onChange={(event) => onValue(event.target.value)} onKeyDown={(event) => !loading && event.key === 'Enter' && onOpen()} placeholder={t('urlPlaceholder')} />
      <div className="dialog-actions"><button className="quiet-button" onClick={loading ? onCancel : onClose}>{t('cancel')}</button><button className="primary-button" disabled={loading} onClick={onOpen}>{loading && <LoaderCircle className="loading-spinner" />}<span>{loading ? t('loadingRemote') : t('open')}</span></button></div>
    </section>
  </div>;
}

export function SettingsDrawer({ settings, t, onChange, onReset, onClose }: {
  settings: ReaderSettings;
  t: Translator;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="settings-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label={t('settings')}>
      <div className="drawer-title"><div><h2>{t('settings')}</h2><p>{t('settingsLive')}</p></div><button className="icon-button" onClick={onClose} aria-label={t('closeSettings')}><X /></button></div>
      <section>
        <label className="section-label">{t('appearance')}</label><strong className="control-label">{t('system')}</strong>
        <div className="segmented">{(['light', 'dark', 'system'] as const).map((theme) => <button key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => onChange({ theme })}>{theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <span className="system-icon" />} {t(theme)}</button>)}</div>
        <div className="font-choice"><button className={settings.fontFamily === 'serif' ? 'active' : ''} onClick={() => onChange({ fontFamily: 'serif' })}><strong>{t('serif')}</strong><span>Aa</span></button><button className={settings.fontFamily === 'sans' ? 'active' : ''} onClick={() => onChange({ fontFamily: 'sans' })}><strong>{t('sans')}</strong><span>Aa</span></button></div>
        <RangeSetting label={t('textSize')} value={settings.fontSize} min={15} max={24} suffix=" px" onChange={(fontSize) => onChange({ fontSize })} />
        <RangeSetting label={t('pageWidth')} value={settings.contentWidth} min={560} max={980} step={10} suffix=" px" onChange={(contentWidth) => onChange({ contentWidth })} />
        <RangeSetting label={t('lineHeight')} value={settings.lineHeight} min={1.45} max={2} step={0.01} onChange={(lineHeight) => onChange({ lineHeight })} />
        <div className="setting-row"><div><strong>{t('language')}</strong><span>English / 简体中文</span></div><select aria-label={t('language')} value={settings.locale} onChange={(event) => onChange({ locale: event.target.value as ReaderSettings['locale'] })}><option value="system">{t('system')}</option><option value="en">English</option><option value="zh-CN">简体中文</option></select></div>
      </section>
      <section><label className="section-label">{t('readingAids')}</label><Toggle label={t('readingProgress')} description={t('progressDescription')} checked={settings.showReadingProgress} onChange={(showReadingProgress) => onChange({ showReadingProgress })} /><Toggle label={t('autoRefresh')} description={t('refreshDescription')} checked={settings.autoRefresh} onChange={(autoRefresh) => onChange({ autoRefresh })} /><Toggle label={t('floatingOutline')} description={t('outlineDescription')} checked={settings.showOutline} onChange={(showOutline) => onChange({ showOutline })} /></section>
      <details className="settings-group"><summary><span><strong>{t('markdownExtensions')}</strong><small>KaTeX · Mermaid · HTML</small></span><ChevronRight /></summary><div><Toggle label={t('mathematics')} description={t('mathDescription')} checked={settings.enableKatex} onChange={(enableKatex) => onChange({ enableKatex })} /><Toggle label={t('diagrams')} description={t('diagramDescription')} checked={settings.enableMermaid} onChange={(enableMermaid) => onChange({ enableMermaid })} /><Toggle label={t('rawHtml')} description={t('htmlDescription')} checked={settings.enableHtml} onChange={(enableHtml) => onChange({ enableHtml })} /></div></details>
      <details className="settings-group"><summary><span><strong>{t('advanced')}</strong><small>{t('customCss')}</small></span><ChevronRight /></summary><div><label className="section-label" htmlFor="custom-css">{t('customCss')}</label><textarea id="custom-css" value={settings.customCss} onChange={(event) => onChange({ customCss: event.target.value })} placeholder={'.markdown-body h2 {\n  color: rebeccapurple;\n}'} /><p className="setting-note">{t('cssNote')}</p></div></details>
      <div className="settings-footer"><button onClick={onReset}>{t('resetSettings')}</button><span><ShieldCheck />{t('savedLocally')}</span></div>
    </aside>
  </div>;
}

function RangeSetting({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return <div className="range-setting"><div><strong>{label}</strong><output>{value}{suffix}</output></div><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

function Toggle({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="toggle-row"><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}
