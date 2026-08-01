import { describe, expect, it } from 'vitest';
import { createTranslator, resolveLocale } from './i18n';

describe('reader localization', () => {
  it('resolves Chinese browser locales and defaults other systems to English', () => {
    expect(resolveLocale('system', 'zh-Hans-CN')).toBe('zh-CN');
    expect(resolveLocale('system', 'en-GB')).toBe('en');
    expect(resolveLocale('en', 'zh-CN')).toBe('en');
  });

  it('provides complete English and Chinese messages', () => {
    expect(createTranslator('en')('openFolder')).toBe('Open folder');
    expect(createTranslator('zh-CN')('openFolder')).toBe('打开文件夹');
    expect(createTranslator('zh-CN')('privateByDesign')).toBeTruthy();
    expect(createTranslator('en')('localFile')).toBe('Local file');
    expect(createTranslator('zh-CN')('localFile')).toBe('本地文件');
    expect(createTranslator('zh-CN')('welcomeDocument')).toContain('# 欢迎使用 Quire');
    expect(createTranslator('zh-CN')('remoteTooLarge')).toContain('5 MB');
  });
});
