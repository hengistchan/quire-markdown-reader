import type { NavigationTarget } from '../../domain/navigation/navigationTarget';

export interface BrowserHistoryPort {
  push(target: NavigationTarget): void;
  replace(target: NavigationTarget): void;
  back(): void;
  forward(): void;
  subscribe(listener: (target: NavigationTarget) => void): () => void;
}
