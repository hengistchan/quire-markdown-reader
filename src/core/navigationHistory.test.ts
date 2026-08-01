import { describe, expect, it } from 'vitest';
import { initialWorkspaceNavigation, workspaceNavigationReducer } from './navigationHistory';

describe('workspace navigation history', () => {
  it('supports back, forward, deduplication, and forward-branch replacement', () => {
    const first = { workspaceId: 'docs', filePath: 'README.md' };
    const second = { workspaceId: 'docs', filePath: 'guide.md', fragment: 'setup' };
    const third = { workspaceId: 'docs', filePath: 'api.md' };
    let state = workspaceNavigationReducer(initialWorkspaceNavigation, { type: 'push', entry: first });
    state = workspaceNavigationReducer(state, { type: 'push', entry: second });
    state = workspaceNavigationReducer(state, { type: 'push', entry: second });
    expect(state).toEqual({ entries: [first, second], index: 1 });

    state = workspaceNavigationReducer(state, { type: 'move', index: 0 });
    expect(state.entries[state.index]).toEqual(first);
    state = workspaceNavigationReducer(state, { type: 'push', entry: third });
    expect(state).toEqual({ entries: [first, third], index: 1 });
  });
});
