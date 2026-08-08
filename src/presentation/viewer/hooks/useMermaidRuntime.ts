import { useEffect, type RefObject } from 'react';
import { resolveMermaidTheme } from '../theme/mermaidTheme';

const MERMAID_CACHE_LIMIT = 50;
const mermaidSvgCache = new Map<string, string>();
const mermaidRenderTokens = new WeakMap<HTMLElement, symbol>();
let mermaidRenderQueue: Promise<void> = Promise.resolve();

function enqueueMermaidRender(task: () => Promise<void>): Promise<void> {
  const next = mermaidRenderQueue.then(task, task);
  mermaidRenderQueue = next.catch(() => undefined);
  return next;
}

export function useMermaidRuntime(
  articleRef: RefObject<HTMLElement | null>,
  options: { enabled: boolean; documentHtml: string; theme: 'light' | 'dark'; errorMessage: string },
): void {
  const { enabled, documentHtml, theme: readerTheme, errorMessage } = options;
  useEffect(() => {
    if (!enabled || !articleRef.current) return;
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const effectRenders = new Map<HTMLElement, symbol>();
    const resolvedTheme = resolveMermaidTheme(document.documentElement, readerTheme);
    const renderNode = async (node: HTMLElement) => {
      const encoded = node.dataset.mermaidSource;
      if (!encoded) return;
      if (node.dataset.resourceState === 'ready' && node.querySelector('svg')) {
        if (node.dataset.mermaidTheme === readerTheme) return;
        node.replaceChildren();
        node.dataset.resourceState = 'idle';
        node.removeAttribute('data-processed');
        node.removeAttribute('data-mermaid-theme');
      }
      if (node.dataset.resourceState === 'rendering' && mermaidRenderTokens.has(node)) return;
      const cacheKey = `${resolvedTheme.cacheVersion}:${encoded}`;
      const cached = mermaidSvgCache.get(cacheKey);
      if (cached?.includes('<svg')) {
        node.innerHTML = cached;
        node.dataset.resourceState = 'ready';
        node.dataset.mermaidTheme = readerTheme;
        node.removeAttribute('aria-busy');
        return;
      }
      if (cached) mermaidSvgCache.delete(cacheKey);
      const token = Symbol(cacheKey);
      mermaidRenderTokens.set(node, token);
      effectRenders.set(node, token);
      node.dataset.resourceState = 'rendering';
      node.setAttribute('aria-busy', 'true');
      node.removeAttribute('data-resource-error');
      const source = decodeURIComponent(encoded);
      await enqueueMermaidRender(async () => {
        let lastError: unknown;
        try {
          const { default: mermaid } = await import('mermaid');
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            if (cancelled || !node.isConnected || mermaidRenderTokens.get(node) !== token) return;
            node.textContent = source;
            node.removeAttribute('data-processed');
            try {
              mermaid.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                theme: resolvedTheme.theme,
                themeVariables: resolvedTheme.themeVariables,
                fontFamily: resolvedTheme.themeVariables.fontFamily as string,
              });
              await mermaid.run({ nodes: [node], suppressErrors: true });
              if (cancelled || !node.isConnected || mermaidRenderTokens.get(node) !== token) return;
              if (!node.querySelector('svg')) throw new Error('Mermaid completed without producing an SVG.');
              node.dataset.resourceState = 'ready';
              node.dataset.mermaidTheme = readerTheme;
              node.removeAttribute('data-resource-error');
              mermaidSvgCache.set(cacheKey, node.innerHTML);
              if (mermaidSvgCache.size > MERMAID_CACHE_LIMIT) mermaidSvgCache.delete(mermaidSvgCache.keys().next().value!);
              return;
            } catch (caught) {
              lastError = caught;
            }
          }
          if (cancelled || !node.isConnected || mermaidRenderTokens.get(node) !== token) return;
          node.textContent = source;
          node.dataset.resourceState = 'error';
          node.dataset.resourceError = errorMessage;
          console.error('[quire:mermaid] render failed', { error: lastError });
        } catch (caught) {
          if (cancelled || !node.isConnected || mermaidRenderTokens.get(node) !== token) return;
          node.textContent = source;
          node.dataset.resourceState = 'error';
          node.dataset.resourceError = errorMessage;
          console.error('[quire:mermaid] load failed', { error: caught });
        } finally {
          if (mermaidRenderTokens.get(node) === token) {
            if (node.dataset.resourceState === 'rendering') node.dataset.resourceState = 'idle';
            node.removeAttribute('aria-busy');
            mermaidRenderTokens.delete(node);
          }
          effectRenders.delete(node);
        }
      });
    };
    const nodes = [...articleRef.current.querySelectorAll<HTMLElement>('.mermaid')];
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          void renderNode(entry.target as HTMLElement);
        }
      }, { rootMargin: '500px 0px' });
      for (const node of nodes) {
        if (node.dataset.resourceState === 'ready' && node.querySelector('svg')
          && node.dataset.mermaidTheme !== readerTheme) {
          void renderNode(node);
        } else {
          observer.observe(node);
        }
      }
    } else {
      for (const node of nodes) void renderNode(node);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
      for (const [node, token] of effectRenders) {
        if (mermaidRenderTokens.get(node) !== token) continue;
        if (node.dataset.resourceState === 'rendering') node.dataset.resourceState = 'idle';
        node.removeAttribute('aria-busy');
        mermaidRenderTokens.delete(node);
      }
      effectRenders.clear();
    };
  }, [articleRef, documentHtml, enabled, errorMessage, readerTheme]);
}
