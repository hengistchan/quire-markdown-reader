import {
  useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction,
} from 'react';
import type { RecentItemInput } from '../../../application/ports/recentRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import type { NavigationIntent } from '../../../application/navigation/navigationController';
import {
  isLocalMarkdownUrl, isSelectLocalMarkdownWorkspaceFileMessage, NAVIGATE_LOCAL_MARKDOWN_WORKSPACE,
} from '../../../core/localMarkdown';
import { isRemoteUrl, linkFragment } from '../../../core/paths';
import {
  createFileSession, createImportedSession, createRemoteSession, createWorkspaceSession,
  type DocumentSession, type DocumentSessionAction,
} from '../../../domain/documentSession';
import { toReaderError, type ReaderError } from '../../../shared/errors/readerError';
import { RemoteDocumentError } from '../../../shared/errors/remoteDocumentError';
import type {
  ImportedDocument, SidebarMode, WorkspaceFile, WorkspaceSnapshot,
} from '../../../shared/types';
import type { ReaderNavigationModel } from './useReaderNavigation';

interface DocumentOpenOptions {
  controller: ReaderController;
  session: DocumentSession;
  navigation: ReaderNavigationModel;
  dispatchSession(action: DocumentSessionAction): void;
  queueDocumentNavigation(fragment?: string): void;
  recordRecent(item: RecentItemInput): Promise<void>;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode | null>>;
  closeOverlay(): void;
  showError(error: ReaderError | undefined): void;
  fileInput: RefObject<HTMLInputElement | null>;
  pastedTitle: string;
}

export function useDocumentOpen(options: DocumentOpenOptions) {
  const {
    controller, session, navigation, dispatchSession, queueDocumentNavigation, recordRecent,
    setSidebarMode, closeOverlay, showError, fileInput,
  } = options;
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteRetryUrl, setRemoteRetryUrl] = useState<string>();
  const remoteRequestSequence = useRef(0);
  const remoteRequest = useRef<{ id: number; controller: AbortController } | undefined>(undefined);
  const embeddedLocalSourceUrl = useRef<string | undefined>(undefined);

  const abortRemoteRequest = useCallback(() => {
    remoteRequestSequence.current += 1;
    remoteRequest.current?.controller.abort();
    remoteRequest.current = undefined;
    setRemoteLoading(false);
  }, []);

  const openImported = useCallback(async (
    imported: ImportedDocument,
    fragment?: string,
    navigationMode: NavigationIntent = 'push',
    existingSessionId?: string,
  ) => {
    abortRemoteRequest();
    const opened = await controller.openImported(imported, undefined, existingSessionId);
    if (window.top !== window && imported.sourceUrl && isLocalMarkdownUrl(imported.sourceUrl)) {
      embeddedLocalSourceUrl.current = imported.sourceUrl;
    }
    dispatchSession({ type: 'replace', session: createImportedSession(imported) });
    if (navigationMode !== 'traverse') navigation.record({
      document: { kind: 'imported', sessionId: opened.sessionId }, fragment,
    }, navigationMode);
    setSidebarMode((current) => current === 'files' ? null : current);
    showError(undefined);
    queueDocumentNavigation(fragment);
    scrollTo({ top: 0 });
  }, [abortRemoteRequest, controller, dispatchSession, navigation, queueDocumentNavigation, setSidebarMode, showError]);

  const openWorkspaceFile = useCallback(async (
    file: WorkspaceFile,
    currentWorkspace?: WorkspaceSnapshot,
    fragment?: string,
    navigationMode: NavigationIntent = 'push',
  ) => {
    abortRemoteRequest();
    const targetWorkspace = currentWorkspace ?? (session.kind === 'workspace' ? session.workspace : undefined);
    if (!targetWorkspace) throw new Error('A workspace is required to open a workspace file.');
    const snapshot = await controller.openWorkspaceFile(targetWorkspace, file);
    if (snapshot.metadata.lastModified === undefined || snapshot.metadata.size === undefined) {
      throw new Error('A local file snapshot requires modification metadata.');
    }
    dispatchSession({
      type: 'replace',
      session: createWorkspaceSession(
        targetWorkspace,
        file,
        snapshot.markdown,
        snapshot.metadata.lastModified,
        snapshot.metadata.size,
      ),
    });
    if (targetWorkspace.id) {
      await recordRecent({
        id: `workspace-file:${targetWorkspace.id}:${file.path}`,
        title: file.name,
        kind: 'workspace-file',
        workspaceId: targetWorkspace.id,
        filePath: file.path,
      });
      if (navigationMode !== 'traverse') navigation.record({
        document: { kind: 'workspace-file', workspaceId: targetWorkspace.id, filePath: file.path },
        fragment,
      }, navigationMode);
    }
    if (targetWorkspace.transient && navigationMode === 'push'
      && embeddedLocalSourceUrl.current && window.top !== window) {
      window.parent.postMessage({
        type: NAVIGATE_LOCAL_MARKDOWN_WORKSPACE,
        workspaceName: targetWorkspace.name,
        filePath: file.path,
      }, '*');
    }
    showError(undefined);
    queueDocumentNavigation(fragment);
    scrollTo({ top: 0, behavior: 'smooth' });
  }, [abortRemoteRequest, controller, dispatchSession, navigation, queueDocumentNavigation, recordRecent, session, showError]);

  useEffect(() => {
    const workspace = session.kind === 'workspace' ? session.workspace : undefined;
    if (window.top === window || !workspace?.transient) return;
    const selectFile = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (event.source !== window.parent || !isSelectLocalMarkdownWorkspaceFileMessage(message)) return;
      const file = workspace.files.find((candidate) => candidate.path === message.filePath);
      if (file) void openWorkspaceFile(file, workspace, undefined, 'traverse');
    };
    window.addEventListener('message', selectFile);
    return () => window.removeEventListener('message', selectFile);
  }, [openWorkspaceFile, session]);

  const openLocalHandle = useCallback(async (
    handle: FileSystemFileHandle,
    existingId?: string,
    fragment?: string,
    navigationMode: NavigationIntent = 'push',
  ) => {
    if (!handle.name.match(/\.(md|markdown|mdx)$/i)) {
      showError({ code: 'file-type-invalid', retryable: false });
      return;
    }
    abortRemoteRequest();
    const fileId = await controller.saveFile(handle, existingId);
    const file: WorkspaceFile = { id: `file:${fileId}`, name: handle.name, path: handle.name, depth: 0, handle };
    const snapshot = await controller.openLocalFile(file);
    if (snapshot.metadata.lastModified === undefined || snapshot.metadata.size === undefined) {
      throw new Error('A local file snapshot requires modification metadata.');
    }
    dispatchSession({
      type: 'replace',
      session: createFileSession(file, snapshot.markdown, snapshot.metadata.lastModified, snapshot.metadata.size),
    });
    if (navigationMode !== 'traverse') navigation.record({
      document: { kind: 'local-file', fileId }, fragment,
    }, navigationMode);
    setSidebarMode((current) => current === 'files' ? null : current);
    showError(undefined);
    scrollTo({ top: 0 });
    closeOverlay();
    await recordRecent({ id: `local-file:${fileId}`, title: handle.name, kind: 'local-file', fileId });
    queueDocumentNavigation(fragment);
  }, [abortRemoteRequest, closeOverlay, controller, dispatchSession, navigation, queueDocumentNavigation, recordRecent, setSidebarMode, showError]);

  const openDroppedFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(md|markdown|mdx)$/i)) {
      showError({ code: 'file-type-invalid', retryable: false });
      return;
    }
    await openImported({ title: file.name, markdown: await file.text() });
    closeOverlay();
  }, [closeOverlay, openImported, showError]);

  const openFilePicker = useCallback(async () => {
    if (!('showOpenFilePicker' in window)) {
      fileInput.current?.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdx'] } }],
      });
      if (handle) await openLocalHandle(handle);
    } catch (caught) {
      if ((caught as DOMException).name !== 'AbortError') {
        showError(toReaderError(caught, 'file-read-failed'));
      }
    }
  }, [fileInput, openLocalHandle, showError]);

  const openRemote = useCallback(async (
    value: string,
    requestPermission = true,
    navigationMode: NavigationIntent = 'push',
    targetFragment?: string,
  ) => {
    const requestId = remoteRequestSequence.current + 1;
    remoteRequestSequence.current = requestId;
    remoteRequest.current?.controller.abort();
    if (!isRemoteUrl(value)) {
      remoteRequest.current = undefined;
      setRemoteLoading(false);
      showError({ code: 'invalid-url', retryable: false });
      setRemoteRetryUrl(undefined);
      return;
    }
    const requestController = new AbortController();
    remoteRequest.current = { id: requestId, controller: requestController };
    const isLatestRequest = () => remoteRequest.current?.id === requestId;
    showError(undefined);
    setRemoteRetryUrl(undefined);
    setRemoteLoading(true);
    try {
      if (requestPermission) {
        const granted = await controller.requestRemoteOrigin(value);
        if (!isLatestRequest()) return;
        if (!granted) {
          showError({ code: 'permission-denied', retryable: true });
          return;
        }
      }
      const snapshot = await controller.openRemote(value, requestController.signal);
      if (!isLatestRequest()) return;
      if (!snapshot.remoteState) throw new Error('A remote document snapshot requires refresh state.');
      const document = {
        title: snapshot.title,
        markdown: snapshot.markdown,
        sourceUrl: snapshot.metadata.sourceUrl,
      };
      const documentUrl = new URL(snapshot.remoteState.url);
      documentUrl.hash = '';
      dispatchSession({ type: 'replace', session: createRemoteSession(document, snapshot.remoteState) });
      const fragment = targetFragment ?? linkFragment(value);
      if (navigationMode !== 'traverse') navigation.record({
        document: { kind: 'remote', url: documentUrl.href }, fragment,
      }, navigationMode);
      queueDocumentNavigation(fragment);
      setSidebarMode((current) => current === 'files' ? null : current);
      scrollTo({ top: 0 });
      closeOverlay();
      await recordRecent({
        id: `remote:${documentUrl.href}`,
        title: snapshot.title,
        kind: 'remote',
        url: documentUrl.href,
      });
    } catch (caught) {
      if (!isLatestRequest()) return;
      if (caught instanceof RemoteDocumentError && caught.code === 'cancelled') return;
      const readerError = toReaderError(caught, 'remote-network-error');
      showError(readerError);
      if (readerError.retryable) setRemoteRetryUrl(value);
    } finally {
      if (isLatestRequest()) {
        remoteRequest.current = undefined;
        setRemoteLoading(false);
      }
    }
  }, [closeOverlay, controller, dispatchSession, navigation, queueDocumentNavigation, recordRecent, setSidebarMode, showError]);

  const cancelRemoteLoad = useCallback(() => {
    abortRemoteRequest();
    closeOverlay();
  }, [abortRemoteRequest, closeOverlay]);

  const handleArticleClick = (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const raw = anchor.getAttribute('href');
    if (!raw) return;
    const resolution = controller.resolveLink(raw);
    if (resolution.type === 'fragment') {
      if (!resolution.fragment) return;
      event.preventDefault();
      navigation.pushFragment(resolution.fragment);
      queueDocumentNavigation(resolution.fragment);
      return;
    }
    const workspace = session.kind === 'workspace' ? session.workspace : undefined;
    if (resolution.type === 'workspace-document' && workspace) {
      event.preventDefault();
      const file = workspace.files.find((candidate) => candidate.path === resolution.path);
      if (file) void openWorkspaceFile(file, undefined, resolution.fragment);
      else showError({ code: 'linked-file-missing', retryable: false });
      return;
    }
    if (resolution.type === 'remote-document') {
      event.preventDefault();
      void openRemote(resolution.url);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('input, textarea, select, [contenteditable="true"]')) return;
    const file = event.clipboardData.files[0];
    if (file) {
      event.preventDefault();
      void openDroppedFile(file);
      return;
    }
    const markdown = event.clipboardData.getData('text/plain');
    if (!markdown.trim()) return;
    event.preventDefault();
    void openImported({ title: options.pastedTitle, markdown });
    closeOverlay();
  };

  return {
    openImported,
    openWorkspaceFile,
    openLocalHandle,
    openDroppedFile,
    openFilePicker,
    openRemote,
    cancelPendingRemote: abortRemoteRequest,
    cancelRemoteLoad,
    handleArticleClick,
    handlePaste,
    remoteLoading,
    remoteRetryUrl,
    clearRemoteRetry: () => setRemoteRetryUrl(undefined),
  };
}
