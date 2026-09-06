import { describe, expect, it } from 'vitest';
import {
  hostPermissionPattern,
  isMarkdownLink,
  isRelativeUrl,
  isRemoteUrl,
  linkFragment,
  resolveWorkspacePath,
} from './paths';

describe('URL classification', () => {
  it.each(['https://example.com/readme.md', 'http://localhost:4173/guide'])('accepts remote URL %s', (value) => {
    expect(isRemoteUrl(value)).toBe(true);
  });

  it.each(['file:///tmp/readme.md', 'javascript:alert(1)', '/guide.md', 'not a url'])(
    'rejects remote URL %s',
    (value) => {
      expect(isRemoteUrl(value)).toBe(false);
    },
  );

  it.each(['guide.md', '../guide.md', '/root.md'])('recognizes relative workspace URL %s', (value) => {
    expect(isRelativeUrl(value)).toBe(true);
  });

  it.each(['https://example.com/a.md', '//example.com/a.md', '#chapter'])('rejects non-relative URL %s', (value) => {
    expect(isRelativeUrl(value)).toBe(false);
  });

  it.each(['guide.md', 'guide.MARKDOWN#intro', '../notes.mdx?raw=1'])('recognizes Markdown link %s', (value) => {
    expect(isMarkdownLink(value)).toBe(true);
  });
});

describe('linkFragment', () => {
  it('decodes fragments for document heading navigation', () => {
    expect(linkFragment('guide.md#section-16')).toBe('section-16');
    expect(linkFragment('../guide.md#%E7%AB%A0%E8%8A%82')).toBe('章节');
  });

  it('rejects absent, empty, or malformed fragments', () => {
    expect(linkFragment('guide.md')).toBeUndefined();
    expect(linkFragment('guide.md#')).toBeUndefined();
    expect(linkFragment('guide.md#%ZZ')).toBeUndefined();
  });
});

describe('resolveWorkspacePath', () => {
  it('resolves sibling, parent, root, encoded, query, and fragment paths', () => {
    expect(resolveWorkspacePath('docs/start/readme.md', 'next.md')).toBe('docs/start/next.md');
    expect(resolveWorkspacePath('docs/start/readme.md', '../guide.md#intro')).toBe('docs/guide.md');
    expect(resolveWorkspacePath('docs/start/readme.md', '/README.md?plain=1')).toBe('README.md');
    expect(resolveWorkspacePath('docs/start/readme.md', './hello%20world.md')).toBe('docs/start/hello world.md');
  });

  it('does not escape the workspace or accept malformed paths', () => {
    expect(resolveWorkspacePath('README.md', '../secret.md')).toBeUndefined();
    expect(resolveWorkspacePath('docs/readme.md', 'bad%ZZ.md')).toBeUndefined();
    expect(resolveWorkspacePath('docs/readme.md', 'nested%2Fsecret.md')).toBeUndefined();
    expect(resolveWorkspacePath('docs/readme.md', '#intro')).toBeUndefined();
    expect(resolveWorkspacePath('docs/readme.md', 'https://example.com/a.md')).toBeUndefined();
  });
});

describe('hostPermissionPattern', () => {
  it('limits permission to the selected origin', () => {
    expect(hostPermissionPattern('https://example.com/docs/readme.md')).toBe('https://example.com/*');
    expect(hostPermissionPattern('http://localhost:4173/readme.md')).toBe('http://localhost:4173/*');
  });

  it('rejects protocols the reader does not fetch', () => {
    expect(() => hostPermissionPattern('file:///tmp/readme.md')).toThrow('Only HTTP and HTTPS');
  });
});
