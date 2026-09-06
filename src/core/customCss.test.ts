import { describe, expect, it } from 'vitest';
import { scopeCustomCss } from './customCss';

describe('scopeCustomCss', () => {
  it('wraps balanced document styles in the reader scope', () => {
    expect(scopeCustomCss('h2 { color: rebeccapurple; }')).toEqual({
      css: '@scope (.markdown-body) {\nh2 { color: rebeccapurple; }\n}',
      valid: true,
    });
  });

  it.each([
    '} .app-shell { display: none } @scope (.markdown-body) {',
    '@import "https://example.com/theme.css";',
    '@im\\port "https://example.com/theme.css";',
    '@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }',
    '@layer reset;',
    'p { background: url(https://example.com/pixel.png); }',
    'p { background: image-set("https://example.com/pixel.png" 1x); }',
    'p { color: red;',
  ])('rejects CSS that can escape the document or load resources: %s', (source) => {
    expect(scopeCustomCss(source)).toEqual({ valid: false });
  });

  it.each([
    '@media (width > 600px) { h2 { color: rebeccapurple; } }',
    '@supports (text-wrap: balance) { h2 { text-wrap: balance; } }',
    '@container reader (width > 500px) { p { max-width: 60ch; } }',
  ])('allows scoped conditional block rules: %s', (source) => {
    expect(scopeCustomCss(source).valid).toBe(true);
  });

  it('ignores braces inside strings and comments', () => {
    expect(scopeCustomCss('p::after { content: "}"; } /* { } */').valid).toBe(true);
  });
});
