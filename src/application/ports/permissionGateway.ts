export interface PermissionGateway {
  hasRemoteOrigin(url: string): Promise<boolean>;
  requestRemoteOrigin(url: string): Promise<boolean>;
  queryRead(handle: FileSystemHandle): Promise<PermissionState>;
  requestRead(handle: FileSystemHandle): Promise<PermissionState>;
}
