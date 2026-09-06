import { useEffect, useState } from 'react';

export type ActiveOverlay = 'open-menu' | 'more-menu' | 'command' | 'settings' | 'url-dialog' | null;

export function useReaderOverlay() {
  const [active, setActive] = useState<ActiveOverlay>(null);
  const openMenuOpen = active === 'open-menu';
  const moreMenuOpen = active === 'more-menu';

  useEffect(() => {
    if (!openMenuOpen && !moreMenuOpen) return;
    const closeMenus = (event: PointerEvent) => {
      if ((event.target as Element).closest('.menu-anchor')) return;
      setActive(null);
    };
    addEventListener('pointerdown', closeMenus);
    return () => removeEventListener('pointerdown', closeMenus);
  }, [moreMenuOpen, openMenuOpen]);

  return {
    active,
    setActive,
    open: (name: Exclude<ActiveOverlay, null>) => setActive(name),
    close: () => setActive(null),
    toggle: (name: Exclude<ActiveOverlay, null>) => setActive((current) => (current === name ? null : name)),
    openMenuOpen,
    moreMenuOpen,
    commandOpen: active === 'command',
    settingsOpen: active === 'settings',
    urlOpen: active === 'url-dialog',
  };
}
