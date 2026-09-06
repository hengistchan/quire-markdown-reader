import MarkdownIt from 'markdown-it';
import type { RenderRule } from 'markdown-it/lib/renderer.mjs';
import anchor from 'markdown-it-anchor';
import DOMPurify from 'dompurify';
import { abbr } from '@mdit/plugin-abbr';
import { container } from '@mdit/plugin-container';
import deflist from 'markdown-it-deflist';
import { footnote } from '@mdit/plugin-footnote';
import { tasklist } from '@mdit/plugin-tasklist';
import type { ReaderSettings } from '../shared/types';
import type { HeadingItem } from '../shared/types';

export type MarkdownRenderOptions = Pick<
  ReaderSettings,
  'enableKatex' | 'enableMermaid' | 'enableHtml' | 'loadRemoteImages' | 'remoteImageReferrerPolicy'
>;

export interface RenderedDocument {
  html: string;
  headings: HeadingItem[];
  estimatedReadMinutes: number;
}

export interface MarkdownFeatureRuntime {
  highlight?: typeof import('highlight.js/lib/common').default;
  katex?: typeof import('katex').default;
  texmath?: typeof import('markdown-it-texmath').default;
}

const rendererCache = new Map<string, MarkdownIt>();
let loadedHighlight: MarkdownFeatureRuntime['highlight'];
let loadedKatex: MarkdownFeatureRuntime['katex'];
let loadedTexmath: MarkdownFeatureRuntime['texmath'];
let highlightPromise: Promise<void> | undefined;
let katexPromise: Promise<void> | undefined;

function rendererKey(options: MarkdownRenderOptions, runtime: MarkdownFeatureRuntime): string {
  return [
    options.enableHtml ? 'html' : 'no-html',
    options.enableKatex && runtime.katex && runtime.texmath ? 'katex' : 'no-katex',
    options.enableMermaid ? 'mermaid' : 'no-mermaid',
    runtime.highlight ? 'highlight' : 'no-highlight',
  ].join(':');
}

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

function markdownWrappedDestination(value: string): string | undefined {
  const match = /^!?\[[^\]\r\n]*\]\((.+)\)$/u.exec(value.trim());
  if (!match) return undefined;
  const rawDestination = match[1]?.trim();
  if (!rawDestination) return undefined;
  if (rawDestination.startsWith('<') && rawDestination.endsWith('>')) {
    const destination = rawDestination.slice(1, -1);
    return destination && !/[\u0000-\u001f<>]/u.test(destination) ? destination : undefined;
  }
  return /[\u0000-\u0020]/u.test(rawDestination) ? undefined : rawDestination;
}

function normalizeRawHtmlAttributes(value: string): string {
  return value.replace(/<[A-Za-z][^<>]*>/gu, (tag) => {
    const normalizedQuotes = tag
      .replace(/(\s[\w:-]+\s*=\s*)“([^”]*)”/gu, '$1"$2"')
      .replace(/(\s[\w:-]+\s*=\s*)‘([^’]*)’/gu, "$1'$2'");
    return normalizedQuotes.replace(
      /(\s(?:href|src)\s*=\s*)(["'])(.*?)\2/giu,
      (attribute, prefix: string, quote: string, rawValue: string) => {
        const destination = markdownWrappedDestination(rawValue);
        return destination ? `${prefix}${quote}${destination}${quote}` : attribute;
      },
    );
  });
}

export function renderPlainText(source: string): string {
  const escapeHtml = (value: string): string =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const paragraphs: string[] = [];
  let start = 0;
  let current: string[] = [];
  const flush = (end: number) => {
    if (!current.length) return;
    paragraphs.push(
      `<p data-source-line-start="${start + 1}" data-source-line-end="${end}">${current.map(escapeHtml).join('<br>')}</p>`,
    );
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

export function renderPlainTextDocument(source: string): RenderedDocument {
  return { html: renderPlainText(source), headings: [], estimatedReadMinutes: estimateReadMinutes(source) };
}

export function createMarkdownRenderer(
  settings: MarkdownRenderOptions,
  runtime: MarkdownFeatureRuntime = {},
): MarkdownIt {
  const escapeHtml = (value: string): string =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const markdown: MarkdownIt = new MarkdownIt({
    html: settings.enableHtml,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(code: string, language: string): string {
      if (runtime.highlight && language && runtime.highlight.getLanguage(language)) {
        return `<pre class="hljs"><code>${runtime.highlight.highlight(code, { language }).value}</code></pre>`;
      }
      return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
    },
  });

  markdown.use(anchor, { slugify, permalink: anchor.permalink.linkInsideHeader({ symbol: '#' }) });
  markdown.use(abbr).use(deflist).use(footnote).use(tasklist, { enabled: true, label: true });
  markdown.use(container, { name: 'note' });
  markdown.use(container, { name: 'warning' });
  markdown.core.ruler.after('inline', 'normalize-raw-html-attributes', (state) => {
    const normalizeTokens = (tokens: typeof state.tokens) => {
      for (const token of tokens) {
        if (token.type === 'html_block' || token.type === 'html_inline') {
          token.content = normalizeRawHtmlAttributes(token.content);
        }
        if (token.children) normalizeTokens(token.children);
      }
    };
    normalizeTokens(state.tokens);
  });
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

  if (settings.enableKatex && runtime.katex && runtime.texmath) {
    markdown.use(runtime.texmath, {
      engine: runtime.katex,
      delimiters: 'dollars',
      katexOptions: { throwOnError: false },
    });
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

export function getMarkdownRenderer(settings: MarkdownRenderOptions, runtime: MarkdownFeatureRuntime = {}): MarkdownIt {
  const key = rendererKey(settings, runtime);
  const cached = rendererCache.get(key);
  if (cached) return cached;
  const renderer = createMarkdownRenderer(settings, runtime);
  rendererCache.set(key, renderer);
  return renderer;
}

function needsHighlight(source: string): boolean {
  let openFence: { character: '`' | '~'; length: number } | undefined;
  for (const line of source.replaceAll('\r\n', '\n').split('\n')) {
    const match = /^\s*(`{3,}|~{3,})(.*)$/u.exec(line);
    if (!match) continue;
    const marker = match[1]!;
    const character = marker[0] as '`' | '~';
    if (openFence) {
      if (character === openFence.character && marker.length >= openFence.length) openFence = undefined;
      continue;
    }
    const language = match[2]?.trim().split(/\s+/u)[0]?.toLowerCase();
    if (language !== 'mermaid') return true;
    openFence = { character, length: marker.length };
  }
  return false;
}

function needsKatex(source: string): boolean {
  return /(?:^|[^\\])\$(?:\$|[^$\n])/u.test(source);
}

export function currentMarkdownFeatureRuntime(): MarkdownFeatureRuntime {
  return { highlight: loadedHighlight, katex: loadedKatex, texmath: loadedTexmath };
}

export async function loadMarkdownFeatureRuntime(
  source: string,
  settings: MarkdownRenderOptions,
): Promise<MarkdownFeatureRuntime> {
  const tasks: Promise<void>[] = [];
  if (needsHighlight(source) && !loadedHighlight) {
    highlightPromise ??= Promise.all([
      import('highlight.js/lib/common'),
      import('highlight.js/styles/github-dark-dimmed.css'),
    ])
      .then(([module]) => {
        loadedHighlight = module.default;
      })
      .catch((error: unknown) => {
        highlightPromise = undefined;
        throw error;
      });
    tasks.push(highlightPromise);
  }
  if (settings.enableKatex && needsKatex(source) && (!loadedKatex || !loadedTexmath)) {
    katexPromise ??= Promise.all([import('katex'), import('markdown-it-texmath'), import('katex/dist/katex.min.css')])
      .then(([katexModule, texmathModule]) => {
        loadedKatex = katexModule.default;
        loadedTexmath = texmathModule.default;
      })
      .catch((error: unknown) => {
        katexPromise = undefined;
        throw error;
      });
    tasks.push(katexPromise);
  }
  await Promise.all(tasks);
  return currentMarkdownFeatureRuntime();
}

function inlineText(token: { content: string; children?: Array<{ type: string; content: string }> | null }): string {
  if (!token.children) return token.content;
  return token.children
    .map((child) => {
      if (child.type === 'softbreak' || child.type === 'hardbreak') return ' ';
      return child.content;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+#$/u, '');
}

function collectHeadings(tokens: ReturnType<MarkdownIt['parse']>): HeadingItem[] {
  const headings: HeadingItem[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const opening = tokens[index];
    if (opening?.type !== 'heading_open') continue;
    const inline = tokens[index + 1];
    headings.push({
      id: opening.attrGet('id') ?? '',
      text: inline ? inlineText(inline) : '',
      level: Number(opening.tag.slice(1)),
      sourceLine: opening.map?.[0] === undefined ? undefined : opening.map[0] + 1,
    });
  }
  return headings;
}

function estimateReadMinutes(source: string): number {
  const words = source
    .replace(/[`#>*_\-[\]]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function prepareDocumentResources(html: string, settings: MarkdownRenderOptions): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const image of template.content.querySelectorAll<HTMLImageElement>('img')) {
    image.removeAttribute('srcset');
    const source = image.getAttribute('src');
    if (!source) continue;
    image.removeAttribute('src');
    image.dataset.resourceSrc = source;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = settings.remoteImageReferrerPolicy;
    if (!settings.loadRemoteImages && /^(?:https?:)?\/\//i.test(source)) {
      image.dataset.resourceState = 'blocked';
    }
  }
  for (const element of template.content.querySelectorAll<HTMLElement>('[style]')) {
    if (!settings.loadRemoteImages && /url\s*\(/iu.test(element.getAttribute('style') ?? '')) {
      element.removeAttribute('style');
    }
  }
  return template.innerHTML;
}

export function renderMarkdownDocument(
  source: string,
  settings: MarkdownRenderOptions,
  runtime: MarkdownFeatureRuntime = currentMarkdownFeatureRuntime(),
): RenderedDocument {
  const renderer = getMarkdownRenderer(settings, runtime);
  const environment = {};
  const tokens = renderer.parse(source, environment);
  const rendered = renderer.renderer.render(tokens, renderer.options, environment);
  const sanitized = DOMPurify.sanitize(rendered, {
    ADD_ATTR: [
      'target',
      'rel',
      'loading',
      'decoding',
      'data-mermaid-source',
      'data-source-line-start',
      'data-source-line-end',
    ],
    ADD_TAGS: settings.enableKatex ? ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn'] : [],
    FORBID_ATTR: ['srcset'],
    FORBID_TAGS: ['audio', 'embed', 'iframe', 'image', 'object', 'source', 'track', 'video'],
  });
  return {
    html: prepareDocumentResources(sanitized, settings),
    headings: collectHeadings(tokens),
    estimatedReadMinutes: estimateReadMinutes(source),
  };
}

export function renderMarkdown(
  source: string,
  settings: MarkdownRenderOptions,
  runtime?: MarkdownFeatureRuntime,
): string {
  return renderMarkdownDocument(source, settings, runtime).html;
}
