import { describe, expect, it } from 'vitest';
import { MemoryImportedDocumentRegistry } from './importedDocumentRegistry';

describe('MemoryImportedDocumentRegistry', () => {
  it('keeps imported documents recoverable within the current reader session', () => {
    const registry = new MemoryImportedDocumentRegistry();
    const document = { title: 'Pasted.md', markdown: '# Pasted' };

    const sessionId = registry.put(document, 'session-1');

    expect(sessionId).toBe('session-1');
    expect(registry.get(sessionId)).toEqual(document);
    registry.remove(sessionId);
    expect(registry.get(sessionId)).toBeUndefined();
  });

  it('clears all session-only imports', () => {
    const registry = new MemoryImportedDocumentRegistry();
    registry.put({ title: 'A.md', markdown: 'A' }, 'a');
    registry.put({ title: 'B.md', markdown: 'B' }, 'b');

    registry.clear();

    expect(registry.get('a')).toBeUndefined();
    expect(registry.get('b')).toBeUndefined();
  });
});
