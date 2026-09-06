import type { BrowserHistoryEntry, BrowserHistoryPort } from '../../application/navigation/browserHistory';
import {
  isNavigationTarget,
  type LegacyIndexedQuireHistoryState,
  type LegacyQuireHistoryState,
  type NavigationTarget,
  type QuireHistoryState,
} from '../../domain/navigation/navigationTarget';

interface LegacyWorkspaceHistoryState {
  quireWorkspaceNavigation?: { workspaceId?: unknown; filePath?: unknown; fragment?: unknown };
}

const WORKSPACE_PARAMETER = 'workspace';
const FILE_PARAMETER = 'file';
const LOCAL_FILE_PARAMETER = 'local';
const REMOTE_PARAMETER = 'remote';
const IMPORTED_PARAMETER = 'imported';

function decodedFragment(location: Location): string | undefined {
  if (!location.hash) return undefined;
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return location.hash.slice(1);
  }
}

function targetFromLocation(location: Location): NavigationTarget | undefined {
  const query = new URLSearchParams(location.search);
  const workspaceId = query.get(WORKSPACE_PARAMETER);
  const filePath = query.get(FILE_PARAMETER);
  const fragment = decodedFragment(location);
  if (workspaceId && filePath) return { document: { kind: 'workspace-file', workspaceId, filePath }, fragment };
  const fileId = query.get(LOCAL_FILE_PARAMETER);
  if (fileId) return { document: { kind: 'local-file', fileId }, fragment };
  const remoteUrl = query.get(REMOTE_PARAMETER);
  if (remoteUrl) return { document: { kind: 'remote', url: remoteUrl }, fragment };
  const sessionId = query.get(IMPORTED_PARAMETER);
  if (sessionId) return { document: { kind: 'imported', sessionId }, fragment };
  return undefined;
}

function entryFromState(state: unknown): BrowserHistoryEntry | undefined {
  if (state && typeof state === 'object') {
    const current = state as Partial<QuireHistoryState>;
    if (
      current.version === 3 &&
      typeof current.index === 'number' &&
      Number.isInteger(current.index) &&
      current.index >= 0 &&
      typeof current.maxIndex === 'number' &&
      Number.isInteger(current.maxIndex) &&
      current.maxIndex >= current.index &&
      (current.target === undefined || isNavigationTarget(current.target))
    ) {
      return { target: current.target, index: current.index, maxIndex: current.maxIndex };
    }
    const versionTwo = state as Partial<LegacyIndexedQuireHistoryState>;
    if (
      versionTwo.version === 2 &&
      typeof versionTwo.index === 'number' &&
      Number.isInteger(versionTwo.index) &&
      versionTwo.index >= 0 &&
      (versionTwo.target === undefined || isNavigationTarget(versionTwo.target))
    ) {
      return { target: versionTwo.target, index: versionTwo.index, maxIndex: versionTwo.index };
    }
    const versionOne = state as Partial<LegacyQuireHistoryState>;
    if (versionOne.version === 1 && isNavigationTarget(versionOne.target)) {
      return { target: versionOne.target, index: 0, maxIndex: 0 };
    }
    const legacy = (state as LegacyWorkspaceHistoryState).quireWorkspaceNavigation;
    if (legacy && typeof legacy.workspaceId === 'string' && typeof legacy.filePath === 'string') {
      return {
        index: 0,
        maxIndex: 0,
        target: {
          document: { kind: 'workspace-file', workspaceId: legacy.workspaceId, filePath: legacy.filePath },
          fragment: typeof legacy.fragment === 'string' ? legacy.fragment : undefined,
        },
      };
    }
  }
  return undefined;
}

export class BrowserHistoryAdapter implements BrowserHistoryPort {
  constructor(
    private readonly browserWindow: Window,
    private readonly browserHistory: History = browserWindow.history,
    private readonly browserLocation: Location = browserWindow.location,
  ) {}

  current(): BrowserHistoryEntry {
    return (
      entryFromState(this.browserHistory.state) ?? {
        target: targetFromLocation(this.browserLocation),
        index: 0,
        maxIndex: 0,
      }
    );
  }

  push(entry: BrowserHistoryEntry): void {
    this.browserHistory.pushState({ version: 3, ...entry } satisfies QuireHistoryState, '', this.url(entry.target));
  }

  replace(entry: BrowserHistoryEntry): void {
    this.browserHistory.replaceState({ version: 3, ...entry } satisfies QuireHistoryState, '', this.url(entry.target));
  }

  back(): void {
    this.browserHistory.back();
  }

  forward(): void {
    this.browserHistory.forward();
  }

  subscribe(listener: (entry: BrowserHistoryEntry) => void): () => void {
    const onPopState = (event: PopStateEvent) => {
      listener(
        entryFromState(event.state) ?? {
          target: targetFromLocation(this.browserLocation),
          index: 0,
          maxIndex: 0,
        },
      );
    };
    this.browserWindow.addEventListener('popstate', onPopState);
    return () => this.browserWindow.removeEventListener('popstate', onPopState);
  }

  private url(target?: NavigationTarget): string {
    const query = new URLSearchParams(this.browserLocation.search);
    query.delete('handoff');
    query.delete(WORKSPACE_PARAMETER);
    query.delete(FILE_PARAMETER);
    query.delete(LOCAL_FILE_PARAMETER);
    query.delete(REMOTE_PARAMETER);
    query.delete(IMPORTED_PARAMETER);
    if (target?.document.kind === 'workspace-file') {
      query.set(WORKSPACE_PARAMETER, target.document.workspaceId);
      query.set(FILE_PARAMETER, target.document.filePath);
    } else if (target?.document.kind === 'local-file') {
      query.set(LOCAL_FILE_PARAMETER, target.document.fileId);
    } else if (target?.document.kind === 'remote') {
      query.set(REMOTE_PARAMETER, target.document.url);
    } else if (target?.document.kind === 'imported') {
      query.set(IMPORTED_PARAMETER, target.document.sessionId);
    }
    const search = query.toString();
    const base = `${this.browserLocation.pathname}${search ? `?${search}` : ''}`;
    return target?.fragment ? `${base}#${encodeURIComponent(target.fragment)}` : base;
  }
}
