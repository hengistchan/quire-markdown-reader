import { afterEach, describe, expect, it, vi } from 'vitest';
import { MERMAID_THEME_VARIABLES_VERSION, resolveMermaidTheme } from './mermaidTheme';

describe('Mermaid visual theme', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads computed CSS tokens once and maps them into the base theme', () => {
    const values: Record<string, string> = {
      '--surface-document': '#fbfaf7',
      '--surface-elevated': '#fffdf9',
      '--surface-muted': '#efebe4',
      '--text-strong': '#171512',
      '--text-primary': '#2d2925',
      '--text-secondary': '#625c54',
      '--border': '#d2ccc2',
      '--border-strong': '#bab2a6',
      '--accent': '#ba6638',
      '--accent-soft': '#f2e2d8',
      '--success': '#43865f',
      '--success-soft': '#e2efe7',
      '--warning': '#9d641e',
      '--warning-soft': '#f6ead5',
      '--danger': '#a9443e',
      '--danger-soft': '#f5dfdc',
      '--font-reading-sans': 'Quire Sans',
    };
    const getPropertyValue = vi.fn((token: string) => values[token] ?? '');
    const computedStyle = vi.spyOn(window, 'getComputedStyle')
      .mockReturnValue({ getPropertyValue } as unknown as CSSStyleDeclaration);

    const resolved = resolveMermaidTheme(document.documentElement, 'light');

    expect(computedStyle).toHaveBeenCalledTimes(1);
    expect(resolved).toMatchObject({
      cacheVersion: `${MERMAID_THEME_VARIABLES_VERSION}:light`,
      theme: 'base',
      themeVariables: {
        darkMode: false,
        background: '#efebe4',
        primaryColor: '#f2e2d8',
        primaryTextColor: '#171512',
        primaryBorderColor: '#ba6638',
        lineColor: '#bab2a6',
        noteBkgColor: '#f6ead5',
        fontFamily: 'Quire Sans',
      },
    });
  });

  it('versions dark variables independently for cache invalidation', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '',
    } as unknown as CSSStyleDeclaration);

    const resolved = resolveMermaidTheme(document.documentElement, 'dark');

    expect(resolved.cacheVersion).toBe(`${MERMAID_THEME_VARIABLES_VERSION}:dark`);
    expect(resolved.themeVariables.darkMode).toBe(true);
  });
});
