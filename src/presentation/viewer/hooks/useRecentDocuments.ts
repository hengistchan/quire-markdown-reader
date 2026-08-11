import { useCallback, useState } from 'react';
import type { RecentItem, RecentItemInput } from '../../../application/ports/recentRepository';
import type { ReaderController } from '../../../application/reader/readerController';
import type { DocumentSession } from '../../../domain/documentSession';
import { useReadingPosition } from './useReadingPosition';

interface ResumeTarget {
  scrollPosition: number;
  headingId?: string;
}

function recentId(session: DocumentSession): string | undefined {
  if (session.kind === 'remote') return `remote:${session.state.url}`;
  if (session.kind === 'workspace' && session.workspace.id) {
    return `workspace-file:${session.workspace.id}:${session.file.path}`;
  }
  if (session.kind === 'file' && session.file.id.startsWith('file:')) {
    return `local-file:${session.file.id.slice('file:'.length)}`;
  }
  return undefined;
}

export function useRecentDocuments(
  controller: ReaderController,
  session: DocumentSession,
  activeHeadingId?: string,
) {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget>();

  useReadingPosition(
    recentId(session),
    activeHeadingId,
    (id, position, headingId) => controller.updateRecentPosition(id, position, headingId),
    setItems,
  );

  const record = useCallback(async (item: RecentItemInput, signal?: AbortSignal) => {
    const nextItems = await controller.rememberRecent(item);
    if (!signal?.aborted) setItems(nextItems);
  }, [controller]);

  const prepareResume = useCallback((item: RecentItem) => {
    if ((item.scrollPosition ?? 0) > 80 || item.headingId) {
      setResumeTarget({ scrollPosition: item.scrollPosition ?? 0, headingId: item.headingId });
    } else {
      setResumeTarget(undefined);
    }
  }, []);

  const continueReading = () => {
    const target = resumeTarget;
    setResumeTarget(undefined);
    requestAnimationFrame(() => {
      const heading = target?.headingId ? document.getElementById(target.headingId) : undefined;
      if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else scrollTo({ top: target?.scrollPosition ?? 0, behavior: 'smooth' });
    });
  };

  return {
    items,
    replace: setItems,
    record,
    resumeTarget,
    clearResume: () => setResumeTarget(undefined),
    prepareResume,
    continueReading,
    startFromTop: () => {
      setResumeTarget(undefined);
      scrollTo({ top: 0, behavior: 'smooth' });
    },
  };
}
