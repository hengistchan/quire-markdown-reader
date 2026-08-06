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
  enableHtml: true,
  loadRemoteImages: true,
  remoteImageReferrerPolicy: 'no-referrer',
  customCss: '',
};
