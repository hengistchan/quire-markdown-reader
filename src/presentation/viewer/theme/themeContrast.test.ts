import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rgb = [number, number, number];

const tokenCss = readFileSync(
  resolve(process.cwd(), 'src/entrypoints/viewer/styles/tokens.css'),
  'utf8',
);

function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tokenCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match?.[1]) throw new Error(`Missing token block for ${selector}`);
  const block = match[1];
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((declaration) => {
      const [, name, value] = declaration;
      if (!name || !value) throw new Error(`Invalid token declaration in ${selector}`);
      return [name, value.trim()];
    }),
  );
}

function parseHex(value: string): Rgb {
  const hex = value.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(hex)) throw new Error(`Expected a six-digit hex color, received ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as Rgb;
}

function relativeLuminance(value: string): number {
  const [red, green, blue] = parseHex(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  });
  return red! * .2126 + green! * .7152 + blue! * .0722;
}

function contrast(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0]! + .05) / (values[1]! + .05);
}

function token(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`Missing color token ${name}`);
  return value;
}

const light = declarations(':root');
const dark = { ...light, ...declarations(":root[data-theme='dark']") };

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s visual theme contrast', (_theme, tokens) => {
  it('keeps primary reading text above the preferred 7:1 ratio', () => {
    expect(contrast(token(tokens, '--text-primary'), token(tokens, '--surface-document'))).toBeGreaterThanOrEqual(7);
  });

  it.each([
    ['secondary document text', '--text-secondary', '--surface-document'],
    ['tertiary document text', '--text-tertiary', '--surface-document'],
    ['secondary toolbar text', '--text-secondary', '--surface-toolbar'],
  ])('keeps %s above 4.5:1', (_label, foreground, background) => {
    expect(contrast(token(tokens, foreground), token(tokens, background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['secondary sidebar icons', '--icon-secondary', '--surface-sidebar'],
    ['focus indicator', '--focus-ring', '--surface-document'],
    ['accent indicator', '--accent', '--surface-document'],
  ])('keeps %s above 3:1', (_label, foreground, background) => {
    expect(contrast(token(tokens, foreground), token(tokens, background))).toBeGreaterThanOrEqual(3);
  });

  it('keeps primary action labels above 4.5:1', () => {
    expect(contrast(token(tokens, '--text-on-accent'), token(tokens, '--accent-strong'))).toBeGreaterThanOrEqual(4.5);
  });
});
