import { useEffect, useRef } from 'react';

export interface ReaderShortcuts {
  openCommand(): void;
  openFile(): void;
  openFolder(): void;
  openUrl(): void;
  close(): void;
}

export function useKeyboardShortcuts(shortcuts: ReaderShortcuts): void {
  const current = useRef(shortcuts);
  current.current = shortcuts;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'k') {
        event.preventDefault();
        current.current.openCommand();
      } else if (modifier && key === 'o') {
        event.preventDefault();
        if (event.shiftKey) current.current.openFolder();
        else current.current.openFile();
      } else if (modifier && key === 'l') {
        event.preventDefault();
        current.current.openUrl();
      }
      if (event.key === 'Escape') current.current.close();
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, []);
}
