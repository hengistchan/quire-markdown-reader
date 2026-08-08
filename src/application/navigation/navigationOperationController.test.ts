import { describe, expect, it } from 'vitest';
import { NavigationOperationController } from './navigationOperationController';

describe('NavigationOperationController', () => {
  it('aborts the previous operation when a new navigation begins', () => {
    const controller = new NavigationOperationController();
    const first = controller.begin();

    const second = controller.begin();

    expect(first.aborted).toBe(true);
    expect(first.reason).toBeInstanceOf(DOMException);
    expect(second.aborted).toBe(false);
  });

  it('cancels the active operation without affecting a later one', () => {
    const controller = new NavigationOperationController();
    const cancelled = controller.begin();

    controller.cancel();
    const next = controller.begin();

    expect(cancelled.aborted).toBe(true);
    expect(next.aborted).toBe(false);
  });
});
