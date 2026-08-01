import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, loadSettings, saveSettings, SETTINGS_SCHEMA_VERSION } from './settings';

describe('reader settings storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('merges older stored settings with current defaults', async () => {
    const set = vi.fn(async () => undefined);
    const get = vi.fn(async () => ({ 'reader-settings': { theme: 'dark', fontSize: 22 } }));
    vi.stubGlobal('browser', { storage: { local: { get, set } } });
    await expect(loadSettings()).resolves.toEqual({ ...defaultSettings, theme: 'dark', fontSize: 22 });
    expect(set).toHaveBeenCalledWith({
      'reader-settings': {
        version: SETTINGS_SCHEMA_VERSION,
        settings: { ...defaultSettings, theme: 'dark', fontSize: 22 },
      },
    });
  });

  it('validates fields, ignores unknown data, and backs up repaired values', async () => {
    const set = vi.fn(async () => undefined);
    const raw = {
      version: SETTINGS_SCHEMA_VERSION,
      settings: { ...defaultSettings, theme: 'neon', fontSize: 200, extra: 'ignored' },
    };
    const get = vi.fn(async () => ({ 'reader-settings': raw }));
    vi.stubGlobal('browser', { storage: { local: { get, set } } });

    await expect(loadSettings()).resolves.toEqual(defaultSettings);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      'reader-settings': { version: SETTINGS_SCHEMA_VERSION, settings: defaultSettings },
      'reader-settings-backup': expect.objectContaining({ value: raw }),
    }));
  });

  it('recovers from an unsupported or corrupted schema', async () => {
    const set = vi.fn(async () => undefined);
    const raw = { version: 99, settings: { theme: 'dark' } };
    const get = vi.fn(async () => ({ 'reader-settings': raw }));
    vi.stubGlobal('browser', { storage: { local: { get, set } } });

    await expect(loadSettings()).resolves.toEqual(defaultSettings);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      'reader-settings': { version: SETTINGS_SCHEMA_VERSION, settings: defaultSettings },
      'reader-settings-backup': expect.objectContaining({ value: raw }),
    }));
  });

  it('saves the complete settings contract', async () => {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('browser', { storage: { local: { get: vi.fn(), set } } });
    const settings = { ...defaultSettings, locale: 'zh-CN' as const, autoRefresh: false };
    await saveSettings(settings);
    expect(set).toHaveBeenCalledWith({
      'reader-settings': { version: SETTINGS_SCHEMA_VERSION, settings },
    });
  });

  it('uses defaults outside an extension context', async () => {
    vi.stubGlobal('browser', undefined);
    await expect(loadSettings()).resolves.toEqual(defaultSettings);
    await expect(saveSettings(defaultSettings)).resolves.toBeUndefined();
  });
});
