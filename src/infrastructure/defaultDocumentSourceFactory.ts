import type { DocumentSource, DocumentSourceFactory } from '../application/documents/documentSource';
import type { ImportedDocument, WorkspaceFile, WorkspaceSnapshot } from '../shared/types';
import { ImportedDocumentSource } from './browser/importedDocumentSource';
import { FileDocumentSource } from './filesystem/fileDocumentSource';
import { RemoteDocumentSource } from './http/remoteDocumentSource';

export class DefaultDocumentSourceFactory implements DocumentSourceFactory {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  createImported(document: ImportedDocument): DocumentSource {
    return new ImportedDocumentSource(document);
  }

  createLocalFile(file: WorkspaceFile): DocumentSource {
    return new FileDocumentSource(file);
  }

  createWorkspaceFile(workspace: WorkspaceSnapshot, file: WorkspaceFile): DocumentSource {
    return new FileDocumentSource(file, workspace);
  }

  createRemote(url: string): DocumentSource {
    return new RemoteDocumentSource(url, this.fetcher);
  }
}
