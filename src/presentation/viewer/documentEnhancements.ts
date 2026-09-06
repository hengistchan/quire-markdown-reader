export interface DocumentEnhancementLabels {
  copied: string;
  copyCode: string;
  copyFailed: string;
  diagramControls: string;
  interactiveDiagram: string;
  expandDiagram: string;
  closeLightbox: string;
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
    try {
      await clipboard.writeText(value);
      return;
    } catch {
      // Permissions Policy can expose the API while rejecting writes in embeds.
    }
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

/* ── Pinch-to-zoom state ──────────────────────────────────────────── */

interface PinchGesture {
  pointers: Map<number, { clientX: number; clientY: number }>;
  baseDistance: number;
  baseScale: number;
  basePanX: number;
  basePanY: number;
  midX: number;
  midY: number;
}

let pinch: PinchGesture | undefined;

function pinchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/* ── Lightbox ─────────────────────────────────────────────────────── */

let lightboxCleanup: (() => void) | undefined;

function closeLightbox(): void {
  lightboxCleanup?.();
  lightboxCleanup = undefined;
}

function openLightbox(sourceShell: HTMLElement, sourceViewport: HTMLElement, labels: DocumentEnhancementLabels): void {
  const doc = sourceShell.ownerDocument;
  closeLightbox();
  const previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : undefined;
  const previousOverflow = doc.body.style.overflow;
  doc.body.style.overflow = 'hidden';

  const backdrop = doc.createElement('div');
  backdrop.className = 'diagram-lightbox-backdrop';

  const container = doc.createElement('div');
  container.className = 'diagram-lightbox';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-label', labels.interactiveDiagram);

  const toolbar = doc.createElement('div');
  toolbar.className = 'diagram-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', labels.diagramControls);

  const zoomOut = createControl(doc, 'diagram-control', labels.zoomOut, '−');
  zoomOut.dataset.diagramAction = 'zoom-out';
  const reset = createControl(doc, 'diagram-control diagram-zoom-value', labels.resetZoom, '100%');
  reset.dataset.diagramAction = 'reset';
  reset.setAttribute('aria-live', 'polite');
  const zoomIn = createControl(doc, 'diagram-control', labels.zoomIn, '+');
  zoomIn.dataset.diagramAction = 'zoom-in';
  const closeBtn = createControl(doc, 'diagram-control', labels.closeLightbox, '×');
  closeBtn.dataset.diagramAction = 'close';

  toolbar.append(zoomOut, reset, zoomIn, closeBtn);

  const viewport = doc.createElement('div');
  viewport.className = 'mermaid';
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', labels.interactiveDiagram);

  const sourceSvg = sourceViewport.querySelector<SVGSVGElement>('svg');
  if (sourceSvg) viewport.innerHTML = sourceSvg.outerHTML;
  viewport.dataset.diagramReady = sourceViewport.dataset.diagramReady;
  viewport.dataset.mermaidTheme = sourceViewport.dataset.mermaidTheme;

  const sourceState = readDiagramState(sourceViewport);
  viewport.dataset.diagramScale = String(sourceState.scale);
  viewport.dataset.diagramPanX = String(sourceState.panX);
  viewport.dataset.diagramPanY = String(sourceState.panY);

  container.append(toolbar, viewport);
  backdrop.append(container);
  doc.body.append(backdrop);
  const inertSiblings = [...doc.body.children]
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop)
    .map((element) => ({ element, inert: element.inert }));
  for (const sibling of inertSiblings) sibling.element.inert = true;

  /* ── interactions ─────────────────────────────── */

  const cleanup = bindDiagramInteractions(viewport, { zoomOut, reset, zoomIn, expand: null }, labels, {
    onClose: closeLightbox,
  });

  const onCloseClick = () => closeLightbox();
  closeBtn.addEventListener('click', onCloseClick);
  const onBackdrop = (event: MouseEvent) => {
    if (event.target === backdrop) closeLightbox();
  };
  backdrop.addEventListener('mousedown', onBackdrop);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLightbox();
    }
    if (event.key === 'Tab') {
      const controls = [...backdrop.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  doc.addEventListener('keydown', onKey);

  requestAnimationFrame(() => {
    viewport.focus();
    applyDiagramState(viewport, { zoomOut, reset, zoomIn });
  });

  lightboxCleanup = () => {
    cleanup();
    closeBtn.removeEventListener('click', onCloseClick);
    backdrop.removeEventListener('mousedown', onBackdrop);
    doc.removeEventListener('keydown', onKey);
    backdrop.remove();
    for (const sibling of inertSiblings) sibling.element.inert = sibling.inert;
    doc.body.style.overflow = previousOverflow;
    pinch = undefined;
    previousFocus?.focus();
  };
}

/* ── Diagram state helpers ────────────────────────────────────────── */

function applyDiagramState(
  viewport: HTMLElement,
  buttons: { zoomOut: HTMLButtonElement; reset: HTMLButtonElement; zoomIn: HTMLButtonElement },
): void {
  const state = readDiagramState(viewport);
  const svg = viewport.querySelector<SVGSVGElement>('svg');
  if (svg) svg.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
  viewport.dataset.diagramScale = String(state.scale);
  viewport.dataset.diagramPanX = String(state.panX);
  viewport.dataset.diagramPanY = String(state.panY);
  viewport.dataset.diagramZoomed = state.scale > 1 ? 'true' : 'false';
  viewport.dataset.diagramReady = svg ? 'true' : 'false';
  const percent = `${Math.round(state.scale * 100)}%`;
  buttons.reset.textContent = percent;
  buttons.reset.setAttribute('aria-label', `${buttons.reset.title}: ${percent}`);
  const unavailable = !svg;
  buttons.zoomOut.disabled = unavailable || state.scale <= MIN_DIAGRAM_SCALE;
  buttons.zoomIn.disabled = unavailable || state.scale >= MAX_DIAGRAM_SCALE;
  buttons.reset.disabled = unavailable || (state.scale === 1 && state.panX === 0 && state.panY === 0);
}

function bindDiagramInteractions(
  viewport: HTMLElement,
  buttons: {
    zoomOut: HTMLButtonElement;
    reset: HTMLButtonElement;
    zoomIn: HTMLButtonElement;
    expand: HTMLButtonElement | null;
  },
  labels: DocumentEnhancementLabels,
  callbacks: { onExpand?: () => void; onClose?: () => void } = {},
): () => void {
  const { zoomOut, reset, zoomIn, expand } = buttons;
  const cleanups: Array<() => void> = [];

  const apply = () => applyDiagramState(viewport, { zoomOut, reset, zoomIn });
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

  cleanups.push(() => {
    zoomOut.removeEventListener('click', onZoomOut);
    zoomIn.removeEventListener('click', onZoomIn);
    reset.removeEventListener('click', resetView);
  });

  let dragStart: { clientX: number; clientY: number; panX: number; panY: number; pointerId: number } | undefined;

  const onPointerDown = (event: PointerEvent) => {
    if (!(event.target as Element)?.closest('svg')) return;
    if (dragStart) return;
    viewport.setPointerCapture?.(event.pointerId);
    const state = readDiagramState(viewport);
    dragStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      panX: state.panX,
      panY: state.panY,
      pointerId: event.pointerId,
    };
    viewport.classList.add('is-dragging');
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragStart && event.pointerId === dragStart.pointerId) {
      update(
        readDiagramState(viewport).scale,
        dragStart.panX + event.clientX - dragStart.clientX,
        dragStart.panY + event.clientY - dragStart.clientY,
      );
      return;
    }
    if (pinch) {
      const p = pinch.pointers.get(event.pointerId);
      if (!p) return;
      p.clientX = event.clientX;
      p.clientY = event.clientY;
      if (pinch.pointers.size < 2) return;
      const pts = [...pinch.pointers.values()];
      const dist = pinchDistance(pts[0]!, pts[1]!);
      if (dist < 20) return;
      const ratio = dist / pinch.baseDistance;
      const newScale = Math.min(MAX_DIAGRAM_SCALE, Math.max(MIN_DIAGRAM_SCALE, pinch.baseScale * ratio));
      const scaleRatio = newScale / pinch.baseScale;
      viewport.dataset.diagramScale = String(newScale);
      viewport.dataset.diagramPanX = String(pinch.midX - (pinch.midX - pinch.basePanX) * scaleRatio);
      viewport.dataset.diagramPanY = String(pinch.midY - (pinch.midY - pinch.basePanY) * scaleRatio);
      apply();
    }
  };

  const stopDragging = (event: PointerEvent) => {
    if (dragStart && event.pointerId === dragStart.pointerId) {
      viewport.releasePointerCapture?.(event.pointerId);
      viewport.classList.remove('is-dragging');
      dragStart = undefined;
    }
  };

  const endPointer = (event: PointerEvent) => {
    stopDragging(event);
    if (pinch) {
      pinch.pointers.delete(event.pointerId);
      if (pinch.pointers.size < 2) pinch = undefined;
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (pinch && pinch.pointers.has(event.pointerId)) {
      endPointer(event);
      return;
    }
    stopDragging(event);
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (pinch && pinch.pointers.has(event.pointerId)) {
      endPointer(event);
      return;
    }
    stopDragging(event);
  };

  const onGotPointerCapture = (event: PointerEvent) => {
    if (dragStart && event.pointerId !== dragStart.pointerId) {
      const state = readDiagramState(viewport);
      const pts: Array<{ clientX: number; clientY: number }> = [
        { clientX: dragStart.clientX, clientY: dragStart.clientY },
        { clientX: event.clientX, clientY: event.clientY },
      ];
      const dist = pinchDistance(pts[0]!, pts[1]!);
      const rect = viewport.getBoundingClientRect();
      const dragPointerId = dragStart.pointerId;
      const p0 = pts[0]!;
      const p1 = pts[1]!;
      pinch = {
        pointers: new Map<number, { clientX: number; clientY: number }>([
          [dragPointerId, p0],
          [event.pointerId, p1],
        ]),
        baseDistance: dist,
        baseScale: state.scale,
        basePanX: state.panX,
        basePanY: state.panY,
        midX: (p0.clientX + p1.clientX) / 2 - rect.left,
        midY: (p0.clientY + p1.clientY) / 2 - rect.top,
      };
      viewport.classList.remove('is-dragging');
      dragStart = undefined;
      viewport.releasePointerCapture?.(event.pointerId);
    }
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
    else if (event.key === 'Escape' && callbacks.onClose) {
      event.preventDefault();
      callbacks.onClose();
      return;
    } else if (viewport.querySelector('svg') && event.key.startsWith('Arrow')) {
      const amount = event.shiftKey ? 40 : 16;
      update(
        state.scale,
        state.panX + (event.key === 'ArrowLeft' ? amount : event.key === 'ArrowRight' ? -amount : 0),
        state.panY + (event.key === 'ArrowUp' ? amount : event.key === 'ArrowDown' ? -amount : 0),
      );
    } else return;
    event.preventDefault();
  };

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerCancel);
  viewport.addEventListener('gotpointercapture', onGotPointerCapture);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('keydown', onKeyDown);

  const Observer = viewport.ownerDocument.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(apply) : undefined;
  observer?.observe(viewport, { childList: true });

  cleanups.push(() => {
    viewport.removeEventListener('pointerdown', onPointerDown);
    viewport.removeEventListener('pointermove', onPointerMove);
    viewport.removeEventListener('pointerup', onPointerUp);
    viewport.removeEventListener('pointercancel', onPointerCancel);
    viewport.removeEventListener('gotpointercapture', onGotPointerCapture);
    viewport.removeEventListener('wheel', onWheel);
    viewport.removeEventListener('keydown', onKeyDown);
    observer?.disconnect();
  });

  if (expand) {
    const onExpand = () => openLightbox(viewport.parentElement!, viewport, labels);
    expand.addEventListener('click', onExpand);
    cleanups.push(() => expand.removeEventListener('click', onExpand));
  }

  apply();
  return () => cleanups.forEach((fn) => fn());
}

/* ── Public entry point ───────────────────────────────────────────── */

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
    let expand = toolbar.querySelector<HTMLButtonElement>('[data-diagram-action="expand"]');
    if (!zoomOut || !reset || !zoomIn || !expand) {
      toolbar.replaceChildren();
      zoomOut = createControl(article.ownerDocument, 'diagram-control', labels.zoomOut, '−');
      zoomOut.dataset.diagramAction = 'zoom-out';
      reset = createControl(article.ownerDocument, 'diagram-control diagram-zoom-value', labels.resetZoom, '100%');
      reset.dataset.diagramAction = 'reset';
      reset.setAttribute('aria-live', 'polite');
      zoomIn = createControl(article.ownerDocument, 'diagram-control', labels.zoomIn, '+');
      zoomIn.dataset.diagramAction = 'zoom-in';
      expand = createControl(article.ownerDocument, 'diagram-control', labels.expandDiagram, '⛶');
      expand.dataset.diagramAction = 'expand';
      toolbar.append(zoomOut, reset, zoomIn, expand);
    }
    zoomOut.setAttribute('aria-label', labels.zoomOut);
    zoomOut.title = labels.zoomOut;
    zoomIn.setAttribute('aria-label', labels.zoomIn);
    zoomIn.title = labels.zoomIn;
    expand!.setAttribute('aria-label', labels.expandDiagram);
    expand!.title = labels.expandDiagram;
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', labels.interactiveDiagram);

    const cleanup = bindDiagramInteractions(viewport, { zoomOut, reset, zoomIn, expand: expand! }, labels);
    cleanups.push(cleanup);
  }

  return () => {
    closeLightbox();
    cleanups.forEach((fn) => fn());
  };
}
