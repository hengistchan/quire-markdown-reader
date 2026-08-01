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

export function createMarkdownRenderer(settings: ReaderSettings): MarkdownIt {
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

  const defaultLinkOpen = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (token && opensInNewTab(token.attrGet('href') ?? '')) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return defaultLinkOpen?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options);
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

export function renderMarkdown(source: string, settings: ReaderSettings): string {
  const rendered = createMarkdownRenderer(settings).render(source);
  return DOMPurify.sanitize(rendered, {
    ADD_ATTR: ['target', 'rel', 'data-mermaid-source'],
    ADD_TAGS: settings.enableKatex ? ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn'] : [],
  });
}
