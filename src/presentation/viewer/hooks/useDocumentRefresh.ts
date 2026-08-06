import { useEffect, useRef } from 'react';
import type { DocumentRefreshResult } from '../../../application/documents/documentSource';
import type { RefreshScheduler } from '../../../application/refresh/refreshScheduler';

interface RefreshableDocument {
  refresh(signal?: AbortSignal): Promise<DocumentRefreshResult | undefined>;
}

export interface DocumentRefreshOptions {
  enabled: boolean;
  kind?: 'local' | 'remote';
  sourceKey?: string;
  service: RefreshableDocument;
  scheduler: RefreshScheduler;
  onResult(result: DocumentRefreshResult): void;
}

export function useDocumentRefresh(options: DocumentRefreshOptions): void {
  const onResult = useRef(options.onResult);
  onResult.current = options.onResult;

  useEffect(() => {
    if (!options.enabled || !options.kind || !options.sourceKey) return;
    return options.scheduler.start({
      kind: options.kind,
      async run(signal) {
        const result = await options.service.refresh(signal);
        if (result) onResult.current(result);
      },
    }).dispose;
  }, [options.enabled, options.kind, options.scheduler, options.service, options.sourceKey]);
}
