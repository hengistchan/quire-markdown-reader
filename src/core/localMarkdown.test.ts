import { describe, expect, it } from 'vitest';
import {
  createLocalMarkdownImport, isLocalMarkdownUrl, isOpenLocalMarkdownMessage, isOpenLocalMarkdownResponse,
  isReadLocalMarkdownAssetMessage, localMarkdownPathWithinDirectory, localMarkdownTitle,
  OPEN_LOCAL_MARKDOWN, READ_LOCAL_MARKDOWN_ASSET,
} from './localMarkdown';

describe('local Markdown address handling', () => {
  it.each([
    'file:///Users/example/README.md',
    'file:///tmp/guide.markdown',
    'file:///C:/docs/NOTES.MDX',
  ])('accepts a local Markdown URL: %s', (value) => {
    expect(isLocalMarkdownUrl(value)).toBe(true);
  });

  it.each([
    'file:///tmp/photo.png',
    'https://example.com/readme.md',
    'not a url',
  ])('ignores non-local Markdown input: %s', (value) => {
    expect(isLocalMarkdownUrl(value)).toBe(false);
  });

  it('keeps the source text and decodes the filename', () => {
    document.body.innerHTML = '<pre># Title\n\nParagraph</pre>';
    const sourceUrl = 'file:///Users/example/%E5%B7%A5%E7%A8%8B%E7%AC%94%E8%AE%B0.md';
    expect(localMarkdownTitle(sourceUrl)).toBe('工程笔记.md');
    expect(createLocalMarkdownImport(sourceUrl, document)).toEqual({
      title: '工程笔记.md',
      markdown: '# Title\n\nParagraph',
      sourceUrl,
    });
  });

  it('derives the current file path relative to a selected workspace', () => {
    const value = 'file:///Users/example/work/mihomo/docs/%E6%8C%87%E5%8D%97.md';
    expect(localMarkdownPathWithinDirectory(value, 'mihomo')).toBe('docs/指南.md');
    expect(localMarkdownPathWithinDirectory(value, 'work')).toBe('mihomo/docs/指南.md');
    expect(localMarkdownPathWithinDirectory(value, 'other')).toBeUndefined();
  });

  it('validates messages before the background page imports them', () => {
    expect(isOpenLocalMarkdownMessage({
      type: OPEN_LOCAL_MARKDOWN,
      document: { title: 'README.md', markdown: '# Readme', sourceUrl: 'file:///tmp/README.md' },
    })).toBe(true);
    expect(isOpenLocalMarkdownMessage({
      type: OPEN_LOCAL_MARKDOWN,
      document: { title: 'Page', markdown: 'text', sourceUrl: 'https://example.com' },
    })).toBe(false);
  });

  it('accepts only relative asset requests rooted at a local Markdown source', () => {
    expect(isReadLocalMarkdownAssetMessage({
      type: READ_LOCAL_MARKDOWN_ASSET,
      sourceUrl: 'file:///tmp/docs/README.md',
      href: '../Meta.png',
    })).toBe(true);
    expect(isReadLocalMarkdownAssetMessage({
      type: READ_LOCAL_MARKDOWN_ASSET,
      sourceUrl: 'file:///tmp/docs/README.md',
      href: 'https://example.com/Meta.png',
    })).toBe(false);
    expect(isReadLocalMarkdownAssetMessage({
      type: READ_LOCAL_MARKDOWN_ASSET,
      sourceUrl: 'https://example.com/README.md',
      href: 'Meta.png',
    })).toBe(false);
    expect(isReadLocalMarkdownAssetMessage({
      type: READ_LOCAL_MARKDOWN_ASSET,
      sourceUrl: 'file:///tmp/docs/README.md',
      href: 'README.md',
    })).toBe(false);
  });

  it('accepts only reader-page responses from the background', () => {
    expect(isOpenLocalMarkdownResponse({ viewerUrl: 'chrome-extension://quire/viewer.html' })).toBe(true);
    expect(isOpenLocalMarkdownResponse({ viewerUrl: 'moz-extension://quire/viewer.html' })).toBe(true);
    expect(isOpenLocalMarkdownResponse({ viewerUrl: 'https://example.com/viewer.html' })).toBe(false);
    expect(isOpenLocalMarkdownResponse({ viewerUrl: 'chrome-extension://quire/settings.html' })).toBe(false);
  });
});
