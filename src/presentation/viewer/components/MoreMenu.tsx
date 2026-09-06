import { Command, ListTree, Settings2 } from 'lucide-react';
import type { Translator } from './types';

export function MoreMenu({
  t,
  commandShortcut,
  onCommand,
  onOutline,
  onSettings,
}: {
  t: Translator;
  commandShortcut: string;
  onCommand: () => void;
  onOutline: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="popover-menu more-menu">
      <button onClick={onCommand}>
        <Command />
        <span>{t('commandCenter')}</span>
        <kbd>{commandShortcut}</kbd>
      </button>
      <button onClick={onOutline}>
        <ListTree />
        <span>{t('toggleOutline')}</span>
      </button>
      <button onClick={onSettings}>
        <Settings2 />
        <span>{t('settings')}</span>
      </button>
    </div>
  );
}
