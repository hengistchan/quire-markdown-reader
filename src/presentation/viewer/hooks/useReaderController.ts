import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readerErrorMessage } from '../../../shared/errors/readerError';
import { createShortcutLabels } from '../../../core/shortcuts';
import type {
  ReaderSettings, SidebarMode,
} from '../../../shared/types';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useNavigationRestoration, useReaderNavigation } from './useReaderNavigation';
import { useReaderFeedback } from './useReaderFeedback';
import { useReaderOverlay } from './useReaderOverlay';
import { useReaderSession } from './useReaderSession';
import { useReaderSettings } from './useReaderSettings';
import { useReaderSearch } from './useReaderSearch';
import { useRecentDocumentActions, useRecentDocuments } from './useRecentDocuments';
import { useDocumentOpen } from './useDocumentOpen';
import { useWorkspace } from './useWorkspace';
import { useReaderDocument } from './useReaderDocument';
import { useReaderInitialization } from './useReaderInitialization';
import type { ReaderController } from '../../../application/reader/readerController';
import type { NavigationTarget } from '../../../domain/navigation/navigationTarget';

const WIDE_READER_WIDTH = 980;

export function useReaderController(controller: ReaderController) {
  const settingsFeature = useReaderSettings(controller);
  const { settings, resolvedTheme, t } = settingsFeature;
  const sessionFeature = useReaderSession(t);
  const {
    session, dispatch: dispatchSession, title, source, sourceUrl,
    remoteState, workspace, activeFile,
  } = sessionFeature;
  const overlays = useReaderOverlay();
  const feedback = useReaderFeedback();
  const { error, notice, showError: setError, showNotice: setNotice } = feedback;
  const [sidebarMode, setSidebarMode] = useState<SidebarMode | null>(null);
  const setActiveOverlay = overlays.setActive;
  const [urlValue, setUrlValue] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const documentFeature = useReaderDocument({
    controller,
    session,
    settings,
    resolvedTheme,
    t,
    dispatch: dispatchSession,
    showNotice: setNotice,
  });
  const {
    articleRef, activeHeadingId, progress, queueDocumentNavigation, htmlMarkup, headings,
    readMinutes, workspaceName, jumpToHeading,
  } = documentFeature;
  const navigateToTargetRef = useRef<((target?: NavigationTarget) => Promise<void>) | undefined>(undefined);
  const navigation = useReaderNavigation(controller, (target) => {
    void navigateToTargetRef.current?.(target);
  });
  const recentFeature = useRecentDocuments(controller, session, activeHeadingId);
  const {
    items: recent, record: recordRecent, resumeTarget, clearResume, prepareResume,
    continueReading, startFromTop,
  } = recentFeature;

  const { openMenuOpen, moreMenuOpen, commandOpen, settingsOpen, urlOpen } = overlays;

  const shortcutLabels = useMemo(() => createShortcutLabels(), []);
  useEffect(() => () => controller.dispose(), [controller]);

  const updateSettings = settingsFeature.update;
  const documents = useDocumentOpen({
    controller,
    session,
    navigation,
    dispatchSession,
    queueDocumentNavigation,
    recordRecent,
    setSidebarMode,
    closeOverlay: overlays.close,
    showError: setError,
    fileInput,
    pastedTitle: t('pastedDocument'),
  });
  const {
    openImported: openImportedDocument,
    openWorkspaceFile,
    openLocalHandle: handleFileHandle,
    openDroppedFile: handleFile,
    openFilePicker: handleOpenFile,
    openRemote,
    cancelRemoteLoad,
    handleArticleClick,
    handlePaste,
    remoteLoading,
    remoteRetryUrl,
  } = documents;
  const workspaceFeature = useWorkspace({
    controller,
    sourceUrl,
    workspace,
    activeFile,
    openWorkspaceFile,
    setSidebarMode,
    closeOverlay: overlays.close,
    showError: setError,
    showNotice: setNotice,
    t,
  });
  const {
    restorable: restorableWorkspace,
    setRestorable: setRestorableWorkspace,
    scanning: workspaceScanning,
    collapsedDirectories,
    directoryInput,
    activate: activateWorkspace,
    cancelScan: cancelWorkspaceScan,
    openDirectory: handleDirectory,
    openTransient: handleTransientDirectory,
    restore: restoreWorkspace,
    refresh: refreshWorkspace,
    dismissRestore: dismissWorkspaceRestore,
    toggleDirectory,
  } = workspaceFeature;
  const recentActions = useRecentDocumentActions({
    controller,
    clearResume,
    prepareResume,
    openRemote,
    activateWorkspace,
    openLocalHandle: handleFileHandle,
    closeOverlay: overlays.close,
    showError: setError,
  });
  const restoration = useNavigationRestoration({
    controller,
    workspace,
    replaceSession: sessionFeature.replace,
    setSidebarMode,
    showError: setError,
    setRestorableWorkspace,
    clearResume,
    queueDocumentNavigation,
    openWorkspaceFile,
    activateWorkspace,
    openLocalHandle: handleFileHandle,
    openRemote,
    openImported: openImportedDocument,
    t,
  });
  const { restorable: restorableNavigation, restore: restoreNavigation } = restoration;
  navigateToTargetRef.current = restoration.navigateToTarget;
  useReaderInitialization({
    controller,
    currentTarget: navigation.current,
    replaceSettings: settingsFeature.replace,
    replaceRecent: recentFeature.replace,
    openImported: (document) => openImportedDocument(document, undefined, 'replace'),
    navigateToTarget: restoration.navigateToTarget,
    activateWorkspace: (handle, path, id) => activateWorkspace(handle, path, id, 'replace'),
    setRestorableWorkspace,
    setSidebarMode,
  });

  useKeyboardShortcuts({
    openCommand: () => setActiveOverlay('command'),
    openFile: () => void handleOpenFile(),
    openFolder: () => void handleDirectory(),
    openUrl: () => setActiveOverlay('url-dialog'),
    close: () => setActiveOverlay(null),
  });

  const search = useReaderSearch({
    source,
    workspace,
    articleRef,
    closeOverlay: () => setActiveOverlay(null),
    openWorkspaceFile: (file) => { void openWorkspaceFile(file); },
  });
  const {
    commandQuery, setCommandQuery, fileFilter, setFileFilter, commandMatches, workspaceMatches,
    filteredFiles, jumpToSearchResult, openWorkspaceSearchResult,
  } = search;
  const contextMode = sidebarMode === 'files' && (workspace || restorableWorkspace)
    ? 'files'
    : sidebarMode === 'outline' && settings.showOutline
      ? 'outline'
      : null;
  const contextOpen = contextMode !== null;
  const readerWidth = settings.wideView ? WIDE_READER_WIDTH : settings.contentWidth;

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

  const dismissError = () => { setError(undefined); documents.clearRemoteRetry(); };
  const dismissRestore = () => {
    dismissWorkspaceRestore();
    restoration.dismiss();
  };
  const toggleOpenMenu = () => setActiveOverlay((current) => current === 'open-menu' ? null : 'open-menu');
  const toggleMoreMenu = () => setActiveOverlay((current) => current === 'more-menu' ? null : 'more-menu');
  const openImportedSettings = (patch: Partial<ReaderSettings>) => {
    updateSettings(patch.contentWidth === undefined ? patch : { ...patch, wideView: false });
    if (patch.showOutline !== undefined) {
      setSidebarMode((current) => patch.showOutline ? 'outline' : current === 'outline' ? null : current);
    }
  };
  const resetSettings = settingsFeature.reset;
  const errorText = error ? readerErrorMessage(error, t) : undefined;

  return {
    document: {
      activeFile, activeHeadingId, articleRef, handleArticleClick, headings, htmlMarkup, jumpToHeading,
      openRemote, progress, readMinutes, remoteState, session, title, workspaceName,
    },
    navigation,
    workspace: {
      current: workspace,
      restorable: restorableWorkspace,
      scanning: workspaceScanning,
      contextMode,
      contextOpen,
      collapsedDirectories,
      directoryInput,
      fileFilter,
      filteredFiles,
      cancelScan: cancelWorkspaceScan,
      dismissRestore,
      openDirectory: handleDirectory,
      openFile: openWorkspaceFile,
      openTransient: handleTransientDirectory,
      refresh: refreshWorkspace,
      restore: restorableNavigation ? restoreNavigation : restoreWorkspace,
      setFileFilter,
      setSidebarMode,
      toggleDirectory,
      togglePanel: toggleWorkspacePanel,
    },
    search: {
      commandMatches, commandQuery, jumpToSearchResult, openWorkspaceSearchResult,
      setCommandQuery, workspaceMatches,
    },
    settings: {
      value: settings,
      readerWidth,
      t,
      openImportedSettings,
      reset: resetSettings,
      toggleOutlinePanel,
      update: updateSettings,
    },
    overlays: {
      commandOpen, moreMenuOpen, openMenuOpen, settingsOpen, urlOpen, urlValue,
      setActive: setActiveOverlay, setUrlValue, toggleMoreMenu, toggleOpenMenu,
    },
    feedback: {
      cancelRemoteLoad, continueReading, dismissError, error: errorText, notice, remoteLoading,
      remoteRetryUrl, restorableNavigation, resumeTarget, startFromTop,
    },
    input: {
      dragActive, fileInput, handleDrop, handleFile, handleOpenFile, handlePaste,
      setDragActive, shortcutLabels,
    },
    recent: { items: recent, open: recentActions.open },
  };
}

export type ReaderViewModel = ReturnType<typeof useReaderController>;
