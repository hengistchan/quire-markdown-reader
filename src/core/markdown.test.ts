import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';
import { defaultSettings } from '../shared/settings';

describe('renderMarkdown', () => {
  it('renders headings, task lists, and anchored outline targets', () => {
    const html = renderMarkdown('# Hello world\n\n- [x] Read it', defaultSettings);
    expect(html).toContain('id="hello-world"');
    expect(html).toContain('task-list-item');
    expect(html).toContain('checked');
  });

  it('sanitizes scripts even when raw HTML is enabled', () => {
    const html = renderMarkdown('<script>alert(1)</script><p onclick="bad()">Safe</p>', {
      ...defaultSettings,
      enableHtml: true,
    });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).toContain('Safe');
  });

  it('marks Mermaid fences without exposing their source as HTML', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```', defaultSettings);
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('data-mermaid-source');
    expect(html).not.toContain('<script>');
  });

  it('renders KaTeX expressions when enabled', () => {
    const html = renderMarkdown('The answer is $x^2$.', defaultSettings);
    expect(html).toContain('katex');
  });

  it('opens links without exposing the viewer tab', () => {
    const html = renderMarkdown('[Example](https://example.com)', defaultSettings);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
