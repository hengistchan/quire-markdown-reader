import {
  useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction,
} from 'react';
import type { RecentItemInput } from '../../../application/ports/recentRepository';
import type { RecentResourceInput } from '../../../application/ports/recentResourceRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import type { NavigationIntent } from '../../../application/navigation/navigationController';
import type { NavigationOperationController } from '../../../application/navigation/navigationOperationController';
import {
  isLocalMarkdownUrl, isSelectLocalMarkdownWorkspaceFileMessage, NAVIGATE_LOCAL_MARKDOWN_WORKSPACE,
} from '../../../core/localMarkdown';
import { isRemoteUrl, linkFragment } from '../../../core/paths';
import { normalizeRecentRemoteUrl } from '../../../application/recent/recentResourceService';
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
  recordRecent(item: RecentItemInput, signal?: AbortSignal): Promise<void>;
  rememberRecentResource(resource: RecentResourceInput, signal?: AbortSignal): Promise<void>;
  updateRecentWorkspaceDocument(workspaceId: string, filePath: string, signal?: AbortSignal): Promise<void>;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode | null>>;
  closeOverlay(): void;
  showError(error: ReaderError | undefined): void;
  fileInput: RefObject<HTMLInputElement | null>;
  pastedTitle: string;
  navigationOperation: NavigationOperationController;
}

export function useDocumentOpen(options: DocumentOpenOptions) {
  const {
    controller, session, navigation, dispatchSession, queueDocumentNavigation, recordRecent,
    rememberRecentResource, updateRecentWorkspaceDocument, setSidebarMode, closeOverlay, showError,
    fileInput, navigationOperation,
  } = options;
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteRetryUrl, setRemoteRetryUrl] = useState<string>();
  const embeddedLocalSourceUrl = useRef<string | undefined>(undefined);

  const openImported = useCallback(async (
    imported: ImportedDocument,
    fragment?: string,
    navigationMode: NavigationIntent = 'push',
    existingSessionId?: string,
    operationSignal?: AbortSignal,
  ) => {
    const signal = operationSignal ?? navigationOperation.begin();
    if (signal.aborted) return;
    const opened = await controller.openImported(imported, signal, existingSessionId);
    if (signal.aborted) return;
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
  }, [controller, dispatchSession, navigation, navigationOperation, queueDocumentNavigation, setSidebarMode, showError]);

  const openWorkspaceFile = useCallback(async (
    file: WorkspaceFile,
    currentWorkspace?: WorkspaceSnapshot,
    fragment?: string,
    navigationMode: NavigationIntent = 'push',
    operationSignal?: AbortSignal,
  ) => {
    const signal = operationSignal ?? navigationOperation.begin();
    if (signal.aborted) return;
    const targetWorkspace = currentWorkspace ?? (session.kind === 'workspace' ? session.workspace : undefined);
    if (!targetWorkspace) throw new Error('A workspace is required to open a workspace file.');
    const snapshot = await controller.openWorkspaceFile(targetWorkspace, file, signal);
    if (signal.aborted) return;
    if (snapshot.metadata.lastModified === undefined || snapshot.metadata.size === undefined) {
      throw new Error('A local file snapshot requires modification metadata.');
    }
    if (targetWorkspace.id) {
      await recordRecent({
        id: `workspace-file:${targetWorkspace.id}:${file.path}`,
        title: file.name,
        kind: 'workspace-file',
        workspaceId: targetWorkspace.id,
        filePath: file.path,
      }, signal);
      if (signal.aborted) return;
      await updateRecentWorkspaceDocument(targetWorkspace.id, file.path, signal);
      if (signal.aborted) return;
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
  }, [
    controller, dispatchSession, navigation, navigationOperation, queueDocumentNavigation,
    recordRecent, session, showError, updateRecentWorkspaceDocument,
  ]);

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
    operationSignal?: AbortSignal,
    rememberResource = false,
  ) => {
    const signal = operationSignal ?? navigationOperation.begin();
    if (signal.aborted) return;
    if (!handle.name.match(/\.(md|markdown|mdx)$/i)) {
      showError({ code: 'file-type-invalid', retryable: false });
      return;
    }
    const fileId = await controller.saveFile(handle, existingId);
    if (signal.aborted) return;
    const file: WorkspaceFile = { id: `file:${fileId}`, name: handle.name, path: handle.name, depth: 0, handle };
    const snapshot = await controller.openLocalFile(file, signal);
    if (signal.aborted) return;
    if (snapshot.metadata.lastModified === undefined || snapshot.metadata.size === undefined) {
      throw new Error('A local file snapshot requires modification metadata.');
    }
    await recordRecent({ id: `local-file:${fileId}`, title: handle.name, kind: 'local-file', fileId }, signal);
    if (signal.aborted) return;
    if (rememberResource) {
      await rememberRecentResource({
        id: `local-file:${fileId}`,
        title: handle.name,
        kind: 'local-file',
        fileId,
      }, signal);
      if (signal.aborted) return;
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
    queueDocumentNavigation(fragment);
  }, [
    closeOverlay, controller, dispatchSession, navigation, navigationOperation, queueDocumentNavigation,
    recordRecent, rememberRecentResource, setSidebarMode, showError,
  ]);

  const openDroppedFile = useCallback(async (file: File, operationSignal?: AbortSignal) => {
    const signal = operationSignal ?? navigationOperation.begin();
    if (signal.aborted) return;
    if (!file.name.match(/\.(md|markdown|mdx)$/i)) {
      showError({ code: 'file-type-invalid', retryable: false });
      return;
    }
    const markdown = await file.text();
    if (signal.aborted) return;
    await openImported({ title: file.name, markdown }, undefined, 'push', undefined, signal);
    if (signal.aborted) return;
    closeOverlay();
  }, [closeOverlay, navigationOperation, openImported, showError]);

  const openFilePicker = useCallback(async () => {
    const signal = navigationOperation.begin();
    if (!('showOpenFilePicker' in window)) {
      fileInput.current?.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdx'] } }],
      });
      if (handle && !signal.aborted) {
        await openLocalHandle(handle, undefined, undefined, 'push', signal, true);
      }
    } catch (caught) {
      if (signal.aborted) return;
      if ((caught as DOMException).name !== 'AbortError') {
        showError(toReaderError(caught, 'file-read-failed'));
      }
    }
  }, [fileInput, navigationOperation, openLocalHandle, showError]);

  const openRemote = useCallback(async (
    value: string,
    requestPermission = true,
    navigationMode: NavigationIntent = 'push',
    targetFragment?: string,
    operationSignal?: AbortSignal,
    rememberResource = true,
  ) => {
    const signal = operationSignal ?? navigationOperation.begin();
    if (signal.aborted) return;
    if (!isRemoteUrl(value)) {
      setRemoteLoading(false);
      showError({ code: 'invalid-url', retryable: false });
      setRemoteRetryUrl(undefined);
      return;
    }
    const stopLoading = () => setRemoteLoading(false);
    signal.addEventListener('abort', stopLoading, { once: true });
    showError(undefined);
    setRemoteRetryUrl(undefined);
    setRemoteLoading(true);
    try {
      if (requestPermission) {
        const granted = await controller.requestRemoteOrigin(value);
        if (signal.aborted) return;
        if (!granted) {
          showError({ code: 'permission-denied', retryable: true });
          return;
        }
      }
      const snapshot = await controller.openRemote(value, signal);
      if (signal.aborted) return;
      if (!snapshot.remoteState) throw new Error('A remote document snapshot requires refresh state.');
      const document = {
        title: snapshot.title,
        markdown: snapshot.markdown,
        sourceUrl: snapshot.metadata.sourceUrl,
      };
      const documentUrl = new URL(snapshot.remoteState.url);
      documentUrl.hash = '';
      await recordRecent({
        id: `remote:${documentUrl.href}`,
        title: snapshot.title,
        kind: 'remote',
        url: documentUrl.href,
      }, signal);
      if (signal.aborted) return;
      if (rememberResource) {
        const resourceUrl = normalizeRecentRemoteUrl(documentUrl.href);
        await rememberRecentResource({
          id: `remote:${resourceUrl}`,
          title: snapshot.title,
          kind: 'remote',
          url: resourceUrl,
        }, signal);
        if (signal.aborted) return;
      }
      dispatchSession({ type: 'replace', session: createRemoteSession(document, snapshot.remoteState) });
      const fragment = targetFragment ?? linkFragment(value);
      if (navigationMode !== 'traverse') navigation.record({
        document: { kind: 'remote', url: documentUrl.href }, fragment,
      }, navigationMode);
      queueDocumentNavigation(fragment);
      setSidebarMode((current) => current === 'files' ? null : current);
      scrollTo({ top: 0 });
      closeOverlay();
    } catch (caught) {
      if (signal.aborted) return;
      if (caught instanceof RemoteDocumentError && caught.code === 'cancelled') return;
      const readerError = toReaderError(caught, 'remote-network-error');
      showError(readerError);
      if (readerError.retryable) setRemoteRetryUrl(value);
    } finally {
      signal.removeEventListener('abort', stopLoading);
      if (!signal.aborted) setRemoteLoading(false);
    }
  }, [
    closeOverlay, controller, dispatchSession, navigation, navigationOperation, queueDocumentNavigation,
    recordRecent, rememberRecentResource, setSidebarMode, showError,
  ]);

  const cancelRemoteLoad = useCallback(() => {
    navigationOperation.cancel();
    setRemoteLoading(false);
    closeOverlay();
  }, [closeOverlay, navigationOperation]);

  const handleArticleClick = (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const raw = anchor.getAttribute('href');
    if (!raw) return;
    const resolution = controller.resolveLink(raw);
    if (resolution.type === 'fragment') {
      if (!resolution.fragment) return;
      event.preventDefault();
      navigationOperation.begin();
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
      void openRemote(resolution.url, true, 'push', undefined, undefined, false);
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
    cancelRemoteLoad,
    handleArticleClick,
    handlePaste,
    remoteLoading,
    remoteRetryUrl,
    clearRemoteRetry: () => setRemoteRetryUrl(undefined),
  };
}
