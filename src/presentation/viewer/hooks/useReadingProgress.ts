import { useEffect, useState } from 'react';

export function useReadingProgress(): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      setProgress(max <= 0 ? 0 : Math.min(100, (scrollY / max) * 100));
    };
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  }, []);
  return progress;
}
