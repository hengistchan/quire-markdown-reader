import { describe, expect, it } from 'vitest';
import { createShortcutLabels } from './shortcuts';

describe('createShortcutLabels', () => {
  it('uses macOS symbols only on Apple platforms', () => {
    expect(createShortcutLabels('MacIntel')).toEqual({
      command: '⌘K',
      openFile: '⌘O',
      openFolder: '⇧⌘O',
      openUrl: '⌘L',
    });
  });

  it.each(['Win32', 'Linux x86_64'])('uses explicit Ctrl labels on %s', (platform) => {
    expect(createShortcutLabels(platform)).toEqual({
      command: 'Ctrl+K',
      openFile: 'Ctrl+O',
      openFolder: 'Ctrl+Shift+O',
      openUrl: 'Ctrl+L',
    });
  });
});
