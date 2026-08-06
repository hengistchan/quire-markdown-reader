export interface DocumentEnhancementLabels {
  copied: string;
  copyCode: string;
  copyFailed: string;
  diagramControls: string;
  interactiveDiagram: string;
  resetZoom: string;
  zoomIn: string;
  zoomOut: string;
}

interface DocumentEnhancementOptions {
  writeText?: (value: string) => Promise<void>;
}

interface DiagramState {
  panX: number;
  panY: number;
  scale: number;
}

const MIN_DIAGRAM_SCALE = 0.5;
const MAX_DIAGRAM_SCALE = 3;
const DIAGRAM_SCALE_STEP = 0.25;

function readDiagramState(viewport: HTMLElement): DiagramState {
  return {
    scale: Number(viewport.dataset.diagramScale) || 1,
    panX: Number(viewport.dataset.diagramPanX) || 0,
    panY: Number(viewport.dataset.diagramPanY) || 0,
  };
}

async function writeClipboardText(article: HTMLElement, value: string): Promise<void> {
  const clipboard = article.ownerDocument.defaultView?.navigator.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(value);
    return;
  }
  const textarea = article.ownerDocument.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  article.ownerDocument.body.append(textarea);
  textarea.select();
  const copied = article.ownerDocument.execCommand?.('copy') ?? false;
  textarea.remove();
  if (!copied) throw new Error('Clipboard access is unavailable.');
}

function createControl(document: Document, className: string, label: string, text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = text;
  return button;
}

export function enhanceDocument(
  article: HTMLElement,
  labels: DocumentEnhancementLabels,
  options: DocumentEnhancementOptions = {},
): () => void {
  const cleanups: Array<() => void> = [];
  const writeText = options.writeText ?? ((value: string) => writeClipboardText(article, value));

  for (const pre of article.querySelectorAll<HTMLPreElement>('pre')) {
    if (pre.closest('.mermaid')) continue;
    let shell = pre.parentElement?.classList.contains('code-shell') ? pre.parentElement : undefined;
    if (!shell) {
      shell = article.ownerDocument.createElement('div');
      shell.className = 'code-shell';
      pre.before(shell);
      shell.append(pre);
    }
    let button = shell.querySelector<HTMLButtonElement>(':scope > .code-copy');
    if (!button) {
      button = createControl(article.ownerDocument, 'code-copy', labels.copyCode, labels.copyCode);
      shell.prepend(button);
    }
    button.textContent = labels.copyCode;
    button.setAttribute('aria-label', labels.copyCode);
    button.title = labels.copyCode;
    button.removeAttribute('data-copy-state');
    let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
    const copy = async () => {
      if (feedbackTimer) clearTimeout(feedbackTimer);
      try {
        await writeText(pre.querySelector('code')?.textContent ?? pre.textContent ?? '');
        button!.dataset.copyState = 'copied';
        button!.textContent = labels.copied;
        button!.setAttribute('aria-label', labels.copied);
      } catch {
        button!.dataset.copyState = 'error';
        button!.textContent = labels.copyFailed;
        button!.setAttribute('aria-label', labels.copyFailed);
      }
      feedbackTimer = setTimeout(() => {
        button!.removeAttribute('data-copy-state');
        button!.textContent = labels.copyCode;
        button!.setAttribute('aria-label', labels.copyCode);
      }, 1800);
    };
    button.addEventListener('click', copy);
    cleanups.push(() => {
      button!.removeEventListener('click', copy);
      if (feedbackTimer) clearTimeout(feedbackTimer);
    });
  }

  for (const viewport of article.querySelectorAll<HTMLElement>('.mermaid')) {
    let shell = viewport.parentElement?.classList.contains('diagram-shell') ? viewport.parentElement : undefined;
    if (!shell) {
      shell = article.ownerDocument.createElement('div');
      shell.className = 'diagram-shell';
      viewport.before(shell);
      shell.append(viewport);
    }
    let toolbar = shell.querySelector<HTMLElement>(':scope > .diagram-toolbar');
    if (!toolbar) {
      toolbar = article.ownerDocument.createElement('div');
      toolbar.className = 'diagram-toolbar';
      toolbar.setAttribute('role', 'toolbar');
      shell.prepend(toolbar);
    }
    toolbar.setAttribute('aria-label', labels.diagramControls);
    let zoomOut = toolbar.querySelector<HTMLButtonElement>('[data-diagram-action="zoom-out"]');
    let reset = toolbar.querySelector<HTMLButtonElement>('[data-diagram-action="reset"]');
    let zoomIn = toolbar.querySelector<HTMLButtonElement>('[data-diagram-action="zoom-in"]');
    if (!zoomOut || !reset || !zoomIn) {
      toolbar.replaceChildren();
      zoomOut = createControl(article.ownerDocument, 'diagram-control', labels.zoomOut, '−');
      zoomOut.dataset.diagramAction = 'zoom-out';
      reset = createControl(article.ownerDocument, 'diagram-control diagram-zoom-value', labels.resetZoom, '100%');
      reset.dataset.diagramAction = 'reset';
      reset.setAttribute('aria-live', 'polite');
      zoomIn = createControl(article.ownerDocument, 'diagram-control', labels.zoomIn, '+');
      zoomIn.dataset.diagramAction = 'zoom-in';
      toolbar.append(zoomOut, reset, zoomIn);
    }
    zoomOut.setAttribute('aria-label', labels.zoomOut);
    zoomOut.title = labels.zoomOut;
    zoomIn.setAttribute('aria-label', labels.zoomIn);
    zoomIn.title = labels.zoomIn;
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', labels.interactiveDiagram);

    const apply = () => {
      const state = readDiagramState(viewport);
      const svg = viewport.querySelector<SVGSVGElement>('svg');
      if (svg) svg.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
      viewport.dataset.diagramScale = String(state.scale);
      viewport.dataset.diagramPanX = String(state.panX);
      viewport.dataset.diagramPanY = String(state.panY);
      viewport.dataset.diagramZoomed = state.scale > 1 ? 'true' : 'false';
      viewport.dataset.diagramReady = svg ? 'true' : 'false';
      const percent = `${Math.round(state.scale * 100)}%`;
      reset!.textContent = percent;
      reset!.setAttribute('aria-label', `${labels.resetZoom}: ${percent}`);
      reset!.title = labels.resetZoom;
      const unavailable = !svg;
      zoomOut!.disabled = unavailable || state.scale <= MIN_DIAGRAM_SCALE;
      zoomIn!.disabled = unavailable || state.scale >= MAX_DIAGRAM_SCALE;
      reset!.disabled = unavailable || state.scale === 1 && state.panX === 0 && state.panY === 0;
    };
    const update = (scale: number, panX = readDiagramState(viewport).panX, panY = readDiagramState(viewport).panY) => {
      const nextScale = Math.min(MAX_DIAGRAM_SCALE, Math.max(MIN_DIAGRAM_SCALE, scale));
      viewport.dataset.diagramScale = String(nextScale);
      viewport.dataset.diagramPanX = String(panX);
      viewport.dataset.diagramPanY = String(panY);
      apply();
    };
    const zoomBy = (delta: number) => update(readDiagramState(viewport).scale + delta);
    const resetView = () => update(1, 0, 0);
    const onZoomOut = () => zoomBy(-DIAGRAM_SCALE_STEP);
    const onZoomIn = () => zoomBy(DIAGRAM_SCALE_STEP);
    zoomOut.addEventListener('click', onZoomOut);
    zoomIn.addEventListener('click', onZoomIn);
    reset.addEventListener('click', resetView);

    let dragStart: { clientX: number; clientY: number; panX: number; panY: number; pointerId: number } | undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest('svg')) return;
      const state = readDiagramState(viewport);
      dragStart = { clientX: event.clientX, clientY: event.clientY, panX: state.panX, panY: state.panY, pointerId: event.pointerId };
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragStart || event.pointerId !== dragStart.pointerId) return;
      update(readDiagramState(viewport).scale, dragStart.panX + event.clientX - dragStart.clientX, dragStart.panY + event.clientY - dragStart.clientY);
    };
    const stopDragging = (event: PointerEvent) => {
      if (!dragStart || event.pointerId !== dragStart.pointerId) return;
      viewport.releasePointerCapture?.(event.pointerId);
      viewport.classList.remove('is-dragging');
      dragStart = undefined;
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? DIAGRAM_SCALE_STEP : -DIAGRAM_SCALE_STEP);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const state = readDiagramState(viewport);
      if (event.key === '+' || event.key === '=') zoomBy(DIAGRAM_SCALE_STEP);
      else if (event.key === '-') zoomBy(-DIAGRAM_SCALE_STEP);
      else if (event.key === '0') resetView();
      else if (viewport.querySelector('svg') && event.key.startsWith('Arrow')) {
        const amount = event.shiftKey ? 40 : 16;
        update(state.scale, state.panX + (event.key === 'ArrowLeft' ? amount : event.key === 'ArrowRight' ? -amount : 0), state.panY + (event.key === 'ArrowUp' ? amount : event.key === 'ArrowDown' ? -amount : 0));
      } else return;
      event.preventDefault();
    };
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', stopDragging);
    viewport.addEventListener('pointercancel', stopDragging);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('keydown', onKeyDown);
    const Observer = article.ownerDocument.defaultView?.MutationObserver;
    const observer = Observer ? new Observer(apply) : undefined;
    observer?.observe(viewport, { childList: true });
    apply();
    cleanups.push(() => {
      zoomOut!.removeEventListener('click', onZoomOut);
      zoomIn!.removeEventListener('click', onZoomIn);
      reset!.removeEventListener('click', resetView);
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', stopDragging);
      viewport.removeEventListener('pointercancel', stopDragging);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('keydown', onKeyDown);
      observer?.disconnect();
    });
  }

  return () => cleanups.forEach((cleanup) => cleanup());
}
