import { describe, expect, it, vi } from 'vitest';
import { fetchRemoteMarkdown, RemoteMarkdownError } from './remote';

describe('fetchRemoteMarkdown', () => {
  it('loads Markdown and records validators for refresh', async () => {
    const fetcher = vi.fn(async () => new Response('# Guide', {
      status: 200,
      headers: { etag: '"v1"', 'last-modified': 'Thu, 31 Jul 2026 10:00:00 GMT' },
    }));

    const result = await fetchRemoteMarkdown('https://example.com/docs/guide.md', undefined, fetcher);

    expect(result.unchanged).toBe(false);
    expect(result.document).toMatchObject({ title: 'guide.md', markdown: '# Guide' });
    expect(result.state).toEqual({
      url: 'https://example.com/docs/guide.md',
      etag: '"v1"',
      lastModified: 'Thu, 31 Jul 2026 10:00:00 GMT',
    });
  });

  it('sends conditional headers and preserves state on 304', async () => {
    const previous = { url: 'https://example.com/readme.md', etag: '"v1"', lastModified: 'yesterday' };
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('If-None-Match')).toBe('"v1"');
      expect(headers.get('If-Modified-Since')).toBe('yesterday');
      return new Response(null, { status: 304 });
    });

    await expect(fetchRemoteMarkdown(previous.url, previous, fetcher)).resolves.toEqual({
      state: previous,
      unchanged: true,
    });
  });

  it('reports invalid URLs, server failures, and oversized files', async () => {
    await expect(fetchRemoteMarkdown('file:///tmp/readme.md')).rejects.toMatchObject({
      name: 'RemoteMarkdownError', code: 'invalid-url',
    } satisfies Partial<RemoteMarkdownError>);
    await expect(fetchRemoteMarkdown('https://example.com/missing.md', undefined, async () => new Response('', { status: 404 })))
      .rejects.toMatchObject({ name: 'RemoteMarkdownError', code: 'http-error', status: 404 } satisfies Partial<RemoteMarkdownError>);
    await expect(fetchRemoteMarkdown('https://example.com/huge.md', undefined, async () => new Response('', {
      headers: { 'content-length': String(5 * 1024 * 1024 + 1) },
    }))).rejects.toMatchObject({ name: 'RemoteMarkdownError', code: 'too-large' } satisfies Partial<RemoteMarkdownError>);
  });
});
