export interface WorkspaceNavigationEntry {
  workspaceId: string;
  filePath: string;
  fragment?: string;
}

export interface WorkspaceNavigationState {
  entries: WorkspaceNavigationEntry[];
  index: number;
}

export type WorkspaceNavigationAction =
  | { type: 'push'; entry: WorkspaceNavigationEntry }
  | { type: 'move'; index: number }
  | { type: 'select'; entry: WorkspaceNavigationEntry };

export const initialWorkspaceNavigation: WorkspaceNavigationState = { entries: [], index: -1 };

function sameEntry(left: WorkspaceNavigationEntry, right: WorkspaceNavigationEntry): boolean {
  return left.workspaceId === right.workspaceId && left.filePath === right.filePath && left.fragment === right.fragment;
}

export function workspaceNavigationReducer(state: WorkspaceNavigationState, action: WorkspaceNavigationAction): WorkspaceNavigationState {
  if (action.type === 'push') {
    if (state.index >= 0 && sameEntry(state.entries[state.index]!, action.entry)) return state;
    const entries = [...state.entries.slice(0, state.index + 1), action.entry];
    return { entries, index: entries.length - 1 };
  }
  if (action.type === 'select') {
    const index = state.entries.findIndex((entry) => sameEntry(entry, action.entry));
    if (index >= 0) return { ...state, index };
    const entries = [...state.entries, action.entry];
    return { entries, index: entries.length - 1 };
  }
  return action.index >= 0 && action.index < state.entries.length ? { ...state, index: action.index } : state;
}
