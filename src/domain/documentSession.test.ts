import { describe, expect, it } from 'vitest';
import {
  createImportedSession, createRemoteSession, createWelcomeSession, documentSessionReducer,
  documentSourceUrl,
} from './documentSession';

describe('DocumentSession', () => {
  it('creates one source-specific state without unrelated optional fields', () => {
    const imported = createImportedSession({ title: 'Guide.md', markdown: '# Guide', sourceUrl: 'file:///docs/Guide.md' });
    expect(imported).toEqual({ kind: 'imported', title: 'Guide', markdown: '# Guide', sourceUrl: 'file:///docs/Guide.md' });
    expect(documentSourceUrl(imported)).toBe('file:///docs/Guide.md');

    const remote = createRemoteSession(
      { title: 'Remote.md', markdown: '# Remote' },
      { url: 'https://example.com/Remote.md', etag: 'v1' },
    );
    expect(remote.kind).toBe('remote');
    expect(documentSourceUrl(remote)).toBe('https://example.com/Remote.md');
  });

  it('applies refresh events only to compatible session kinds', () => {
    const welcome = createWelcomeSession('Welcome', '# Welcome');
    expect(documentSessionReducer(welcome, {
      type: 'refresh-remote', document: { title: 'Wrong.md', markdown: '# Wrong' }, state: { url: 'https://example.com' },
    })).toBe(welcome);
    expect(documentSessionReducer(welcome, {
      type: 'localize-welcome', title: '欢迎', markdown: '# 欢迎',
    })).toEqual({ kind: 'welcome', title: '欢迎', markdown: '# 欢迎' });
  });

  it('updates remote content and validators atomically', () => {
    const remote = createRemoteSession({ title: 'Old.md', markdown: '# Old' }, { url: 'https://example.com/doc.md', etag: 'v1' });
    expect(documentSessionReducer(remote, {
      type: 'refresh-remote',
      document: { title: 'New.md', markdown: '# New' },
      state: { url: 'https://example.com/doc.md', etag: 'v2' },
    })).toEqual({ kind: 'remote', title: 'New', markdown: '# New', state: { url: 'https://example.com/doc.md', etag: 'v2' } });
  });
});
