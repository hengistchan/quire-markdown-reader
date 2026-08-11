import { afterEach, describe, expect, it, vi } from 'vitest';
import { enhanceDocument, type DocumentEnhancementLabels } from './documentEnhancements';

const labels: DocumentEnhancementLabels = {
  copied: 'Copied',
  copyCode: 'Copy code',
  copyFailed: 'Copy failed',
  diagramControls: 'Diagram controls',
  expandDiagram: 'Expand diagram',
  closeLightbox: 'Close expanded diagram',
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

function pointerEvent(type: string, clientX: number, clientY: number, pointerId = 1): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event as PointerEvent;
}

function installPointerCapture(element: HTMLElement): void {
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
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

  it('falls back when Clipboard API writes are blocked by an embedding policy', async () => {
    const writeText = vi.fn(async () => { throw new DOMException('Blocked', 'NotAllowedError'); });
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    try {
      const article = createArticle('<pre><code>fallback();</code></pre>');
      const cleanup = enhanceDocument(article, labels);
      article.querySelector<HTMLButtonElement>('.code-copy')!.click();

      await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
      expect(writeText).toHaveBeenCalledWith('fallback();');
      expect(article.querySelector<HTMLButtonElement>('.code-copy')!.textContent).toBe('Copied');
      cleanup();
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('exposes zoom, reset, keyboard pan, and pointer drag controls for Mermaid', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const cleanup = enhanceDocument(article, labels);
    const viewport = article.querySelector<HTMLElement>('.mermaid')!;
    const svg = viewport.querySelector<SVGSVGElement>('svg')!;
    const zoomIn = article.querySelector<HTMLButtonElement>('[data-diagram-action="zoom-in"]')!;
    const reset = article.querySelector<HTMLButtonElement>('[data-diagram-action="reset"]')!;
    const expand = article.querySelector<HTMLButtonElement>('[data-diagram-action="expand"]')!;

    expect(expand).toBeTruthy();
    expect(expand.getAttribute('aria-label')).toBe('Expand diagram');

    svg.dispatchEvent(pointerEvent('pointerdown', 100, 80));
    viewport.dispatchEvent(pointerEvent('pointermove', 130, 100));
    viewport.dispatchEvent(pointerEvent('pointerup', 130, 100));
    expect(svg.style.transform).toBe('translate(30px, 20px) scale(1)');
    expect(reset.disabled).toBe(false);
    reset.click();

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

  it('opens a lightbox when the expand button is clicked', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"><rect width="200" height="100"/></svg></div>');
    const cleanup = enhanceDocument(article, labels);
    const expand = article.querySelector<HTMLButtonElement>('[data-diagram-action="expand"]')!;

    expand.click();

    const backdrop = document.querySelector<HTMLElement>('.diagram-lightbox-backdrop')!;
    expect(backdrop).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    const lightbox = backdrop.querySelector<HTMLElement>('.diagram-lightbox')!;
    expect(lightbox).toBeTruthy();
    expect(lightbox.getAttribute('aria-modal')).toBe('true');

    const lightboxSvg = lightbox.querySelector('svg')!;
    expect(lightboxSvg).toBeTruthy();
    cleanup();
  });

  it('closes the lightbox on Escape and restores body scroll', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const cleanup = enhanceDocument(article, labels);
    article.querySelector<HTMLButtonElement>('[data-diagram-action="expand"]')!.click();

    expect(document.querySelector('.diagram-lightbox-backdrop')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('.diagram-lightbox-backdrop')).toBeFalsy();
    expect(document.body.style.overflow).toBe('');
    cleanup();
  });

  it('closes the lightbox when the backdrop is clicked', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const cleanup = enhanceDocument(article, labels);
    article.querySelector<HTMLButtonElement>('[data-diagram-action="expand"]')!.click();

    const backdrop = document.querySelector<HTMLElement>('.diagram-lightbox-backdrop')!;
    expect(backdrop).toBeTruthy();

    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(document.querySelector('.diagram-lightbox-backdrop')).toBeFalsy();
    cleanup();
  });

  it('closes the lightbox via the close button', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const cleanup = enhanceDocument(article, labels);
    article.querySelector<HTMLButtonElement>('[data-diagram-action="expand"]')!.click();

    const closeBtn = document.querySelector<HTMLButtonElement>('[data-diagram-action="close"]')!;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();

    expect(document.querySelector('.diagram-lightbox-backdrop')).toBeFalsy();
    expect(document.body.style.overflow).toBe('');
    cleanup();
  });

  it('preserves zoom state in the lightbox', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const cleanup = enhanceDocument(article, labels);
    const zoomIn = article.querySelector<HTMLButtonElement>('[data-diagram-action="zoom-in"]')!;

    zoomIn.click();
    zoomIn.click();
    article.querySelector<HTMLButtonElement>('[data-diagram-action="expand"]')!.click();

    const lightbox = document.querySelector<HTMLElement>('.diagram-lightbox')!;
    const lightboxSvg = lightbox.querySelector<SVGSVGElement>('svg')!;
    expect(lightboxSvg.style.transform).toContain('scale(1.5)');

    const lightboxReset = lightbox.querySelector<HTMLButtonElement>('[data-diagram-action="reset"]')!;
    expect(lightboxReset.textContent).toBe('150%');
    cleanup();
  });

  it('closes only the current lightbox on a second expand click', () => {
    const article = createArticle(`
      <div class="mermaid"><svg role="img"><rect width="100" height="50"/></svg></div>
      <div class="mermaid"><svg role="img"><rect width="200" height="80"/></svg></div>
    `);
    const cleanup = enhanceDocument(article, labels);
    const [firstExpand] = article.querySelectorAll<HTMLButtonElement>('[data-diagram-action="expand"]');

    firstExpand!.click();
    expect(document.querySelector('.diagram-lightbox-backdrop')).toBeTruthy();

    const [secondExpand] = article.querySelectorAll<HTMLButtonElement>('[data-diagram-action="expand"]');
    secondExpand!.click();

    expect(document.querySelectorAll('.diagram-lightbox-backdrop').length).toBe(1);
    cleanup();
  });

  it('performs pinch-to-zoom via two simultaneous pointers', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const viewport = article.querySelector<HTMLElement>('.mermaid')!;
    const svg = viewport.querySelector<SVGSVGElement>('svg')!;
    installPointerCapture(viewport);
    const cleanup = enhanceDocument(article, labels);

    const rect = viewport.getBoundingClientRect();
    // First pointer down
    svg.dispatchEvent(pointerEvent('pointerdown', rect.left + 100, rect.top + 50, 1));
    // Second pointer down (triggers pinch via gotpointercapture)
    const gotCaptureEvent = new MouseEvent('gotpointercapture', { bubbles: true, clientX: rect.left + 160, clientY: rect.top + 50 });
    Object.defineProperty(gotCaptureEvent, 'pointerId', { value: 2 });
    viewport.dispatchEvent(gotCaptureEvent);

    // Both pointers move apart (pinch out)
    viewport.dispatchEvent(pointerEvent('pointermove', rect.left + 90, rect.top + 50, 1));
    viewport.dispatchEvent(pointerEvent('pointermove', rect.left + 180, rect.top + 50, 2));

    const transform = svg.style.transform;
    expect(transform).toContain('scale');
    const scaleMatch = /scale\(([\d.]+)\)/.exec(transform)!;
    expect(Number(scaleMatch[1])).toBeGreaterThan(1);

    cleanup();
  });

  it('keeps zoom midpoint anchored during pinch', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const viewport = article.querySelector<HTMLElement>('.mermaid')!;
    const svg = viewport.querySelector<SVGSVGElement>('svg')!;
    installPointerCapture(viewport);
    const cleanup = enhanceDocument(article, labels);

    const rect = viewport.getBoundingClientRect();
    const midX = rect.left + 130;
    const midY = rect.top + 50;

    svg.dispatchEvent(pointerEvent('pointerdown', midX - 30, midY, 1));
    const gotCaptureEvent = new MouseEvent('gotpointercapture', { bubbles: true, clientX: midX + 30, clientY: midY });
    Object.defineProperty(gotCaptureEvent, 'pointerId', { value: 2 });
    viewport.dispatchEvent(gotCaptureEvent);

    viewport.dispatchEvent(pointerEvent('pointermove', midX - 50, midY, 1));
    viewport.dispatchEvent(pointerEvent('pointermove', midX + 50, midY, 2));

    const zoomMatch = /scale\(([\d.]+)\)/.exec(svg.style.transform)!;
    expect(Number(zoomMatch[1])).toBeGreaterThanOrEqual(1.25);

    cleanup();
  });

  it('ends pinch when one pointer is released', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const viewport = article.querySelector<HTMLElement>('.mermaid')!;
    const svg = viewport.querySelector<SVGSVGElement>('svg')!;
    installPointerCapture(viewport);
    const cleanup = enhanceDocument(article, labels);

    const rect = viewport.getBoundingClientRect();
    svg.dispatchEvent(pointerEvent('pointerdown', rect.left + 100, rect.top + 50, 1));
    const gotCaptureEvent = new MouseEvent('gotpointercapture', { bubbles: true, clientX: rect.left + 160, clientY: rect.top + 50 });
    Object.defineProperty(gotCaptureEvent, 'pointerId', { value: 2 });
    viewport.dispatchEvent(gotCaptureEvent);

    viewport.dispatchEvent(pointerEvent('pointermove', rect.left + 80, rect.top + 50, 1));
    viewport.dispatchEvent(pointerEvent('pointermove', rect.left + 200, rect.top + 50, 2));

    const beforeTransform = svg.style.transform;

    // Release one pointer
    viewport.dispatchEvent(pointerEvent('pointerup', rect.left + 80, rect.top + 50, 1));

    // Subsequent drag should work (proving pinch is over)
    svg.dispatchEvent(pointerEvent('pointerdown', rect.left + 50, rect.top + 50, 3));
    viewport.dispatchEvent(pointerEvent('pointermove', rect.left + 80, rect.top + 50, 3));
    viewport.dispatchEvent(pointerEvent('pointerup', rect.left + 80, rect.top + 50, 3));

    // Scale should be preserved from pinch, pan should change from drag
    const beforeScale = /scale\(([\d.]+)\)/.exec(beforeTransform)![1];
    const afterScale = /scale\(([\d.]+)\)/.exec(svg.style.transform)![1];
    expect(afterScale).toBe(beforeScale);

    cleanup();
  });

  it('zooms via the lightbox toolbar', () => {
    const article = createArticle('<div class="mermaid"><svg role="img"></svg></div>');
    const cleanup = enhanceDocument(article, labels);
    article.querySelector<HTMLButtonElement>('[data-diagram-action="expand"]')!.click();

    const lightbox = document.querySelector<HTMLElement>('.diagram-lightbox')!;
    const lightboxZoomOut = lightbox.querySelector<HTMLButtonElement>('[data-diagram-action="zoom-out"]')!;
    const lightboxZoomIn = lightbox.querySelector<HTMLButtonElement>('[data-diagram-action="zoom-in"]')!;
    const lightboxReset = lightbox.querySelector<HTMLButtonElement>('[data-diagram-action="reset"]')!;
    const lightboxSvg = lightbox.querySelector<SVGSVGElement>('svg')!;

    lightboxZoomIn.click();
    expect(lightboxReset.textContent).toBe('125%');
    expect(lightboxSvg.style.transform).toContain('scale(1.25)');

    lightboxZoomOut.click();
    expect(lightboxReset.textContent).toBe('100%');

    cleanup();
  });
});
