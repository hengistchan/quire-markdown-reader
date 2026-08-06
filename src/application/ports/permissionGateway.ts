export interface PermissionGateway {
  requestRemoteOrigin(url: string): Promise<boolean>;
  requestRead(handle: FileSystemHandle): Promise<PermissionState>;
}
