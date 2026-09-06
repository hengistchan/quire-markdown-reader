import { describe, expect, it } from 'vitest';
import { renderMarkdownDocument } from '../core/markdown';
import { searchMarkdown } from '../core/search';
import { defaultSettings } from '../shared/defaultSettings';
import { headingDocument, markdownByBytes, PERFORMANCE_FIXTURE_SIZES } from './fixtures';

describe('architecture performance fixtures', () => {
  it('keeps the 5 MB command-search fixture deterministic and searchable', () => {
    const startedAt = performance.now();
    const source = markdownByBytes(PERFORMANCE_FIXTURE_SIZES.largeMarkdownBytes);
    expect(new Blob([source]).size).toBe(PERFORMANCE_FIXTURE_SIZES.largeMarkdownBytes);
    expect(searchMarkdown(source, 'performance-target', 8)).toHaveLength(8);
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it('collects 1000 headings in the renderer token pass', () => {
    const startedAt = performance.now();
    const rendered = renderMarkdownDocument(headingDocument(), defaultSettings);
    expect(rendered.headings).toHaveLength(PERFORMANCE_FIXTURE_SIZES.headings);
    expect(rendered.headings.at(-1)).toMatchObject({ id: 'heading-1000', sourceLine: 3997 });
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});
