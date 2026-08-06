import { afterEach, describe, expect, it, vi } from 'vitest';
import { enhanceDocument, type DocumentEnhancementLabels } from './documentEnhancements';

const labels: DocumentEnhancementLabels = {
  copied: 'Copied',
  copyCode: 'Copy code',
  copyFailed: 'Copy failed',
  diagramControls: 'Diagram controls',
  interactiveDiagram: 'Interactive diagram',
  resetZoom: 'Reset zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
};

function createArticle(markup: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = markup;
  document.body.append(article);
  return article;
}

function pointerEvent(type: string, clientX: number, clientY: number): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event as PointerEvent;
}

describe('document enhancements', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('copies fenced code and returns the button to its idle label', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    const article = createArticle('<pre><code>const answer = 42;\n</code></pre>');
    const cleanup = enhanceDocument(article, labels, { writeText });
    const button = article.querySelector<HTMLButtonElement>('.code-copy')!;

    expect(button.getAttribute('aria-label')).toBe('Copy code');
    button.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('const answer = 42;\n'));
    expect(button.textContent).toBe('Copied');
    expect(button.dataset.copyState).toBe('copied');

    await vi.advanceTimersByTimeAsync(1800);
    expect(button.textContent).toBe('Copy code');
    expect(button.dataset.copyState).toBeUndefined();
    cleanup();
  });

  it('exposes zoom, reset, keyboard pan, and pointer drag controls for Mermaid', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const cleanup = enhanceDocument(article, labels);
    const viewport = article.querySelector<HTMLElement>('.mermaid')!;
    const svg = viewport.querySelector<SVGSVGElement>('svg')!;
    const zoomIn = article.querySelector<HTMLButtonElement>('[data-diagram-action="zoom-in"]')!;
    const reset = article.querySelector<HTMLButtonElement>('[data-diagram-action="reset"]')!;

    zoomIn.click();
    zoomIn.click();
    expect(reset.textContent).toBe('150%');
    expect(svg.style.transform).toBe('translate(0px, 0px) scale(1.5)');

    viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(svg.style.transform).toBe('translate(-16px, 0px) scale(1.5)');

    svg.dispatchEvent(pointerEvent('pointerdown', 100, 80));
    viewport.dispatchEvent(pointerEvent('pointermove', 130, 100));
    viewport.dispatchEvent(pointerEvent('pointerup', 130, 100));
    expect(svg.style.transform).toBe('translate(14px, 20px) scale(1.5)');
    expect(viewport.classList.contains('is-dragging')).toBe(false);

    reset.click();
    expect(reset.textContent).toBe('100%');
    expect(svg.style.transform).toBe('translate(0px, 0px) scale(1)');
    cleanup();
  });

  it('activates diagram controls when an asynchronously rendered SVG arrives', async () => {
    const article = createArticle('<div class="mermaid"></div>');
    const cleanup = enhanceDocument(article, labels);
    const viewport = article.querySelector<HTMLElement>('.mermaid')!;
    const zoomIn = article.querySelector<HTMLButtonElement>('[data-diagram-action="zoom-in"]')!;
    expect(zoomIn.disabled).toBe(true);

    viewport.innerHTML = '<svg role="img"></svg>';
    await vi.waitFor(() => expect(zoomIn.disabled).toBe(false));
    cleanup();
  });
});
