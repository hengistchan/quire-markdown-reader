import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavigationIntent, NavigationSnapshot } from '../../../application/navigation/navigationController';
import type { ReaderController } from '../../../application/reader/readerController';
import type { NavigationTarget } from '../../../domain/navigation/navigationTarget';

export interface ReaderNavigationModel extends NavigationSnapshot {
  record(target: NavigationTarget, intent: Exclude<NavigationIntent, 'traverse'>): void;
  pushFragment(fragment?: string): void;
  back(): void;
  forward(): void;
}

export function useReaderNavigation(
  controller: ReaderController,
  onTraverse: (target?: NavigationTarget) => void,
): ReaderNavigationModel {
  const [snapshot, setSnapshot] = useState<NavigationSnapshot>(() => controller.current());
  const onTraverseRef = useRef(onTraverse);
  onTraverseRef.current = onTraverse;

  useEffect(() => controller.subscribe((next, intent) => {
    setSnapshot(next);
    if (intent === 'traverse') onTraverseRef.current(next.current);
  }), [controller]);

  const record = useCallback((target: NavigationTarget, intent: Exclude<NavigationIntent, 'traverse'>) => {
    controller[intent](target);
  }, [controller]);

  return {
    ...snapshot,
    record,
    pushFragment: (fragment) => controller.pushFragment(fragment),
    back: () => controller.back(),
    forward: () => controller.forward(),
  };
}
