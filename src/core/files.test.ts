import { describe, expect, it } from 'vitest';
import { isMarkdownFile } from './files';

describe('isMarkdownFile', () => {
  it.each(['README.md', 'guide.markdown', 'notes.MDX'])('accepts %s', (name) => {
    expect(isMarkdownFile(name)).toBe(true);
  });

  it.each(['image.png', 'notes.txt', '.md-cache'])('rejects %s', (name) => {
    expect(isMarkdownFile(name)).toBe(false);
  });
});
