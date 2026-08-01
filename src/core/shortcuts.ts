export interface ShortcutLabels {
  command: string;
  openFile: string;
  openFolder: string;
  openUrl: string;
}

export function createShortcutLabels(platform = navigator.platform): ShortcutLabels {
  const apple = /Mac|iPhone|iPad|iPod/i.test(platform);
  if (apple) {
    return { command: '⌘K', openFile: '⌘O', openFolder: '⇧⌘O', openUrl: '⌘L' };
  }
  return { command: 'Ctrl+K', openFile: 'Ctrl+O', openFolder: 'Ctrl+Shift+O', openUrl: 'Ctrl+L' };
}
