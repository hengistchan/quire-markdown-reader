import type { NavigationTarget } from '../../domain/navigation/navigationTarget';

export interface BrowserHistoryEntry {
  target?: NavigationTarget;
  index: number;
  maxIndex: number;
}

export interface BrowserHistoryPort {
  current(): BrowserHistoryEntry;
  push(entry: BrowserHistoryEntry): void;
  replace(entry: BrowserHistoryEntry): void;
  back(): void;
  forward(): void;
  subscribe(listener: (entry: BrowserHistoryEntry) => void): () => void;
}
