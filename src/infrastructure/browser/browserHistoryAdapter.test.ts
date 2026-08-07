import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigationTarget } from '../../domain/navigation/navigationTarget';
import { BrowserHistoryAdapter } from './browserHistoryAdapter';

describe('BrowserHistoryAdapter', () => {
  beforeEach(() => history.replaceState(null, '', '/viewer.html?handoff=temporary'));

  it('exposes workspace identity and the active Markdown path in the address', () => {
    const adapter = new BrowserHistoryAdapter(window);
    const target: NavigationTarget = {
      document: { kind: 'workspace-file', workspaceId: 'workspace-1', filePath: 'docs/guide.md' },
      fragment: 'getting started',
    };

    adapter.push({ target, index: 1 });

    expect(location.pathname).toBe('/viewer.html');
    expect(location.search).toBe('?workspace=workspace-1&file=docs%2Fguide.md');
    expect(location.hash).toBe('#getting%20started');
    expect(adapter.current()).toEqual({ target, index: 1 });
  });

  it.each([
    [
      { document: { kind: 'local-file' as const, fileId: 'local-1' } },
      '?local=local-1',
    ],
    [
      { document: { kind: 'remote' as const, url: 'https://example.com/guide.md?mode=full' } },
      '?remote=https%3A%2F%2Fexample.com%2Fguide.md%3Fmode%3Dfull',
    ],
    [
      { document: { kind: 'imported' as const, sessionId: 'session 1' } },
      '?imported=session+1',
    ],
  ])('writes and restores a non-workspace target: %s', (target, search) => {
    const adapter = new BrowserHistoryAdapter(window);
    adapter.replace({ target, index: 0 });

    expect(location.search).toBe(search);
    expect(adapter.current()).toEqual({ target, index: 0 });
  });

  it('restores a workspace target from a directly opened route', () => {
    history.replaceState(null, '', '/viewer.html?workspace=workspace-2&file=notes%2Ftoday.md#tasks');

    expect(new BrowserHistoryAdapter(window).current()).toEqual({
      target: {
        document: { kind: 'workspace-file', workspaceId: 'workspace-2', filePath: 'notes/today.md' },
        fragment: 'tasks',
      },
      index: 0,
    });
  });

  it.each([
    [{ version: 1, target: { document: { kind: 'remote', url: 'https://example.com/legacy.md' } } }],
    [{ quireWorkspaceNavigation: { workspaceId: 'legacy', filePath: 'README.md', fragment: 'intro' } }],
  ])('migrates a legacy history state: %s', (state) => {
    history.replaceState(state, '', '/viewer.html');
    const adapter = new BrowserHistoryAdapter(window);

    expect(adapter.current()).toMatchObject({ index: 0, target: expect.any(Object) });
  });

  it('reports traversal to the initial targetless entry', () => {
    const adapter = new BrowserHistoryAdapter(window);
    const listener = vi.fn();
    adapter.subscribe(listener);
    history.replaceState({ version: 2, index: 0 }, '', '/viewer.html');

    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));

    expect(listener).toHaveBeenCalledWith({ index: 0, target: undefined });
  });
});
