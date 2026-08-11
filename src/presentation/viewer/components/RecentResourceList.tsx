import type { RecentResource } from '../../../application/ports/recentResourceRepository';
import type { Translator } from './types';
import { RecentResourceRow } from './RecentResourceRow';

export const OPEN_MENU_RECENT_LIMIT = 5;

export function RecentResourceList({ items, t, onOpen, onRemove, onViewAll }: {
  items: RecentResource[];
  t: Translator;
  onOpen: (resource: RecentResource) => void;
  onRemove: (id: string) => void;
  onViewAll: () => void;
}) {
  return <section className="open-menu-section recent-resource-section" aria-label={t('recentlyOpened')}>
    <label>{t('recentlyOpened')}</label>
    {items.slice(0, OPEN_MENU_RECENT_LIMIT).map((resource) => (
      <RecentResourceRow
        key={resource.id}
        resource={resource}
        t={t}
        onOpen={onOpen}
        onRemove={onRemove}
      />
    ))}
    <button
      className="view-all-recent"
      data-open-menu-primary="true"
      onClick={onViewAll}
    >
      <span>{t('viewAllRecent')}</span>
    </button>
  </section>;
}
