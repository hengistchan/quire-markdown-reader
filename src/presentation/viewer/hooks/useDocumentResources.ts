import { useEffect, type RefObject } from 'react';
import type { DocumentResourceResolver } from '../../../application/documents/documentResource';

export function useDocumentResources(
  articleRef: RefObject<HTMLElement | null>,
  documentHtml: string,
  resolver: DocumentResourceResolver,
  unavailableMessage: string,
  options: { loadRemoteImages: boolean; referrerPolicy: 'no-referrer' | 'origin' },
): void {
  useEffect(() => {
    if (!articleRef.current) return;
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const resolveImage = async (image: HTMLImageElement) => {
      if (image.dataset.resourceState) return;
      const raw = image.getAttribute('src');
      if (!raw) return;
      const remote = /^(?:https?:)?\/\//i.test(raw);
      if (remote && !options.loadRemoteImages) {
        image.removeAttribute('src');
        image.dataset.resourceState = 'blocked';
        return;
      }
      image.dataset.resourceState = 'resolving';
      const result = await resolver.resolveAsset(raw);
      if (cancelled) return;
      if (result.type === 'unavailable') {
        if (result.reason === 'unsupported') {
          delete image.dataset.resourceState;
          image.loading = 'lazy';
          image.decoding = 'async';
          image.referrerPolicy = options.referrerPolicy;
          return;
        }
        image.dataset.resourceError = 'true';
        image.dataset.resourceState = 'error';
        image.alt = `${image.alt || raw} — ${unavailableMessage}`;
        return;
      }
      if (result.type === 'url' && !options.loadRemoteImages && /^https?:/i.test(result.url)) {
        image.removeAttribute('src');
        image.dataset.resourceState = 'blocked';
        return;
      }
      image.src = result.url;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = options.referrerPolicy;
      image.dataset.resourceState = 'ready';
    };
    const images = [...articleRef.current.querySelectorAll<HTMLImageElement>('img[src]')];
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          void resolveImage(entry.target as HTMLImageElement);
        }
      }, { rootMargin: '500px 0px' });
      for (const image of images) observer.observe(image);
    } else {
      for (const image of images) void resolveImage(image);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [articleRef, documentHtml, options.loadRemoteImages, options.referrerPolicy, resolver, unavailableMessage]);
}
