import type { PermissionGateway } from '../../application/ports/permissionGateway';
import { hostPermissionPattern } from '../../core/paths';

export class BrowserPermissionGateway implements PermissionGateway {
  constructor(
    private readonly api: typeof browser | undefined = typeof browser === 'undefined' ? undefined : browser,
  ) {}

  async hasRemoteOrigin(url: string): Promise<boolean> {
    if (!this.api) return true;
    return this.api.permissions.contains({ origins: [hostPermissionPattern(url)] });
  }

  async requestRemoteOrigin(url: string): Promise<boolean> {
    if (!this.api) return true;
    return this.api.permissions.request({ origins: [hostPermissionPattern(url)] });
  }

  async requestRead(handle: FileSystemHandle): Promise<PermissionState> {
    const current = await this.queryRead(handle);
    if (current === 'granted') return current;
    const permissionHandle = handle as FileSystemHandle & {
      requestPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
    };
    return (await permissionHandle.requestPermission?.({ mode: 'read' })) ?? 'granted';
  }

  async queryRead(handle: FileSystemHandle): Promise<PermissionState> {
    const permissionHandle = handle as FileSystemHandle & {
      queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
    };
    return (await permissionHandle.queryPermission?.({ mode: 'read' })) ?? 'granted';
  }
}
