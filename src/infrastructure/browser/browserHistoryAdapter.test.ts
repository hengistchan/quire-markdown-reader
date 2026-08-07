import { beforeEach, describe, expect, it } from 'vitest';
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

    adapter.push(target);

    expect(location.pathname).toBe('/viewer.html');
    expect(location.search).toBe('?workspace=workspace-1&file=docs%2Fguide.md');
    expect(location.hash).toBe('#getting%20started');
    expect(adapter.current()).toEqual(target);
  });

  it('restores a workspace target from a directly opened route', () => {
    history.replaceState(null, '', '/viewer.html?workspace=workspace-2&file=notes%2Ftoday.md#tasks');

    expect(new BrowserHistoryAdapter(window).current()).toEqual({
      document: { kind: 'workspace-file', workspaceId: 'workspace-2', filePath: 'notes/today.md' },
      fragment: 'tasks',
    });
  });

  it('removes workspace parameters when navigation leaves the workspace', () => {
    history.replaceState(null, '', '/viewer.html?workspace=workspace-1&file=README.md');
    const adapter = new BrowserHistoryAdapter(window);

    adapter.replace({ document: { kind: 'remote', url: 'https://example.com/guide.md' } });

    expect(location.pathname + location.search + location.hash).toBe('/viewer.html');
  });
});
