import { describe, expect, it, vi } from 'vitest';
import type { NavigationTarget } from '../../domain/navigation/navigationTarget';
import type { BrowserHistoryPort } from './browserHistory';
import { NavigationController } from './navigationController';

function fakeHistory() {
  let listener: ((target: NavigationTarget) => void) | undefined;
  const port: BrowserHistoryPort = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    subscribe: vi.fn((next) => { listener = next; return () => { listener = undefined; }; }),
  };
  return { port, traverse: (target: NavigationTarget) => listener?.(target) };
}

describe('NavigationController', () => {
  it('is the only writer for push, replace, back, and forward intents', () => {
    const history = fakeHistory();
    const controller = new NavigationController(history.port);
    const first: NavigationTarget = { document: { kind: 'workspace-file', workspaceId: 'docs', filePath: 'README.md' } };
    const second: NavigationTarget = { document: { kind: 'workspace-file', workspaceId: 'docs', filePath: 'Guide.md' }, fragment: 'setup' };

    controller.replace(first);
    controller.push(second);
    controller.back();
    controller.forward();

    expect(history.port.replace).toHaveBeenCalledWith(first);
    expect(history.port.push).toHaveBeenCalledWith(second);
    expect(history.port.back).toHaveBeenCalledOnce();
    expect(history.port.forward).toHaveBeenCalledOnce();
  });

  it('does not write another history entry during traversal', () => {
    const history = fakeHistory();
    const controller = new NavigationController(history.port);
    const listener = vi.fn();
    controller.subscribe(listener);
    const target: NavigationTarget = { document: { kind: 'remote', url: 'https://example.com/README.md' }, fragment: 'usage' };

    history.traverse(target);

    expect(listener).toHaveBeenCalledWith(target);
    expect(controller.current()).toEqual(target);
    expect(history.port.push).not.toHaveBeenCalled();
    expect(history.port.replace).not.toHaveBeenCalled();
  });
});
