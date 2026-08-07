import { lazy, Suspense, type CSSProperties } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, ChevronDown, File, FolderOpen, ListTree, LoaderCircle,
  MoreHorizontal, RotateCw, Search, Settings2, StretchHorizontal, X,
} from 'lucide-react';
import { MoreMenu } from './components/MoreMenu';
import { OpenMenu } from './components/OpenMenu';
import { OutlinePanel } from './components/OutlinePanel';
import { UrlDialog } from './components/UrlDialog';
import { WorkspaceTree } from './components/WorkspaceTree';
import type { ReaderViewModel } from './hooks/useReaderController';

const CommandPalette = lazy(() => import('./components/CommandPalette')
  .then((module) => ({ default: module.CommandPalette })));
const SettingsDrawer = lazy(() => import('./components/SettingsDrawer')
  .then((module) => ({ default: module.SettingsDrawer })));

export function ReaderView({ view }: { view: ReaderViewModel }) {
  const {
    document: documentModel, navigation, workspace: workspaceModel, search, settings: settingsModel,
    overlays, feedback, input, recent: recentModel,
  } = view;
  const {
    activeFile, activeHeadingId, articleRef, handleArticleClick, headings, htmlMarkup, jumpToHeading,
    openRemote, progress, readMinutes, remoteState, session, title, workspaceName,
  } = documentModel;
  const {
    current: workspace, restorable: restorableWorkspace, scanning: workspaceScanning, contextMode,
    contextOpen, collapsedDirectories, directoryInput, fileFilter, filteredFiles,
    cancelScan: cancelWorkspaceScan, dismissRestore, openDirectory: handleDirectory,
    openFile: openWorkspaceFile, openTransient: handleTransientDirectory, refresh: refreshWorkspace,
    restore: restoreWorkspace, setFileFilter, setSidebarMode, toggleDirectory,
    togglePanel: toggleWorkspacePanel,
  } = workspaceModel;
  const {
    commandMatches, commandQuery, jumpToSearchResult, openWorkspaceSearchResult,
    setCommandQuery, workspaceMatches,
  } = search;
  const {
    value: settings, readerWidth, t, openImportedSettings, reset: resetSettings,
    toggleOutlinePanel, update: updateSettings,
  } = settingsModel;
  const {
    commandOpen, moreMenuOpen, openMenuOpen, settingsOpen, urlOpen, urlValue,
    setActive: setActiveOverlay, setUrlValue, toggleMoreMenu, toggleOpenMenu,
  } = overlays;
  const {
    cancelRemoteLoad, continueReading, dismissError, error, notice, remoteLoading, remoteRetryUrl,
    restorableNavigation, resumeTarget, startFromTop,
  } = feedback;
  const {
    dragActive, fileInput, handleDrop, handleFile, handleOpenFile, handlePaste,
    setDragActive, shortcutLabels,
  } = input;
  const { items: recent, open: openRecent } = recentModel;

  return (
    <div className={`app-shell ${dragActive ? 'drag-active' : ''}`} style={{ '--reader-width': `${readerWidth}px`, '--reader-size': `${settings.fontSize}px`, '--reader-leading': settings.lineHeight } as CSSProperties} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event) => void handleDrop(event)} onPaste={handlePaste}>
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
            <button disabled={!navigation.canGoBack} onClick={navigation.back} aria-label={t('previousDocument')} title={t('previousDocument')}><ArrowLeft /></button>
            <button disabled={!navigation.canGoForward} onClick={navigation.forward} aria-label={t('nextDocument')} title={t('nextDocument')}><ArrowRight /></button>
          </div>
          <div className="document-identity">
            <span>{workspaceName}{activeFile?.path ? ` / ${activeFile.path.split('/').slice(0, -1).join('/')}` : ''}</span>
            <strong>{title}</strong>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="menu-anchor">
            <button className="open-trigger" onClick={toggleOpenMenu} aria-expanded={openMenuOpen}><span>{t('open')}</span><ChevronDown /></button>
            {openMenuOpen && <OpenMenu t={t} shortcuts={shortcutLabels} onFile={() => void handleOpenFile()} onFolder={() => void handleDirectory()} onUrl={() => setActiveOverlay('url-dialog')} />}
          </div>
          <button className={`topbar-icon ${settings.wideView ? 'active' : ''}`} onClick={() => updateSettings({ wideView: !settings.wideView })} aria-label={settings.wideView ? t('disableWideView') : t('enableWideView')} aria-pressed={settings.wideView} title={settings.wideView ? t('disableWideView') : t('enableWideView')}><StretchHorizontal /></button>
          <button className="topbar-icon" onClick={() => setActiveOverlay('command')} aria-label={t('commandCenter')}><Search /></button>
          <div className="menu-anchor">
            <button className="topbar-icon" onClick={toggleMoreMenu} aria-label={t('moreActions')} aria-expanded={moreMenuOpen}><MoreHorizontal /></button>
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
          {restorableWorkspace && <div className="restore-card"><RotateCw /><strong>{t('restoreTitle')}</strong><p>{t('restoreBody')}</p><button onClick={() => void restoreWorkspace()}>{t('restore')}</button><button className="quiet" onClick={dismissRestore}>{t('dismiss')}</button></div>}
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
          {error && <div className="error-banner" role="alert"><AlertCircle /><span>{error}</span><div className="error-actions">{restorableNavigation && <button className="retry-button" onClick={() => void restoreWorkspace()}>{t('restoreDocument')}</button>}{!restorableNavigation && remoteRetryUrl && <button className="retry-button" onClick={() => void openRemote(remoteRetryUrl, false)}>{t('retry')}</button>}<button onClick={dismissError} aria-label={t('dismissNotice')}><X /></button></div></div>}
          {session.kind !== 'welcome' && <div className="document-meta">{readMinutes} {t('minuteRead')}</div>}
          <article ref={articleRef} className={`markdown-body font-${settings.fontFamily}`} onClick={handleArticleClick} dangerouslySetInnerHTML={htmlMarkup} />
          {settings.customCss && <style>{`@scope (.markdown-body) { ${settings.customCss} }`}</style>}
          <footer className="document-footer"><span>{t('endDocument')}</span><i /></footer>
        </main>
      </div>

      <Suspense fallback={null}>
        {commandOpen && <CommandPalette query={commandQuery} matches={commandMatches} workspaceMatches={workspaceMatches} recent={recent} shortcuts={shortcutLabels} t={t} onQuery={setCommandQuery} onClose={() => { setActiveOverlay(null); setCommandQuery(''); }} onFile={() => void handleOpenFile()} onFolder={() => void handleDirectory()} onUrl={() => setActiveOverlay('url-dialog')} onTypedUrl={(value) => void openRemote(value)} onWorkspace={toggleWorkspacePanel} onOutline={toggleOutlinePanel} onQuietMode={() => setSidebarMode(null)} onLightTheme={() => updateSettings({ theme: 'light' })} onDarkTheme={() => updateSettings({ theme: 'dark' })} onSettings={() => setActiveOverlay('settings')} onRecent={(item) => void openRecent(item)} onMatch={jumpToSearchResult} onWorkspaceFile={openWorkspaceSearchResult} />}
        {settingsOpen && <SettingsDrawer settings={settings} t={t} onChange={openImportedSettings} onReset={resetSettings} onClose={() => setActiveOverlay(null)} />}
      </Suspense>
      {urlOpen && <UrlDialog value={urlValue} loading={remoteLoading} t={t} onValue={setUrlValue} onClose={() => setActiveOverlay(null)} onCancel={cancelRemoteLoad} onOpen={() => void openRemote(urlValue)} />}
      {workspaceScanning && <div className="remote-loading workspace-loading" role="status" aria-live="polite"><LoaderCircle /><span>{t('scanningWorkspace')}</span><button onClick={cancelWorkspaceScan}>{t('cancel')}</button></div>}
      {remoteLoading && <div className="remote-loading" role="status" aria-live="polite"><LoaderCircle /><span>{t('loadingRemote')}</span><button onClick={cancelRemoteLoad}>{t('cancel')}</button></div>}
      {dragActive && <div className="drop-overlay" aria-hidden="true"><FolderOpen /><strong>{t('dropToOpen')}</strong></div>}
      {resumeTarget && <div className="resume-prompt" role="status"><span>{t('resumeReading')}</span><button onClick={continueReading}>{t('continueReading')}</button><button className="quiet" onClick={startFromTop}>{t('startFromTop')}</button></div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
