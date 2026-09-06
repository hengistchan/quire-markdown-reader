export const MERMAID_THEME_VARIABLES_VERSION = 'quire-visual-v2';

export interface ResolvedMermaidTheme {
  cacheVersion: string;
  theme: 'base';
  themeVariables: Record<string, string | boolean>;
}

export function resolveMermaidTheme(root: HTMLElement, readerTheme: 'light' | 'dark'): ResolvedMermaidTheme {
  const styles = getComputedStyle(root);
  const read = (token: string, fallback: string) => styles.getPropertyValue(token).trim() || fallback;
  const surfaceDocument = read('--surface-document', 'transparent');
  const surfaceElevated = read('--surface-elevated', surfaceDocument);
  const surfaceMuted = read('--surface-muted', surfaceDocument);
  const textStrong = read('--text-strong', 'currentColor');
  const textPrimary = read('--text-primary', textStrong);
  const textSecondary = read('--text-secondary', textPrimary);
  const border = read('--border', textSecondary);
  const borderStrong = read('--border-strong', border);
  const accent = read('--accent', borderStrong);
  const accentSoft = read('--accent-soft', surfaceMuted);
  const success = read('--success', accent);
  const successSoft = read('--success-soft', surfaceMuted);
  const warning = read('--warning', accent);
  const warningSoft = read('--warning-soft', surfaceMuted);
  const danger = read('--danger', accent);
  const dangerSoft = read('--danger-soft', surfaceMuted);
  const fontFamily = read('--font-reading-sans', 'ui-sans-serif, system-ui, sans-serif');

  return {
    cacheVersion: `${MERMAID_THEME_VARIABLES_VERSION}:${readerTheme}`,
    theme: 'base',
    themeVariables: {
      darkMode: readerTheme === 'dark',
      background: surfaceMuted,
      textColor: textPrimary,
      titleColor: textStrong,
      primaryColor: accentSoft,
      primaryTextColor: textStrong,
      primaryBorderColor: accent,
      secondaryColor: surfaceElevated,
      secondaryTextColor: textPrimary,
      secondaryBorderColor: borderStrong,
      tertiaryColor: surfaceDocument,
      tertiaryTextColor: textPrimary,
      tertiaryBorderColor: border,
      lineColor: borderStrong,
      mainBkg: surfaceElevated,
      nodeBorder: borderStrong,
      nodeTextColor: textStrong,
      clusterBkg: surfaceDocument,
      clusterBorder: border,
      edgeLabelBackground: surfaceMuted,
      actorBkg: surfaceElevated,
      actorBorder: borderStrong,
      actorTextColor: textStrong,
      actorLineColor: border,
      signalColor: borderStrong,
      signalTextColor: textPrimary,
      labelBoxBkgColor: surfaceElevated,
      labelBoxBorderColor: border,
      labelTextColor: textPrimary,
      loopTextColor: textSecondary,
      noteBkgColor: warningSoft,
      noteBorderColor: warning,
      noteTextColor: textStrong,
      activationBkgColor: accentSoft,
      activationBorderColor: accent,
      sequenceNumberColor: textStrong,
      sectionBkgColor: surfaceElevated,
      altSectionBkgColor: surfaceMuted,
      gridColor: border,
      taskBkgColor: surfaceElevated,
      taskBorderColor: borderStrong,
      taskTextColor: textPrimary,
      taskTextDarkColor: textStrong,
      taskTextOutsideColor: textSecondary,
      activeTaskBkgColor: accentSoft,
      activeTaskBorderColor: accent,
      doneTaskBkgColor: successSoft,
      doneTaskBorderColor: success,
      critBkgColor: dangerSoft,
      critBorderColor: danger,
      todayLineColor: accent,
      cScale0: accentSoft,
      cScale1: successSoft,
      cScale2: warningSoft,
      cScale3: dangerSoft,
      cScaleLabel0: textStrong,
      cScaleLabel1: textStrong,
      cScaleLabel2: textStrong,
      cScaleLabel3: textStrong,
      pie1: accent,
      pie2: success,
      pie3: warning,
      pie4: danger,
      pieTitleTextColor: textStrong,
      pieSectionTextColor: surfaceDocument,
      pieLegendTextColor: textPrimary,
      fontFamily,
    },
  };
}
