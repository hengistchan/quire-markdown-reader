import MarkdownIt from 'markdown-it';
import type { RenderRule } from 'markdown-it/lib/renderer.mjs';
import anchor from 'markdown-it-anchor';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import { abbr } from '@mdit/plugin-abbr';
import { container } from '@mdit/plugin-container';
import deflist from 'markdown-it-deflist';
import { footnote } from '@mdit/plugin-footnote';
import { tasklist } from '@mdit/plugin-tasklist';
import type { ReaderSettings } from '../shared/types';

export type MarkdownRenderOptions = Pick<ReaderSettings, 'enableKatex' | 'enableMermaid' | 'enableHtml'>;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function opensInNewTab(href: string): boolean {
  return /^(?:https?:)?\/\//i.test(href) || /^mailto:/i.test(href);
}

export function renderPlainText(source: string): string {
  const escapeHtml = (value: string): string => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const paragraphs: string[] = [];
  let start = 0;
  let current: string[] = [];
  const flush = (end: number) => {
    if (!current.length) return;
    paragraphs.push(`<p data-source-line-start="${start + 1}" data-source-line-end="${end}">${current.map(escapeHtml).join('<br>')}</p>`);
    current = [];
  };
  lines.forEach((line, index) => {
    if (!line.trim()) {
      flush(index);
      return;
    }
    if (!current.length) start = index;
    current.push(line);
  });
  flush(lines.length);
  return paragraphs.join('\n');
}

export function createMarkdownRenderer(settings: MarkdownRenderOptions): MarkdownIt {
  const escapeHtml = (value: string): string => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  const markdown: MarkdownIt = new MarkdownIt({
    html: settings.enableHtml,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(code: string, language: string): string {
      if (language && hljs.getLanguage(language)) {
        return `<pre class="hljs"><code>${hljs.highlight(code, { language }).value}</code></pre>`;
      }
      return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
    },
  });

  markdown.use(anchor, { slugify, permalink: anchor.permalink.linkInsideHeader({ symbol: '#' }) });
  markdown.use(abbr).use(deflist).use(footnote).use(tasklist, { enabled: true, label: true });
  markdown.use(container, { name: 'note' });
  markdown.use(container, { name: 'warning' });
  markdown.core.ruler.push('source-line-attributes', (state) => {
    for (const token of state.tokens) {
      if (!token.map || token.type === 'inline' || token.type.endsWith('_close')) continue;
      token.attrSet('data-source-line-start', String(token.map[0] + 1));
      token.attrSet('data-source-line-end', String(token.map[1]));
    }
  });

  const defaultLinkOpen = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (token && opensInNewTab(token.attrGet('href') ?? '')) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return defaultLinkOpen?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options);
  };

  const defaultImage = markdown.renderer.rules.image;
  markdown.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    token?.attrSet('loading', 'lazy');
    token?.attrSet('decoding', 'async');
    return defaultImage?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options);
  };

  if (settings.enableKatex) {
    markdown.use(texmath, { engine: katex, delimiters: 'dollars', katexOptions: { throwOnError: false } });
  }

  if (settings.enableMermaid) {
    const originalFence = markdown.renderer.rules.fence?.bind(markdown.renderer.rules);
    const mermaidFence: RenderRule = (tokens, index, options, env, self) => {
      const token = tokens[index];
      if (token?.info.trim() === 'mermaid') {
        return `<div class="mermaid" data-mermaid-source="${encodeURIComponent(token.content)}"></div>`;
      }
      return originalFence?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options);
    };
    markdown.renderer.rules.fence = mermaidFence;
  }

  return markdown;
}

export function renderMarkdown(source: string, settings: MarkdownRenderOptions): string {
  const rendered = createMarkdownRenderer(settings).render(source);
  return DOMPurify.sanitize(rendered, {
    ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'data-mermaid-source', 'data-source-line-start', 'data-source-line-end'],
    ADD_TAGS: settings.enableKatex ? ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn'] : [],
  });
}
