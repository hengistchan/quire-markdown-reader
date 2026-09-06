import { File, Folder, Globe2, X } from 'lucide-react';
import type { RecentResource } from '../../../application/ports/recentResourceRepository';
import type { Translator } from './types';

export function recentResourceDetail(resource: RecentResource, t: Translator): string {
  if (resource.kind === 'workspace') return t('workspace');
  if (resource.kind === 'local-file') return t('localFile');
  try {
    return new URL(resource.url).hostname;
  } catch {
    return t('fromWeb');
  }
}

export function RecentResourceIcon({ resource }: { resource: RecentResource }) {
  if (resource.kind === 'workspace') return <Folder />;
  if (resource.kind === 'remote') return <Globe2 />;
  return <File />;
}

export function RecentResourceRow({
  resource,
  t,
  onOpen,
  onRemove,
}: {
  resource: RecentResource;
  t: Translator;
  onOpen: (resource: RecentResource) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="recent-resource-row">
      <button className="recent-resource-main" data-open-menu-primary="true" onClick={() => onOpen(resource)}>
        <RecentResourceIcon resource={resource} />
        <span>
          <strong>{resource.title}</strong>
          <small>{recentResourceDetail(resource, t)}</small>
        </span>
      </button>
      <button
        className="recent-resource-remove"
        aria-label={`${t('removeFromRecent')}: ${resource.title}`}
        title={t('removeFromRecent')}
        onClick={() => onRemove(resource.id)}
      >
        <X />
      </button>
    </div>
  );
}
