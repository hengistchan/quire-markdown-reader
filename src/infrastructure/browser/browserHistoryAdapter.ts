import type { BrowserHistoryPort } from '../../application/navigation/browserHistory';
import {
  isNavigationTarget, type NavigationTarget, type QuireHistoryState,
} from '../../domain/navigation/navigationTarget';

interface LegacyWorkspaceHistoryState {
  quireWorkspaceNavigation?: { workspaceId?: unknown; filePath?: unknown; fragment?: unknown };
}

const WORKSPACE_PARAMETER = 'workspace';
const FILE_PARAMETER = 'file';

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
  if (!workspaceId || !filePath) return undefined;
  return {
    document: { kind: 'workspace-file', workspaceId, filePath },
    fragment: decodedFragment(location),
  };
}

function targetFromState(state: unknown): NavigationTarget | undefined {
  if (state && typeof state === 'object') {
    const current = state as Partial<QuireHistoryState>;
    if (current.version === 1 && isNavigationTarget(current.target)) return current.target;
    const legacy = (state as LegacyWorkspaceHistoryState).quireWorkspaceNavigation;
    if (legacy && typeof legacy.workspaceId === 'string' && typeof legacy.filePath === 'string') {
      return {
        document: { kind: 'workspace-file', workspaceId: legacy.workspaceId, filePath: legacy.filePath },
        fragment: typeof legacy.fragment === 'string' ? legacy.fragment : undefined,
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

  current(): NavigationTarget | undefined {
    return targetFromState(this.browserHistory.state) ?? targetFromLocation(this.browserLocation);
  }

  push(target: NavigationTarget): void {
    this.browserHistory.pushState({ version: 1, target } satisfies QuireHistoryState, '', this.url(target));
  }

  replace(target: NavigationTarget): void {
    this.browserHistory.replaceState({ version: 1, target } satisfies QuireHistoryState, '', this.url(target));
  }

  back(): void {
    this.browserHistory.back();
  }

  forward(): void {
    this.browserHistory.forward();
  }

  subscribe(listener: (target: NavigationTarget) => void): () => void {
    const onPopState = (event: PopStateEvent) => {
      const target = targetFromState(event.state);
      if (target) listener(target);
    };
    this.browserWindow.addEventListener('popstate', onPopState);
    return () => this.browserWindow.removeEventListener('popstate', onPopState);
  }

  private url(target: NavigationTarget): string {
    const query = new URLSearchParams(this.browserLocation.search);
    query.delete('handoff');
    query.delete(WORKSPACE_PARAMETER);
    query.delete(FILE_PARAMETER);
    if (target.document.kind === 'workspace-file') {
      query.set(WORKSPACE_PARAMETER, target.document.workspaceId);
      query.set(FILE_PARAMETER, target.document.filePath);
    }
    const search = query.toString();
    const base = `${this.browserLocation.pathname}${search ? `?${search}` : ''}`;
    return target.fragment ? `${base}#${encodeURIComponent(target.fragment)}` : base;
  }
}
