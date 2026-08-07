import { useEffect, useState } from 'react';
import type { ReaderError } from '../../../shared/errors/readerError';

export function useReaderFeedback() {
  const [error, showError] = useState<ReaderError>();
  const [notice, showNotice] = useState<string>();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => showNotice(undefined), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  return {
    error,
    notice,
    showError,
    clearError: () => showError(undefined),
    showNotice,
  };
}
