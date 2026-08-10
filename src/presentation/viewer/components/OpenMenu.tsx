import { useEffect, useRef } from 'react';
import type { RecentResource } from '../../../application/ports/recentResourceRepository';
import type { ShortcutLabels } from '../../../core/shortcuts';
import type { Translator } from './types';
import { OpenActions } from './OpenActions';
import { RecentResourceList } from './RecentResourceList';

export function OpenMenu({
  t, shortcuts, recent, onFile, onFolder, onUrl, onRecent, onRemoveRecent, onViewAllRecent, onClose,
}: {
  t: Translator;
  shortcuts: ShortcutLabels;
  recent: RecentResource[];
  onFile: () => void;
  onFolder: () => void;
  onUrl: () => void;
  onRecent: (resource: RecentResource) => void;
  onRemoveRecent: (id: string) => void;
  onViewAllRecent: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => menuRef.current?.focus(), []);

  const navigate = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[data-open-menu-primary="true"]:not(:disabled)',
    )];
    if (!rows.length) return;
    const active = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Enter') {
      if (active < 0) {
        event.preventDefault();
        rows[0]?.click();
      }
      return;
    }
    event.preventDefault();
    const next = event.key === 'ArrowDown'
      ? (active + 1) % rows.length
      : (active <= 0 ? rows.length - 1 : active - 1);
    rows[next]?.focus();
  };

  return <div
    ref={menuRef}
    className="popover-menu open-menu"
    tabIndex={-1}
    aria-label={t('openContent')}
    onKeyDown={navigate}
  >
    {recent.length > 0 ? <RecentResourceList
      items={recent}
      t={t}
      onOpen={onRecent}
      onRemove={onRemoveRecent}
      onViewAll={onViewAllRecent}
    /> : null}
    <OpenActions
      t={t}
      shortcuts={shortcuts}
      onFile={onFile}
      onFolder={onFolder}
      onUrl={onUrl}
    />
  </div>;
}
