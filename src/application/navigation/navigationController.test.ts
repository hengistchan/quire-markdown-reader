import { describe, expect, it, vi } from 'vitest';
import type { NavigationTarget } from '../../domain/navigation/navigationTarget';
import type { BrowserHistoryEntry, BrowserHistoryPort } from './browserHistory';
import { NavigationController } from './navigationController';

function fakeHistory(current: BrowserHistoryEntry = { index: 0, maxIndex: 0 }) {
  let listener: ((entry: BrowserHistoryEntry) => void) | undefined;
  const port: BrowserHistoryPort = {
    current: vi.fn(() => current),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    subscribe: vi.fn((next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
  };
  return { port, traverse: (entry: BrowserHistoryEntry) => listener?.(entry) };
}

const workspace = (filePath: string, fragment?: string): NavigationTarget => ({
  document: { kind: 'workspace-file', workspaceId: 'docs', filePath },
  fragment,
});

describe('NavigationController', () => {
  it('starts from and normalizes the current history entry', () => {
    const target = workspace('Guide.md');
    const history = fakeHistory({ target, index: 3, maxIndex: 5 });
    const controller = new NavigationController(history.port);

    expect(controller.current()).toEqual({ current: target, canGoBack: true, canGoForward: true });
    expect(history.port.replace).toHaveBeenCalledWith({ target, index: 3, maxIndex: 5 });
  });

  it('restores the back and forward range after reload and truncates it on a new push', () => {
    const reloaded = workspace('B.md');
    const replacement = workspace('D.md');
    const history = fakeHistory({ target: reloaded, index: 1, maxIndex: 2 });
    const controller = new NavigationController(history.port);

    expect(controller.current()).toEqual({ current: reloaded, canGoBack: true, canGoForward: true });
    controller.push(replacement);

    expect(history.port.replace).toHaveBeenLastCalledWith({ target: reloaded, index: 1, maxIndex: 2 });
    expect(history.port.push).toHaveBeenCalledWith({ target: replacement, index: 2, maxIndex: 2 });
    expect(controller.current()).toEqual({ current: replacement, canGoBack: true, canGoForward: false });
  });

  it('publishes navigation state for replace, push, back, and forward intents', () => {
    const history = fakeHistory();
    const controller = new NavigationController(history.port);
    const listener = vi.fn();
    const first = workspace('README.md');
    const second = workspace('Guide.md', 'setup');
    controller.subscribe(listener);

    controller.replace(first);
    controller.push(second);
    controller.back();
    history.traverse({ target: first, index: 0, maxIndex: 1 });
    controller.forward();
    history.traverse({ target: second, index: 1, maxIndex: 1 });

    expect(history.port.replace).toHaveBeenLastCalledWith({ target: first, index: 0, maxIndex: 1 });
    expect(history.port.push).toHaveBeenCalledWith({ target: second, index: 1, maxIndex: 1 });
    expect(history.port.back).toHaveBeenCalledOnce();
    expect(history.port.forward).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenLastCalledWith({ current: second, canGoBack: true, canGoForward: false }, 'traverse');
  });

  it('pushes fragments through the same indexed history', () => {
    const target = workspace('Guide.md');
    const history = fakeHistory({ target, index: 0, maxIndex: 0 });
    const controller = new NavigationController(history.port);

    expect(controller.pushFragment('install')).toEqual({ ...target, fragment: 'install' });
    expect(history.port.replace).toHaveBeenLastCalledWith({ target, index: 0, maxIndex: 1 });
    expect(history.port.push).toHaveBeenCalledWith({
      target: { ...target, fragment: 'install' },
      index: 1,
      maxIndex: 1,
    });
    expect(controller.current()).toEqual({
      current: { ...target, fragment: 'install' },
      canGoBack: true,
      canGoForward: false,
    });
  });

  it('replaces an identical target instead of creating a duplicate entry', () => {
    const target = workspace('Guide.md');
    const history = fakeHistory({ target, index: 2, maxIndex: 4 });
    const controller = new NavigationController(history.port);
    vi.mocked(history.port.replace).mockClear();

    controller.push(target);

    expect(history.port.push).not.toHaveBeenCalled();
    expect(history.port.replace).toHaveBeenCalledWith({ target, index: 2, maxIndex: 4 });
    expect(controller.current()).toEqual({ current: target, canGoBack: true, canGoForward: true });
  });

  it('truncates the logical forward range after a new push', () => {
    const first = workspace('A.md');
    const second = workspace('B.md');
    const third = workspace('C.md');
    const replacement = workspace('D.md');
    const history = fakeHistory({ target: first, index: 0, maxIndex: 0 });
    const controller = new NavigationController(history.port);
    controller.push(second);
    controller.push(third);
    history.traverse({ target: second, index: 1, maxIndex: 2 });

    expect(controller.current().canGoForward).toBe(true);
    controller.push(replacement);

    expect(history.port.replace).toHaveBeenLastCalledWith({ target: second, index: 1, maxIndex: 2 });
    expect(history.port.push).toHaveBeenLastCalledWith({ target: replacement, index: 2, maxIndex: 2 });
    expect(controller.current()).toEqual({ current: replacement, canGoBack: true, canGoForward: false });
  });

  it('loads a traversed target without writing another history entry', () => {
    const history = fakeHistory();
    const controller = new NavigationController(history.port);
    const listener = vi.fn();
    controller.subscribe(listener);
    vi.mocked(history.port.replace).mockClear();
    const target: NavigationTarget = {
      document: { kind: 'remote', url: 'https://example.com/README.md' },
      fragment: 'usage',
    };

    history.traverse({ target, index: 1, maxIndex: 3 });

    expect(listener).toHaveBeenLastCalledWith({ current: target, canGoBack: true, canGoForward: true }, 'traverse');
    expect(history.port.push).not.toHaveBeenCalled();
    expect(history.port.replace).not.toHaveBeenCalled();
  });
});
