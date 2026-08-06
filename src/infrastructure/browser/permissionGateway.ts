import type { PermissionGateway } from '../../application/ports/permissionGateway';
import { hostPermissionPattern } from '../../core/paths';

export class BrowserPermissionGateway implements PermissionGateway {
  constructor(private readonly api: typeof browser | undefined = typeof browser === 'undefined' ? undefined : browser) {}

  async requestRemoteOrigin(url: string): Promise<boolean> {
    if (!this.api) return true;
    return this.api.permissions.request({ origins: [hostPermissionPattern(url)] });
  }

  async requestRead(handle: FileSystemHandle): Promise<PermissionState> {
    const permissionHandle = handle as FileSystemHandle & {
      queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
      requestPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
    };
    const current = await permissionHandle.queryPermission?.({ mode: 'read' });
    if (current === 'granted') return current;
    return await permissionHandle.requestPermission?.({ mode: 'read' }) ?? 'granted';
  }
}
