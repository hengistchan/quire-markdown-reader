import { describe, expect, it } from 'vitest';
import {
  getMarkdownRenderer,
  loadMarkdownFeatureRuntime,
  renderMarkdown,
  renderMarkdownDocument,
  renderPlainText,
} from './markdown';
import { defaultSettings } from '../shared/defaultSettings';

describe('renderMarkdown', () => {
  it('renders headings, task lists, and anchored outline targets', () => {
    const html = renderMarkdown('# Hello world\n\n- [x] Read it', defaultSettings);
    expect(html).toContain('id="hello-world"');
    expect(html).toContain('data-source-line-start="1"');
    expect(html).toContain('data-source-line-end="1"');
    expect(html).toContain('task-list-item');
    expect(html).toContain('checked');
  });

  it('collects headings and reading time from Markdown tokens without parsing rendered DOM', () => {
    const rendered = renderMarkdownDocument('# First *heading*\n\n## Second `heading`', defaultSettings);

    expect(rendered.headings).toEqual([
      { id: 'first-heading', text: 'First heading', level: 1, sourceLine: 1 },
      { id: 'second-heading', text: 'Second heading', level: 2, sourceLine: 3 },
    ]);
    expect(rendered.estimatedReadMinutes).toBe(1);
  });

  it('reuses renderer instances for the same feature combination', () => {
    expect(getMarkdownRenderer(defaultSettings)).toBe(getMarkdownRenderer({ ...defaultSettings }));
    expect(getMarkdownRenderer(defaultSettings)).not.toBe(
      getMarkdownRenderer({ ...defaultSettings, enableMermaid: false }),
    );
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

  it('renders sanitized GitHub README HTML with the default settings', () => {
    const html = renderMarkdown(
      `
<h1 align="center">
  <img src="Meta.png" alt="Meta Kennel" width="200">
  <br>Meta Kernel<br>
</h1>

<h3 align="center">Another Mihomo Kernel.</h3>
`,
      defaultSettings,
    );

    expect(html).toContain('<h1 align="center">');
    expect(html).toContain('data-resource-src="Meta.png"');
    expect(html).not.toContain(' src="Meta.png"');
    expect(html).toContain('alt="Meta Kennel"');
    expect(html).toContain('width="200"');
    expect(html).toContain('<br>Meta Kernel<br>');
    expect(html).toContain('<h3 align="center">Another Mihomo Kernel.</h3>');
  });

  it('respects an explicit preference to display raw HTML as source', () => {
    const html = renderMarkdown('<h1>Meta Kernel</h1>', { ...defaultSettings, enableHtml: false });
    expect(html).toContain('&lt;h1&gt;Meta Kernel&lt;/h1&gt;');
    expect(html).not.toContain('<h1>');
  });

  it('repairs smart-quoted raw HTML attributes and Markdown-wrapped URLs', () => {
    const html = renderMarkdown(
      `
<h1 align=“center”> <img src=“Meta.png” alt=“Meta Kennel” width=“200”> <br>Meta Kernel<br> </h1>

<h3 align=“center”>Another Mihomo Kernel.</h3>

<p align=“center”> <a href=“[Report](https://goreportcard.com/report/github.com/MetaCubeX/mihomo)”> <img src=“[Badge](https://goreportcard.com/badge/github.com/MetaCubeX/mihomo?style=flat-square)”> </a> </p>
`,
      {
        ...defaultSettings,
        enableHtml: true,
      },
    );

    expect(html).toContain('<h1 align="center">');
    expect(html).toContain('data-resource-src="Meta.png"');
    expect(html).toContain('alt="Meta Kennel"');
    expect(html).toContain('width="200"');
    expect(html).toContain('<h3 align="center">Another Mihomo Kernel.</h3>');
    expect(html).toContain('href="https://goreportcard.com/report/github.com/MetaCubeX/mihomo"');
    expect(html).toContain(
      'data-resource-src="https://goreportcard.com/badge/github.com/MetaCubeX/mihomo?style=flat-square"',
    );
    expect(html).not.toContain('[Report]');
    expect(html).not.toContain('[Badge]');
  });

  it('keeps malformed URL repairs inside the existing sanitizer boundary', () => {
    const html = renderMarkdown('<a href=“[Unsafe](javascript:alert(1))”>Unsafe</a>', {
      ...defaultSettings,
      enableHtml: true,
    });
    expect(html).toContain('<a>Unsafe</a>');
    expect(html).not.toContain('javascript:');
  });

  it('does not repair HTML examples inside code fences', () => {
    const html = renderMarkdown('```html\n<img src=“[Badge](https://example.com/badge.svg)”>\n```', {
      ...defaultSettings,
      enableHtml: true,
    });
    expect(html).toContain('“[Badge]');
    expect(html).toContain('badge.svg)”');
  });

  it('marks Mermaid fences without exposing their source as HTML', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```', defaultSettings);
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('data-mermaid-source');
    expect(html).not.toContain('<script>');
  });

  it('renders KaTeX expressions after loading the optional mathematics runtime', async () => {
    const source = 'The answer is $x^2$.';
    const runtime = await loadMarkdownFeatureRuntime(source, defaultSettings);
    const html = renderMarkdown(source, defaultSettings, runtime);
    expect(html).toContain('katex');
  });

  it('highlights fenced code after loading the optional syntax runtime', async () => {
    const source = '```ts\nconst answer = 42;\n```';
    const runtime = await loadMarkdownFeatureRuntime(source, defaultSettings);
    const html = renderMarkdown(source, defaultSettings, runtime);
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('hljs-number');
  });

  it.each([
    ['HTTPS', 'https://example.com'],
    ['protocol-relative', '//example.com/readme.md'],
    ['email', 'mailto:hello@example.com'],
  ])('opens %s links without exposing the viewer tab', (_label, href) => {
    const html = renderMarkdown(`[Example](${href})`, defaultSettings);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it.each(['#chapter', 'guide.md#intro', '../README.md', '/images/example.png'])(
    'keeps internal link %s in the viewer tab',
    (href) => {
      const html = renderMarkdown(`[Internal](${href})`, defaultSettings);
      expect(html).not.toContain('target="_blank"');
      expect(html).not.toContain('rel="noopener noreferrer"');
    },
  );

  it('marks document images for lazy asynchronous decoding', () => {
    const html = renderMarkdown('![Diagram](./diagram.png)', defaultSettings);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('data-resource-src="./diagram.png"');
    expect(html).not.toContain(' src="./diagram.png"');
  });

  it('blocks remote image URLs before sanitized HTML enters the live document', () => {
    const html = renderMarkdown('![Tracking pixel](https://example.com/pixel.png)', {
      ...defaultSettings,
      loadRemoteImages: false,
    });
    expect(html).toContain('data-resource-src="https://example.com/pixel.png"');
    expect(html).toContain('data-resource-state="blocked"');
    expect(html).not.toContain(' src="https://example.com/pixel.png"');
  });

  it('removes raw HTML media elements that could initiate uncontrolled requests', () => {
    const html = renderMarkdown(
      `
<video src="https://example.com/video.mp4" poster="https://example.com/poster.png"></video>
<svg><image href="https://example.com/pixel.png"></image></svg>
`,
      {
        ...defaultSettings,
        enableHtml: true,
        loadRemoteImages: false,
      },
    );
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<image');
    expect(html).not.toContain('example.com');
  });

  it('renders imported page text literally instead of interpreting Markdown or HTML', () => {
    const html = renderPlainText('# Heading\n* not emphasis *\n<script>alert(1)</script>');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('<em>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('# Heading');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('data-source-line-start="1"');
  });
});
