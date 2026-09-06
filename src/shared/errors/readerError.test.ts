import { describe, expect, it } from 'vitest';
import { RemoteDocumentError } from './remoteDocumentError';
import { toReaderError } from './readerError';

describe('toReaderError', () => {
  it('maps infrastructure errors into stable reader error codes', () => {
    expect(toReaderError(new RemoteDocumentError('timeout'), 'storage-failed')).toMatchObject({
      code: 'remote-timeout',
      retryable: true,
    });
    expect(toReaderError(new RemoteDocumentError('http-error', 503), 'storage-failed')).toMatchObject({
      code: 'remote-http-error',
      details: { status: 503 },
      retryable: true,
    });
    expect(toReaderError(new Error('database'), 'storage-failed')).toMatchObject({
      code: 'storage-failed',
      retryable: true,
    });
  });
});
