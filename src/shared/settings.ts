import type { ReaderSettings } from './types';

export const defaultSettings: ReaderSettings = {
  locale: 'system',
  theme: 'system',
  fontFamily: 'sans',
  fontSize: 18,
  lineHeight: 1.76,
  contentWidth: 760,
  wideView: false,
  showReadingProgress: true,
  showOutline: true,
  autoRefresh: true,
  enableKatex: true,
  enableMermaid: true,
  enableHtml: false,
  customCss: '',
};

const STORAGE_KEY = 'reader-settings';

export async function loadSettings(): Promise<ReaderSettings> {
  if (typeof browser === 'undefined' || !browser.storage) return defaultSettings;
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return { ...defaultSettings, ...(stored[STORAGE_KEY] as Partial<ReaderSettings> | undefined) };
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage) return;
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}
