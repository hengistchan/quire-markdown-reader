import { describe, expect, it, vi } from 'vitest';
import { BrowserPermissionGateway } from './permissionGateway';

describe('BrowserPermissionGateway', () => {
  it('checks remote and file permissions without prompting', async () => {
    const contains = vi.fn(async () => false);
    const request = vi.fn(async () => true);
    const gateway = new BrowserPermissionGateway({
      permissions: { contains, request },
    } as unknown as typeof browser);
    const requestPermission = vi.fn(async () => 'granted' as PermissionState);
    const handle = {
      queryPermission: vi.fn(async () => 'prompt' as PermissionState),
      requestPermission,
    } as unknown as FileSystemHandle;

    await expect(gateway.hasRemoteOrigin('https://docs.example.com/readme.md')).resolves.toBe(false);
    await expect(gateway.queryRead(handle)).resolves.toBe('prompt');

    expect(contains).toHaveBeenCalledWith({ origins: ['https://docs.example.com/*'] });
    expect(request).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('requests access only through explicit request methods', async () => {
    const request = vi.fn(async () => true);
    const gateway = new BrowserPermissionGateway({
      permissions: { contains: vi.fn(async () => false), request },
    } as unknown as typeof browser);
    const requestPermission = vi.fn(async () => 'granted' as PermissionState);
    const handle = {
      queryPermission: vi.fn(async () => 'prompt' as PermissionState),
      requestPermission,
    } as unknown as FileSystemHandle;

    await expect(gateway.requestRemoteOrigin('https://docs.example.com/readme.md')).resolves.toBe(true);
    await expect(gateway.requestRead(handle)).resolves.toBe('granted');

    expect(request).toHaveBeenCalledOnce();
    expect(requestPermission).toHaveBeenCalledOnce();
  });
});
