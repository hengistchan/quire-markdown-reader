import { sameNavigationTarget, type NavigationTarget } from '../../domain/navigation/navigationTarget';
import type { BrowserHistoryEntry, BrowserHistoryPort } from './browserHistory';

export interface NavigationSnapshot {
  current?: NavigationTarget;
  canGoBack: boolean;
  canGoForward: boolean;
}

export type NavigationIntent = 'push' | 'replace' | 'traverse';

export type NavigationListener = (snapshot: NavigationSnapshot, intent: NavigationIntent) => void;

export class NavigationController {
  private target?: NavigationTarget;
  private index: number;
  private maxIndex: number;
  private readonly listeners = new Set<NavigationListener>();

  constructor(private readonly history: BrowserHistoryPort) {
    const entry = history.current();
    this.target = entry.target;
    this.index = entry.index;
    this.maxIndex = entry.index;
    this.history.replace(entry);
    this.history.subscribe((next) => this.traverse(next));
  }

  current(): NavigationSnapshot {
    return this.snapshot();
  }

  push(target: NavigationTarget): void {
    if (sameNavigationTarget(this.target, target)) {
      this.replace(target);
      return;
    }
    this.index += 1;
    this.maxIndex = this.index;
    this.target = target;
    this.history.push({ target, index: this.index });
    this.notify('push');
  }

  replace(target: NavigationTarget): void {
    this.target = target;
    this.history.replace({ target, index: this.index });
    this.notify('replace');
  }

  pushFragment(fragment?: string): NavigationTarget | undefined {
    if (!this.target) return undefined;
    const target = { ...this.target, fragment };
    this.push(target);
    return target;
  }

  back(): void {
    this.history.back();
  }

  forward(): void {
    this.history.forward();
  }

  subscribe(listener: NavigationListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot(), 'replace');
    return () => this.listeners.delete(listener);
  }

  private traverse(entry: BrowserHistoryEntry): void {
    this.target = entry.target;
    this.index = entry.index;
    this.maxIndex = Math.max(this.maxIndex, entry.index);
    this.notify('traverse');
  }

  private snapshot(): NavigationSnapshot {
    return {
      current: this.target,
      canGoBack: this.index > 0,
      canGoForward: this.index < this.maxIndex,
    };
  }

  private notify(intent: NavigationIntent): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot, intent);
  }
}
