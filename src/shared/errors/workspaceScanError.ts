export type WorkspaceScanLimit = 'max-depth' | 'max-files' | 'max-directories' | 'max-entries';

export class WorkspaceScanError extends Error {
  constructor(public readonly code: 'cancelled' | WorkspaceScanLimit) {
    super(code);
    this.name = 'WorkspaceScanError';
  }
}
