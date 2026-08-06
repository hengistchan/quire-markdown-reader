export type RemoteDocumentErrorCode =
  | 'invalid-url'
  | 'http-error'
  | 'too-large'
  | 'network-error'
  | 'timeout'
  | 'cancelled';

export class RemoteDocumentError extends Error {
  constructor(
    public readonly code: RemoteDocumentErrorCode,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'RemoteDocumentError';
  }
}
