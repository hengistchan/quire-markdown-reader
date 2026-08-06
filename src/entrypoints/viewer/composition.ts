import { NavigationController } from '../../application/navigation/navigationController';
import { ReaderController } from '../../application/reader/readerController';
import { BrowserRecentRepository } from '../../infrastructure/browser/recentRepository';
import { BrowserSettingsRepository } from '../../infrastructure/browser/settingsRepository';
import { BrowserHistoryAdapter } from '../../infrastructure/browser/browserHistoryAdapter';
import { IndexedDBHandoffRepository } from '../../infrastructure/handoffStore';
import { IndexedDBHandleRepository } from '../../infrastructure/indexeddb/handleRepository';
import { DefaultDocumentSourceFactory } from '../../infrastructure/defaultDocumentSourceFactory';
import { DocumentService } from '../../application/documents/documentService';
import { DefaultRefreshScheduler } from '../../application/refresh/refreshScheduler';
import { BrowserRefreshEnvironment } from '../../infrastructure/browser/browserRefreshEnvironment';
import { BrowserPermissionGateway } from '../../infrastructure/browser/permissionGateway';
import { FileSystemWorkspaceGateway } from '../../infrastructure/filesystem/workspaceGateway';

export function createReaderController(browserWindow: Window = window): ReaderController {
  return new ReaderController({
    navigationController: new NavigationController(new BrowserHistoryAdapter(browserWindow)),
    settingsRepository: new BrowserSettingsRepository(),
    recentRepository: new BrowserRecentRepository(),
    handleRepository: new IndexedDBHandleRepository(),
    handoffRepository: new IndexedDBHandoffRepository(),
    documentSourceFactory: new DefaultDocumentSourceFactory(),
    documentService: new DocumentService(),
    refreshScheduler: new DefaultRefreshScheduler(new BrowserRefreshEnvironment()),
    permissionGateway: new BrowserPermissionGateway(),
    initialHandoffId: new URL(browserWindow.location.href).searchParams.get('handoff') ?? undefined,
    workspaceGateway: new FileSystemWorkspaceGateway(),
  });
}
