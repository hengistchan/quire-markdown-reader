import { describe, expect, it } from 'vitest';
import {
  createLocalMarkdownImport, isLocalMarkdownUrl, isOpenLocalMarkdownMessage,
  localMarkdownTitle, OPEN_LOCAL_MARKDOWN,
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
});
