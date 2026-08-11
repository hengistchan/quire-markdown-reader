import type {
  RecentResource, RecentResourceInput, RecentResourceRepository,
} from '../ports/recentResourceRepository';

export function normalizeRecentRemoteUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.href;
}

/**
 * Keeps Recent Resources optional: persistence failures must never prevent a
 * document that already opened successfully from becoming the active document.
 */
export class RecentResourceService {
  private snapshot: RecentResource[] = [];

  constructor(private readonly repository: RecentResourceRepository) {}

  async list(): Promise<RecentResource[]> {
    try {
      this.snapshot = await this.repository.list();
    } catch {
      // Recent Resources are an optional convenience.
    }
    return this.snapshot;
  }

  async remember(resource: RecentResourceInput): Promise<RecentResource[]> {
    try {
      this.snapshot = await this.repository.put(resource);
    } catch {
      // The primary Open flow has already succeeded.
    }
    return this.snapshot;
  }

  async remove(id: string): Promise<RecentResource[]> {
    try {
      this.snapshot = await this.repository.remove(id);
    } catch {
      // Removing a convenience entry must not affect the active document.
    }
    return this.snapshot;
  }

  async updateWorkspaceDocument(workspaceId: string, filePath: string): Promise<RecentResource[]> {
    try {
      this.snapshot = await this.repository.updateWorkspaceDocument(workspaceId, filePath);
    } catch {
      // Workspace navigation remains successful even if metadata cannot persist.
    }
    return this.snapshot;
  }
}
