import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReaderController } from '../../../application/reader/readerController';
import { defaultSettings } from '../../../shared/defaultSettings';
import { createTranslator, resolveLocale } from '../../../shared/i18n';
import type { ReaderSettings } from '../../../shared/types';
import { useSystemTheme } from './useSystemTheme';

export function useReaderSettings(controller: ReaderController) {
  const [settings, setSettings] = useState<ReaderSettings>(defaultSettings);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<ReaderSettings | undefined>(undefined);
  const systemTheme = useSystemTheme();
  const locale = resolveLocale(settings.locale);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const resolvedTheme = settings.theme === 'system' ? systemTheme : settings.theme;

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      pending.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = undefined;
        pending.current = undefined;
        void controller.saveSettings(next);
      }, 200);
      return next;
    });
  }, [controller]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pending.current) void controller.saveSettings(pending.current);
  }, [controller]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = locale;
  }, [locale, resolvedTheme]);

  return {
    settings,
    replace: setSettings,
    update,
    reset: () => update(defaultSettings),
    resolvedTheme,
    locale,
    t,
  };
}
