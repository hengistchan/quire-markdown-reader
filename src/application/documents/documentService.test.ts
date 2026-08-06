import { describe, expect, it, vi } from 'vitest';
import type { DocumentSourceAdapter } from '../documentSources';
import { DocumentService } from './documentService';

function source(title: string, dispose = vi.fn()): DocumentSourceAdapter {
  return {
    kind: 'imported',
    load: vi.fn(async () => ({ title, markdown: `# ${title}` })),
    dispose,
  };
}

describe('DocumentService source lifecycle', () => {
  it('disposes the old source and all of its resources before opening another source', async () => {
    const revoked: string[] = [];
    const objectUrls = ['blob:first', 'blob:second'];
    const first = source('First', vi.fn(() => {
      for (const url of objectUrls) revoked.push(url);
    }));
    const second = source('Second');
    const service = new DocumentService();

    await service.open(first);
    await service.open(second);

    expect(revoked).toEqual(objectUrls);
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();

    service.dispose();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('aborts an in-flight load when the service is disposed', async () => {
    let observedSignal: AbortSignal | undefined;
    const pending = source('Pending');
    pending.load = vi.fn((signal?: AbortSignal) => {
      observedSignal = signal;
      return new Promise<never>(() => undefined);
    });
    const service = new DocumentService();

    void service.open(pending);
    service.dispose();

    expect(observedSignal?.aborted).toBe(true);
    expect(pending.dispose).toHaveBeenCalledOnce();
  });
});
