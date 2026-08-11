import type { ReaderSettings } from '../../shared/types';
import type { SettingsRepository } from '../../application/ports/settingsRepository';
import { defaultSettings, MAX_READER_WIDTH, MIN_READER_WIDTH } from '../../shared/defaultSettings';

export { defaultSettings } from '../../shared/defaultSettings';

const STORAGE_KEY = 'reader-settings';
const BACKUP_KEY = 'reader-settings-backup';
const PREVIOUS_SETTINGS_SCHEMA_VERSIONS = new Set([2, 3]);
export const SETTINGS_SCHEMA_VERSION = 4;

interface PersistedReaderSettings {
  version: typeof SETTINGS_SCHEMA_VERSION;
  settings: ReaderSettings;
}

type SettingsRecord = Record<string, unknown>;

function isRecord(value: unknown): value is SettingsRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function numberValue(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeSettings(value: unknown, missingIsRepair = true): { settings: ReaderSettings; repaired: boolean } {
  if (!isRecord(value)) return { settings: { ...defaultSettings }, repaired: true };
  const settings: ReaderSettings = {
    locale: enumValue(value.locale, ['system', 'en', 'zh-CN'], defaultSettings.locale),
    theme: enumValue(value.theme, ['system', 'light', 'dark'], defaultSettings.theme),
    fontFamily: enumValue(value.fontFamily, ['sans', 'serif'], defaultSettings.fontFamily),
    fontSize: numberValue(value.fontSize, 15, 24, defaultSettings.fontSize),
    lineHeight: numberValue(value.lineHeight, 1.45, 2, defaultSettings.lineHeight),
    contentWidth: numberValue(value.contentWidth, MIN_READER_WIDTH, MAX_READER_WIDTH, defaultSettings.contentWidth),
    wideView: booleanValue(value.wideView, defaultSettings.wideView),
    showReadingProgress: booleanValue(value.showReadingProgress, defaultSettings.showReadingProgress),
    showOutline: booleanValue(value.showOutline, defaultSettings.showOutline),
    autoRefresh: booleanValue(value.autoRefresh, defaultSettings.autoRefresh),
    enableKatex: booleanValue(value.enableKatex, defaultSettings.enableKatex),
    enableMermaid: booleanValue(value.enableMermaid, defaultSettings.enableMermaid),
    enableHtml: booleanValue(value.enableHtml, defaultSettings.enableHtml),
    loadRemoteImages: booleanValue(value.loadRemoteImages, defaultSettings.loadRemoteImages),
    remoteImageReferrerPolicy: enumValue(
      value.remoteImageReferrerPolicy,
      ['no-referrer', 'origin'],
      defaultSettings.remoteImageReferrerPolicy,
    ),
    customCss: typeof value.customCss === 'string' ? value.customCss : defaultSettings.customCss,
  };
  const repaired = (Object.keys(defaultSettings) as (keyof ReaderSettings)[])
    .some((key) => key in value ? value[key] !== settings[key] : missingIsRepair);
  return { settings, repaired };
}

function persistedSettings(settings: ReaderSettings): PersistedReaderSettings {
  return { version: SETTINGS_SCHEMA_VERSION, settings };
}

export async function loadSettings(): Promise<ReaderSettings> {
  if (typeof browser === 'undefined' || !browser.storage) return { ...defaultSettings };
  let raw: unknown;
  try {
    raw = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  } catch {
    return { ...defaultSettings };
  }
  if (raw === undefined) return { ...defaultSettings };

  const record = isRecord(raw) ? raw : undefined;
  const envelope = record?.version === SETTINGS_SCHEMA_VERSION && 'settings' in record;
  const previousSettings = typeof record?.version === 'number'
    && PREVIOUS_SETTINGS_SCHEMA_VERSIONS.has(record.version)
    && isRecord(record.settings)
    ? record.settings
    : undefined;
  const previousEnvelope = previousSettings !== undefined;
  const legacy = record !== undefined && !('version' in record);
  const settingsSource = previousEnvelope
    ? { ...previousSettings, enableHtml: record?.version === 2 ? true : previousSettings.enableHtml }
    : envelope ? record.settings : legacy ? record : undefined;
  const normalized = normalizeSettings(settingsSource, !legacy);
  const needsBackup = previousEnvelope || !envelope && !legacy || normalized.repaired;
  const needsMigration = previousEnvelope || legacy || normalized.repaired;

  if (needsBackup || needsMigration) {
    const update: Record<string, unknown> = {
      [STORAGE_KEY]: persistedSettings(normalized.settings),
    };
    if (needsBackup) update[BACKUP_KEY] = { value: raw, backedUpAt: Date.now() };
    try {
      await browser.storage.local.set(update);
    } catch {
      // A storage failure must not prevent the reader from opening with safe settings.
    }
  }
  return normalized.settings;
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage) return;
  await browser.storage.local.set({ [STORAGE_KEY]: persistedSettings(normalizeSettings(settings).settings) });
}

export class BrowserSettingsRepository implements SettingsRepository {
  load(): Promise<ReaderSettings> {
    return loadSettings();
  }

  save(settings: ReaderSettings): Promise<void> {
    return saveSettings(settings);
  }
}
