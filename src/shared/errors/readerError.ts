import type { TranslationKey } from '../i18n';

export type ReaderErrorCode =
  | 'invalid-url'
  | 'permission-denied'
  | 'file-type-invalid'
  | 'file-read-failed'
  | 'folder-unsupported'
  | 'workspace-read-failed'
  | 'workspace-empty'
  | 'workspace-scan-limit'
  | 'linked-file-missing'
  | 'remote-timeout'
  | 'remote-network-error'
  | 'remote-http-error'
  | 'remote-too-large'
  | 'resource-unavailable'
  | 'storage-failed';

export interface ReaderError {
  code: ReaderErrorCode;
  cause?: unknown;
  details?: Record<string, string | number>;
  retryable: boolean;
}

export function readerErrorMessage(error: ReaderError, t: (key: TranslationKey) => string): string {
  switch (error.code) {
    case 'invalid-url': return t('invalidUrl');
    case 'permission-denied': return t('permissionDenied');
    case 'file-type-invalid': return t('fileTypeError');
    case 'file-read-failed': return t('fileReadError');
    case 'folder-unsupported': return t('folderUnsupported');
    case 'workspace-read-failed': return t('folderReadError');
    case 'workspace-empty': return t('noMarkdown');
    case 'workspace-scan-limit': return t('workspaceScanLimit');
    case 'linked-file-missing': return t('linkedFileMissing');
    case 'remote-timeout': return t('remoteTimeout');
    case 'remote-too-large': return t('remoteTooLarge');
    case 'remote-http-error': return `${t('remoteServerError')} ${error.details?.status ?? ''}.`;
    case 'remote-network-error': return t('remoteReadError');
    default: return t('resourceUnavailable');
  }
}
