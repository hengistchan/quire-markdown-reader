import { File, FilePlus2, Folder, FolderOpen, Globe2, ListTree, Moon, Search, Settings2, Sun } from 'lucide-react';
import { isRemoteUrl } from '../../../core/paths';
import type { ShortcutLabels } from '../../../core/shortcuts';
import type { RecentResource } from '../../../application/ports/recentResourceRepository';
import type { DocumentSearchResult, WorkspaceFile } from '../../../shared/types';
import type { CommandPaletteMode, Translator } from './types';
import { RecentResourceIcon, recentResourceDetail } from './RecentResourceRow';

interface CommandPaletteProps {
  query: string;
  mode: CommandPaletteMode;
  matches: DocumentSearchResult[];
  workspaceMatches: WorkspaceFile[];
  recent: RecentResource[];
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
  onRecent: (item: RecentResource) => void;
  onMatch: (match: DocumentSearchResult) => void;
  onWorkspaceFile: (file: WorkspaceFile) => void;
}

export function CommandPalette({ query, mode, matches, workspaceMatches, recent, shortcuts, t, onQuery, onClose, onFile, onFolder, onUrl, onTypedUrl, onWorkspace, onOutline, onQuietMode, onLightTheme, onDarkTheme, onSettings, onRecent, onMatch, onWorkspaceFile }: CommandPaletteProps) {
  const needle = query.trim().toLowerCase();
  const actions = (mode === 'recent' ? [] : [
    { key: 'file', label: t('openFile'), detail: '.md · .markdown · .mdx', icon: <FilePlus2 />, shortcut: shortcuts.openFile, run: onFile },
    { key: 'folder', label: t('openFolder'), detail: t('workspace'), icon: <FolderOpen />, shortcut: shortcuts.openFolder, run: onFolder },
    { key: 'url', label: t('openUrl'), detail: 'HTTP / HTTPS', icon: <Globe2 />, shortcut: shortcuts.openUrl, run: onUrl },
    { key: 'workspace', label: t('toggleWorkspace'), detail: t('files'), icon: <Folder />, shortcut: '', run: onWorkspace },
    { key: 'outline', label: t('toggleOutline'), detail: t('onThisPage'), icon: <ListTree />, shortcut: '', run: onOutline },
    { key: 'quiet', label: t('quietMode'), detail: t('readingRoom'), icon: <Moon />, shortcut: '', run: onQuietMode },
    { key: 'light-theme', label: t('useLightTheme'), detail: t('appearance'), icon: <Sun />, shortcut: '', run: onLightTheme },
    { key: 'dark-theme', label: t('useDarkTheme'), detail: t('appearance'), icon: <Moon />, shortcut: '', run: onDarkTheme },
    { key: 'settings', label: t('settings'), detail: t('settingsLive'), icon: <Settings2 />, shortcut: '', run: onSettings },
  ]).filter((action) => !needle || `${action.label} ${action.detail}`.toLowerCase().includes(needle));
  const visibleRecent = recent
    .filter((item) => !needle || `${item.title} ${recentResourceDetail(item, t)}`.toLowerCase().includes(needle))
    .slice(0, mode === 'recent' ? recent.length : 10);
  const visibleMatches = mode === 'recent' ? [] : matches;
  const visibleWorkspaceMatches = mode === 'recent' ? [] : workspaceMatches;
  const typedRemoteUrl = mode !== 'recent' && isRemoteUrl(query.trim());
  const hasResults = actions.length || visibleRecent.length || visibleMatches.length
    || visibleWorkspaceMatches.length || typedRemoteUrl;
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
      <div className="command-input"><Search /><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder={mode === 'recent' ? t('searchRecentlyOpened') : t('commandPlaceholder')} /><kbd>esc</kbd></div>
      <div className="command-results">
        {typedRemoteUrl && <div className="command-group"><label>URL</label><button className="command-row active" onClick={() => onTypedUrl(query.trim())}><Globe2 /><span><strong>{t('openUrl')}</strong><small>{query.trim()}</small></span><kbd>↵</kbd></button></div>}
        {visibleRecent.length > 0 && <div className="command-group"><label>{t('recentlyOpened')}</label>{visibleRecent.map((item, index) => <button key={item.id} className={`command-row ${!needle && index === 0 ? 'active' : ''}`} onClick={() => onRecent(item)}><RecentResourceIcon resource={item} /><span><strong>{item.title}</strong><small>{recentResourceDetail(item, t)}</small></span></button>)}</div>}
        {visibleWorkspaceMatches.length > 0 && <div className="command-group"><label>{t('workspaceFiles')}</label>{visibleWorkspaceMatches.map((file) => <button key={file.id} className="command-row workspace-match" onClick={() => onWorkspaceFile(file)}><File /><span><strong>{file.name}</strong><small>{file.path}</small></span></button>)}</div>}
        {actions.length > 0 && <div className="command-group"><label>{t('commands')}</label>{actions.map((action) => <button key={action.key} className="command-row" onClick={() => { action.run(); if (action.key !== 'url' && action.key !== 'settings') onClose(); }}>{action.icon}<span><strong>{action.label}</strong><small>{action.detail}</small></span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>)}</div>}
        {visibleMatches.length > 0 && <div className="command-group"><label>{t('currentDocument')}</label>{visibleMatches.map((match) => <button key={match.id} className="command-row document-match" onClick={() => onMatch(match)}><Search /><span><strong>{match.text}</strong><small>{t('line')} {match.lineNumber}</small></span></button>)}</div>}
        {!hasResults && <p className="command-empty">{t('noCommandResults')}</p>}
      </div>
      <footer><span>↑↓ {t('search')}</span><span>↵ {t('open')}</span><span>Esc {t('close')}</span></footer>
    </section>
  </div>;
}
