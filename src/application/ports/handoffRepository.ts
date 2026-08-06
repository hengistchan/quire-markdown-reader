import type { ImportedDocument } from '../../shared/types';

export interface HandoffRepository {
  take(id: string): Promise<ImportedDocument | undefined>;
}
