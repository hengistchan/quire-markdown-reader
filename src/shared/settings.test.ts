import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, loadSettings, saveSettings } from './settings';

describe('reader settings storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('merges older stored settings with current defaults', async () => {
    const get = vi.fn(async () => ({ 'reader-settings': { theme: 'dark', fontSize: 22 } }));
    vi.stubGlobal('browser', { storage: { local: { get, set: vi.fn() } } });
    await expect(loadSettings()).resolves.toEqual({ ...defaultSettings, theme: 'dark', fontSize: 22 });
  });

  it('saves the complete settings contract', async () => {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('browser', { storage: { local: { get: vi.fn(), set } } });
    const settings = { ...defaultSettings, locale: 'zh-CN' as const, autoRefresh: false };
    await saveSettings(settings);
    expect(set).toHaveBeenCalledWith({ 'reader-settings': settings });
  });

  it('uses defaults outside an extension context', async () => {
    vi.stubGlobal('browser', undefined);
    await expect(loadSettings()).resolves.toBe(defaultSettings);
    await expect(saveSettings(defaultSettings)).resolves.toBeUndefined();
  });
});
