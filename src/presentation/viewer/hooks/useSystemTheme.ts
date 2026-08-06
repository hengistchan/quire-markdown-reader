import { useEffect, useState } from 'react';

function getSystemTheme(): 'light' | 'dark' {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useSystemTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(getSystemTheme);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setTheme(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return theme;
}
