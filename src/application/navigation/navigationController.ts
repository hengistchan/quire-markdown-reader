import type { NavigationTarget } from '../../domain/navigation/navigationTarget';
import type { BrowserHistoryPort } from './browserHistory';

export class NavigationController {
  private target?: NavigationTarget;

  constructor(private readonly history: BrowserHistoryPort) {}

  current(): NavigationTarget | undefined {
    return this.target;
  }

  push(target: NavigationTarget): void {
    this.target = target;
    this.history.push(target);
  }

  replace(target: NavigationTarget): void {
    this.target = target;
    this.history.replace(target);
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

  subscribe(listener: (target: NavigationTarget) => void): () => void {
    return this.history.subscribe((target) => {
      this.target = target;
      listener(target);
    });
  }
}
