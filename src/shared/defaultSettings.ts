import type { ReaderSettings } from './types';

export const MIN_READER_WIDTH = 560;
export const MAX_READER_WIDTH = 980;
export const WIDE_READER_WIDTH = 1200;

export const defaultSettings: ReaderSettings = {
  locale: 'system',
  theme: 'system',
  fontFamily: 'sans',
  fontSize: 18,
  lineHeight: 1.76,
  contentWidth: MAX_READER_WIDTH,
  wideView: true,
  showReadingProgress: true,
  showOutline: true,
  autoRefresh: true,
  enableKatex: true,
  enableMermaid: true,
  enableHtml: true,
  loadRemoteImages: false,
  remoteImageReferrerPolicy: 'no-referrer',
  customCss: '',
};
