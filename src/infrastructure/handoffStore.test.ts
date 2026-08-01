import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupExpiredDocumentHandoffs, createDocumentHandoff, DOCUMENT_HANDOFF_TTL_MS,
  takeDocumentHandoff,
} from './handoffStore';

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('quire-document-handoffs');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe('document handoff storage', () => {
  beforeEach(deleteDatabase);

  it('keeps simultaneous documents isolated by handoff ID', async () => {
    const first = { title: 'A', markdown: '# A' };
    const second = { title: 'B', markdown: '# B' };
    await Promise.all([
      createDocumentHandoff(first, { id: 'handoff-a', now: 1 }),
      createDocumentHandoff(second, { id: 'handoff-b', now: 1 }),
    ]);

    await expect(Promise.all([
      takeDocumentHandoff('handoff-a', 2),
      takeDocumentHandoff('handoff-b', 2),
    ])).resolves.toEqual([first, second]);
  });

  it('atomically returns a handoff only once', async () => {
    const document = { title: 'Once', markdown: '# Once' };
    await createDocumentHandoff(document, { id: 'single-use', now: 1 });
    const results = await Promise.all([
      takeDocumentHandoff('single-use', 2),
      takeDocumentHandoff('single-use', 2),
    ]);

    expect(results.filter(Boolean)).toEqual([document]);
    await expect(takeDocumentHandoff('single-use', 2)).resolves.toBeUndefined();
  });

  it('rejects and removes expired handoffs', async () => {
    await createDocumentHandoff({ title: 'Old', markdown: '# Old' }, { id: 'old', now: 1 });
    await expect(takeDocumentHandoff('old', 1 + DOCUMENT_HANDOFF_TTL_MS)).resolves.toBeUndefined();
    await expect(takeDocumentHandoff('old', 2)).resolves.toBeUndefined();
  });

  it('purges abandoned handoffs during cleanup', async () => {
    await createDocumentHandoff({ title: 'Old', markdown: '# Old' }, { id: 'old', now: 1 });
    await cleanupExpiredDocumentHandoffs(1 + DOCUMENT_HANDOFF_TTL_MS);
    await expect(takeDocumentHandoff('old', 2)).resolves.toBeUndefined();
  });
});
