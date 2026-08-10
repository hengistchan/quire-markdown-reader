import type { createTranslator } from '../../../shared/i18n';

export type Translator = ReturnType<typeof createTranslator>;
export type CommandPaletteMode = 'default' | 'recent';
