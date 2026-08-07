import { describe, expect, it, vi } from 'vitest';
import { READ_LOCAL_MARKDOWN_ASSET } from '../../core/localMarkdown';
import { ImportedDocumentSource } from './importedDocumentSource';

describe('ImportedDocumentSource', () => {
  it('bridges local relative assets instead of exposing opaque file URLs to the viewer', async () => {
    const sendMessage = vi.fn(async () => ({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }));
    const source = new ImportedDocumentSource(
      { title: 'README.md', markdown: '![Logo](Meta.png)', sourceUrl: 'file:///Users/example/docs/README.md' },
      { sendMessage } as Pick<typeof browser.runtime, 'sendMessage'>,
    );

    await expect(source.resolveAsset('Meta.png')).resolves.toEqual({
      type: 'url', url: 'data:image/png;base64,iVBORw0KGgo=', disposable: false,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: READ_LOCAL_MARKDOWN_ASSET,
      sourceUrl: 'file:///Users/example/docs/README.md',
      href: 'Meta.png',
    });
  });

  it('marks a local asset unavailable when the bridge cannot read it', async () => {
    const source = new ImportedDocumentSource(
      { title: 'README.md', markdown: '![Missing](missing.png)', sourceUrl: 'file:///docs/README.md' },
      { sendMessage: vi.fn(async () => ({ error: 'read-failed' })) } as Pick<typeof browser.runtime, 'sendMessage'>,
    );

    await expect(source.resolveAsset('missing.png')).resolves.toEqual({
      type: 'unavailable', reason: 'file-access-unavailable',
    });
  });

  it('keeps relative web assets as ordinary URLs', async () => {
    const sendMessage = vi.fn();
    const source = new ImportedDocumentSource(
      { title: 'Guide', markdown: '', sourceUrl: 'https://example.com/docs/guide.md' },
      { sendMessage } as Pick<typeof browser.runtime, 'sendMessage'>,
    );

    await expect(source.resolveAsset('../logo.svg')).resolves.toEqual({
      type: 'url', url: 'https://example.com/logo.svg', disposable: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
