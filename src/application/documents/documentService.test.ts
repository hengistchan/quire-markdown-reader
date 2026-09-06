import { describe, expect, it, vi } from 'vitest';
import type { DocumentRefreshResult, DocumentSnapshot, DocumentSource } from './documentSource';
import { DocumentService } from './documentService';

function source(title: string, dispose = vi.fn()): DocumentSource {
  const identity = { sourceKind: 'imported' as const, stableId: title, displayName: title };
  return {
    identity,
    load: vi.fn(async () => ({ identity, title, markdown: `# ${title}`, format: 'markdown' as const, metadata: {} })),
    refresh: vi.fn(async (snapshot) => ({ changed: false as const, snapshot })),
    resolveAsset: vi.fn(async () => ({ type: 'unavailable' as const, reason: 'unsupported' })),
    resolveLink: vi.fn(() => ({ type: 'invalid' as const })),
    dispose,
  };
}

describe('DocumentService source lifecycle', () => {
  it('disposes the old source and all of its resources before opening another source', async () => {
    const revoked: string[] = [];
    const objectUrls = ['blob:first', 'blob:second'];
    const first = source(
      'First',
      vi.fn(() => {
        for (const url of objectUrls) revoked.push(url);
      }),
    );
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

  it('rejects a cancelled load even when the source ignores the abort signal', async () => {
    let finish: ((value: DocumentSnapshot) => void) | undefined;
    const pending = source('Pending');
    pending.load = vi.fn(
      () =>
        new Promise<DocumentSnapshot>((resolve) => {
          finish = resolve;
        }),
    );
    const service = new DocumentService();
    const operation = new AbortController();

    const opening = service.open(pending, operation.signal);
    operation.abort(new DOMException('Superseded', 'AbortError'));
    finish?.({
      identity: pending.identity,
      title: 'Pending',
      markdown: '# Pending',
      format: 'markdown',
      metadata: {},
    });

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(pending.dispose).toHaveBeenCalledOnce();
  });

  it('ignores a refresh result after navigation replaces its source', async () => {
    let finish: ((value: DocumentRefreshResult) => void) | undefined;
    const first = source('First');
    first.refresh = vi.fn(
      () =>
        new Promise<DocumentRefreshResult>((resolve) => {
          finish = resolve;
        }),
    );
    const second = source('Second');
    const service = new DocumentService();
    const firstSnapshot = await service.open(first);

    const refreshing = service.refresh();
    await service.open(second);
    finish?.({ changed: true, snapshot: { ...firstSnapshot, markdown: '# Refreshed First' } });

    await expect(refreshing).resolves.toBeUndefined();
    expect(service.resolveLink('anything')).toEqual({ type: 'invalid' });
    expect(second.resolveLink).toHaveBeenCalledWith('anything');
  });
});
