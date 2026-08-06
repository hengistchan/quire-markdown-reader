import { useCallback, useEffect, useState } from 'react';

interface DocumentNavigationRequest {
  id: number;
  fragment?: string;
}

export function useDocumentNavigation(onHeading: (id: string) => void): (fragment?: string) => void {
  const [request, setRequest] = useState<DocumentNavigationRequest>();

  const navigate = useCallback((fragment?: string) => {
    setRequest((current) => ({ id: (current?.id ?? 0) + 1, fragment }));
  }, []);

  useEffect(() => {
    if (!request) return;
    const frame = requestAnimationFrame(() => {
      if (!request.fragment) return;
      const target = document.getElementById(request.fragment);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (target) onHeading(request.fragment);
    });
    return () => cancelAnimationFrame(frame);
  }, [onHeading, request]);

  return navigate;
}
