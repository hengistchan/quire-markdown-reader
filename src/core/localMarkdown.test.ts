import { describe, expect, it } from 'vitest';
import {
  createLocalMarkdownImport, isLocalMarkdownUrl, isNavigateLocalMarkdownWorkspaceMessage,
  isOpenLocalMarkdownMessage, isOpenLocalMarkdownResponse, isReadLocalMarkdownAssetMessage,
  isSelectLocalMarkdownWorkspaceFileMessage, localMarkdownPathWithinDirectory, localMarkdownTitle,
  localMarkdownWorkspaceFileUrl, localMarkdownWorkspaceHash, localMarkdownWorkspaceRoute,
  NAVIGATE_LOCAL_MARKDOWN_WORKSPACE, OPEN_LOCAL_MARKDOWN, READ_LOCAL_MARKDOWN_ASSET,
  SELECT_LOCAL_MARKDOWN_WORKSPACE_FILE,
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

  it('resolves iframe workspace routes without crossing the selected local folder', () => {
    expect(localMarkdownWorkspaceFileUrl(
      'file:///Users/example/work/mihomo/README.md',
      'mihomo',
      'docs/guide.md',
    )).toBe('file:///Users/example/work/mihomo/docs/guide.md');
    expect(localMarkdownWorkspaceFileUrl(
      'file:///Users/example/work/mihomo/docs/current.md',
      'mihomo',
      'notes/设计.md',
    )).toBe('file:///Users/example/work/mihomo/notes/%E8%AE%BE%E8%AE%A1.md');
    expect(localMarkdownWorkspaceFileUrl(
      'file:///Users/example/work/mihomo/README.md',
      'mihomo',
      '../outside.md',
    )).toBeUndefined();
    expect(localMarkdownWorkspaceFileUrl(
      'file:///Users/example/work/mihomo/README.md',
      'other',
      'guide.md',
    )).toBeUndefined();
  });

  it('round-trips safe workspace state through the top-page hash route', () => {
    const route = { workspaceName: '示例库', filePath: 'docs/指南.md' };
    const hash = localMarkdownWorkspaceHash(route);
    expect(hash).toBe('quire-workspace=%E7%A4%BA%E4%BE%8B%E5%BA%93&quire-file=docs%2F%E6%8C%87%E5%8D%97.md');
    expect(localMarkdownWorkspaceRoute(`file:///tmp/README.md#${hash}`)).toEqual(route);
    expect(localMarkdownWorkspaceRoute('file:///tmp/README.md#quire-workspace=docs&quire-file=../private.md')).toBeUndefined();
  });

  it('validates workspace navigation messages in both directions', () => {
    expect(isNavigateLocalMarkdownWorkspaceMessage({
      type: NAVIGATE_LOCAL_MARKDOWN_WORKSPACE,
      workspaceName: 'mihomo',
      filePath: 'docs/guide.md',
    })).toBe(true);
    expect(isNavigateLocalMarkdownWorkspaceMessage({
      type: NAVIGATE_LOCAL_MARKDOWN_WORKSPACE,
      workspaceName: '../mihomo',
      filePath: 'docs/guide.md',
    })).toBe(false);
    expect(isSelectLocalMarkdownWorkspaceFileMessage({
      type: SELECT_LOCAL_MARKDOWN_WORKSPACE_FILE,
      filePath: 'README.md',
    })).toBe(true);
    expect(isSelectLocalMarkdownWorkspaceFileMessage({
      type: SELECT_LOCAL_MARKDOWN_WORKSPACE_FILE,
      filePath: '../README.md',
    })).toBe(false);
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
