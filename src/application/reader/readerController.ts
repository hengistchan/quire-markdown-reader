import type { DocumentRefreshResult, DocumentSourceFactory, LinkResolution } from '../documents/documentSource';
import type { ResolvedAsset } from '../documents/documentResource';
import type { DocumentService } from '../documents/documentService';
import type { ImportedDocumentRegistry } from '../documents/importedDocumentRegistry';
import type { NavigationTarget } from '../../domain/navigation/navigationTarget';
import type {
  NavigationController, NavigationListener, NavigationSnapshot,
} from '../navigation/navigationController';
import type { PersistedFileHandle, PersistedWorkspaceHandle } from '../ports/handleRepository';
import type { HandleRepository } from '../ports/handleRepository';
import type { HandoffRepository } from '../ports/handoffRepository';
import type { RecentItem, RecentItemInput, RecentRepository } from '../ports/recentRepository';
import type { SettingsRepository } from '../ports/settingsRepository';
import type { PermissionGateway } from '../ports/permissionGateway';
import type { WorkspaceGateway } from '../ports/workspaceGateway';
import type { Disposable, RefreshScheduler, RefreshTask } from '../refresh/refreshScheduler';
import type {
  ImportedDocument, ReaderSettings, WorkspaceFile, WorkspaceSnapshot,
} from '../../shared/types';

export interface ReaderInitialization {
  settings: ReaderSettings;
  handoff?: ImportedDocument;
  recent: RecentItem[];
}

export interface ReaderControllerDependencies {
  documentSourceFactory: DocumentSourceFactory;
  documentService: DocumentService;
  importedDocumentRegistry: ImportedDocumentRegistry;
  settingsRepository: SettingsRepository;
  recentRepository: RecentRepository;
  handleRepository: HandleRepository;
  handoffRepository: HandoffRepository;
  navigationController: NavigationController;
  refreshScheduler: RefreshScheduler;
  permissionGateway: PermissionGateway;
  initialHandoffId?: string;
  workspaceGateway: WorkspaceGateway;
}

export class ReaderController {
  constructor(private readonly dependencies: ReaderControllerDependencies) {}

  async initialize(): Promise<ReaderInitialization> {
    const [settings, handoff, recent] = await Promise.all([
      this.dependencies.settingsRepository.load(),
      this.dependencies.initialHandoffId
        ? this.dependencies.handoffRepository.take(this.dependencies.initialHandoffId)
        : Promise.resolve(undefined),
      this.dependencies.recentRepository.list(),
    ]);
    return { settings, handoff, recent };
  }

  saveSettings(settings: ReaderSettings): Promise<void> {
    return this.dependencies.settingsRepository.save(settings);
  }

  rememberRecent(item: RecentItemInput): Promise<RecentItem[]> {
    return this.dependencies.recentRepository.put(item);
  }

  updateRecentPosition(id: string, position: number, headingId?: string): Promise<RecentItem[]> {
    return this.dependencies.recentRepository.updatePosition(id, position, headingId);
  }

  saveWorkspace(handle: FileSystemDirectoryHandle, id?: string): Promise<string> {
    return this.dependencies.handleRepository.saveWorkspace(handle, id);
  }

  saveFile(handle: FileSystemFileHandle, id?: string): Promise<string> {
    return this.dependencies.handleRepository.saveFile(handle, id);
  }

  getWorkspace(id: string): Promise<PersistedWorkspaceHandle | undefined> {
    return this.dependencies.handleRepository.getWorkspace(id);
  }

  getActiveWorkspace(): Promise<PersistedWorkspaceHandle | undefined> {
    return this.dependencies.handleRepository.getActiveWorkspace();
  }

  getFile(id: string): Promise<PersistedFileHandle | undefined> {
    return this.dependencies.handleRepository.getFile(id);
  }

  requestRemoteOrigin(url: string): Promise<boolean> {
    return this.dependencies.permissionGateway.requestRemoteOrigin(url);
  }

  hasRemoteOrigin(url: string): Promise<boolean> {
    return this.dependencies.permissionGateway.hasRemoteOrigin(url);
  }

  queryRead(handle: FileSystemHandle): Promise<PermissionState> {
    return this.dependencies.permissionGateway.queryRead(handle);
  }

  requestRead(handle: FileSystemHandle): Promise<PermissionState> {
    return this.dependencies.permissionGateway.requestRead(handle);
  }

  scanWorkspace(handle: FileSystemDirectoryHandle, signal?: AbortSignal, workspaceId?: string) {
    return this.dependencies.workspaceGateway.scan(handle, { signal, workspaceId });
  }

  createTransientWorkspace(files: Iterable<File>): FileSystemDirectoryHandle | undefined {
    return this.dependencies.workspaceGateway.createTransient(files);
  }

  async openImported(document: ImportedDocument, signal?: AbortSignal, existingSessionId?: string) {
    const snapshot = await this.dependencies.documentService.open(
      this.dependencies.documentSourceFactory.createImported(document),
      signal,
    );
    if (signal?.aborted) throw signal.reason;
    const sessionId = this.dependencies.importedDocumentRegistry.put(document, existingSessionId);
    return { sessionId, snapshot };
  }

  async restoreImported(sessionId: string, signal?: AbortSignal) {
    const document = this.dependencies.importedDocumentRegistry.get(sessionId);
    if (!document) return undefined;
    const result = await this.openImported(document, signal, sessionId);
    return { document, snapshot: result.snapshot };
  }

  getImported(sessionId: string): ImportedDocument | undefined {
    return this.dependencies.importedDocumentRegistry.get(sessionId);
  }

  openLocalFile(file: WorkspaceFile, signal?: AbortSignal) {
    return this.dependencies.documentService.open(this.dependencies.documentSourceFactory.createLocalFile(file), signal);
  }

  openWorkspaceFile(workspace: WorkspaceSnapshot, file: WorkspaceFile, signal?: AbortSignal) {
    return this.dependencies.documentService.open(this.dependencies.documentSourceFactory.createWorkspaceFile(workspace, file), signal);
  }

  openRemote(url: string, signal?: AbortSignal) {
    return this.dependencies.documentService.open(this.dependencies.documentSourceFactory.createRemote(url), signal);
  }

  refresh(signal?: AbortSignal): Promise<DocumentRefreshResult | undefined> {
    return this.dependencies.documentService.refresh(signal);
  }

  resolveAsset(href: string, signal?: AbortSignal): Promise<ResolvedAsset> {
    return this.dependencies.documentService.resolveAsset(href, signal);
  }

  resolveLink(href: string): LinkResolution {
    return this.dependencies.documentService.resolveLink(href);
  }

  start(task: RefreshTask): Disposable {
    return this.dependencies.refreshScheduler.start(task);
  }

  push(target: NavigationTarget): void { this.dependencies.navigationController.push(target); }
  replace(target: NavigationTarget): void { this.dependencies.navigationController.replace(target); }
  current(): NavigationSnapshot { return this.dependencies.navigationController.current(); }
  pushFragment(fragment?: string): void { this.dependencies.navigationController.pushFragment(fragment); }
  back(): void { this.dependencies.navigationController.back(); }
  forward(): void { this.dependencies.navigationController.forward(); }
  subscribe(listener: NavigationListener): () => void {
    return this.dependencies.navigationController.subscribe(listener);
  }

  dispose(): void {
    this.dependencies.documentService.dispose();
    this.dependencies.importedDocumentRegistry.clear();
  }
}
