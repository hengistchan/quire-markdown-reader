import { describe, expect, it } from 'vitest';
import { searchMarkdown } from './search';

describe('searchMarkdown', () => {
  it('returns structured matches with source positions and heading context', () => {
    const source = '# Overview\n\nIntro text.\n\n## Details\n\nFind the needle here.\nNeedle appears again.';
    expect(searchMarkdown(source, 'needle')).toEqual([
      expect.objectContaining({ id: '7:9', text: 'Find the needle here.', headingId: 'details', blockIndex: 3, startOffset: 46, lineNumber: 7 }),
      expect.objectContaining({ id: '8:0', text: 'Needle appears again.', headingId: 'details', blockIndex: 3, lineNumber: 8 }),
    ]);
  });

  it('is case-insensitive, strips common Markdown decoration, and respects its limit', () => {
    const results = searchMarkdown('## Search title\n\n- [Search link](guide.md)\n\n`search`', 'SEARCH', 2);
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.text)).toEqual(['Search title', 'Search link']);
  });

  it('returns no result for an empty query or non-positive limit', () => {
    expect(searchMarkdown('# Hello', '  ')).toEqual([]);
    expect(searchMarkdown('# Hello', 'hello', 0)).toEqual([]);
  });
});
