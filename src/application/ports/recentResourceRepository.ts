export interface RecentResourceBase {
  id: string;
  title: string;

  /**
   * Last time the resource was explicitly opened through an Open or
   * Recent Resource action. Internal document navigation must not update it.
   */
  openedAt: number;
}

export interface RecentWorkspaceResource extends RecentResourceBase {
  kind: 'workspace';
  workspaceId: string;
  lastFilePath?: string;
}

export interface RecentLocalFileResource extends RecentResourceBase {
  kind: 'local-file';
  fileId: string;
}

export interface RecentRemoteResource extends RecentResourceBase {
  kind: 'remote';
  url: string;
}

export type RecentResource = RecentWorkspaceResource | RecentLocalFileResource | RecentRemoteResource;

export type RecentResourceInput = RecentResource extends infer Resource
  ? Resource extends RecentResource
    ? Omit<Resource, 'openedAt'>
    : never
  : never;

export interface RecentResourceRepository {
  list(): Promise<RecentResource[]>;
  put(resource: RecentResourceInput): Promise<RecentResource[]>;
  remove(id: string): Promise<RecentResource[]>;
  updateWorkspaceDocument(workspaceId: string, filePath: string): Promise<RecentResource[]>;
}
