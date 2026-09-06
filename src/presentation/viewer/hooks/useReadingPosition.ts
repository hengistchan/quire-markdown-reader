import { useEffect, useRef } from 'react';

export function useReadingPosition<T>(
  documentId: string | undefined,
  headingId: string | undefined,
  persist: (documentId: string, scrollPosition: number, headingId?: string) => Promise<T>,
  onPersisted: (value: T) => void,
): void {
  const heading = useRef(headingId);
  const persistRef = useRef(persist);
  const onPersistedRef = useRef(onPersisted);
  heading.current = headingId;
  persistRef.current = persist;
  onPersistedRef.current = onPersisted;

  useEffect(() => {
    if (!documentId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let position = Math.max(0, scrollY);
    const save = () => {
      timer = undefined;
      void persistRef
        .current(documentId, position, heading.current)
        .then((value) => onPersistedRef.current(value))
        .catch(() => undefined);
    };
    const schedule = () => {
      position = Math.max(0, scrollY);
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 800);
    };
    addEventListener('scroll', schedule, { passive: true });
    return () => {
      removeEventListener('scroll', schedule);
      if (timer) clearTimeout(timer);
      save();
    };
  }, [documentId]);
}
