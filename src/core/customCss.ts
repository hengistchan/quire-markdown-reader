export interface ScopedCssResult {
  css?: string;
  valid: boolean;
}

const ALLOWED_BLOCK_AT_RULES = new Set(['container', 'layer', 'media', 'starting-style', 'supports']);
const AT_RULE = /@([\w-]+)/gu;
const EXTERNAL_RESOURCE = /\b(?:url|(?:-webkit-)?image-set)\s*\(/iu;

function inspectSyntax(source: string): { code: string; valid: boolean } {
  let depth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let comment = false;
  let code = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (comment) {
      if (character === '*' && next === '/') {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '/' && next === '*') {
      comment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
      code += ' ';
    } else if (character === '\\') {
      return { code, valid: false };
    } else if (character === '{') {
      depth += 1;
      code += character;
    } else if (character === '}') {
      depth -= 1;
      if (depth < 0) return { code, valid: false };
      code += character;
    } else code += character;
  }
  return { code, valid: depth === 0 && !quote && !comment };
}

function hasOnlyAllowedAtRules(code: string): boolean {
  for (const match of code.matchAll(AT_RULE)) {
    const name = match[1]?.toLowerCase();
    if (!name || !ALLOWED_BLOCK_AT_RULES.has(name)) return false;
    const remainder = code.slice((match.index ?? 0) + match[0].length);
    const nextBlock = remainder.indexOf('{');
    const nextStatement = remainder.indexOf(';');
    if (nextBlock < 0 || (nextStatement >= 0 && nextStatement < nextBlock)) return false;
  }
  return true;
}

export function scopeCustomCss(source: string): ScopedCssResult {
  const trimmed = source.trim();
  if (!trimmed) return { valid: true };
  const syntax = inspectSyntax(trimmed);
  if (!syntax.valid || !hasOnlyAllowedAtRules(syntax.code) || EXTERNAL_RESOURCE.test(syntax.code)) {
    return { valid: false };
  }
  return { css: `@scope (.markdown-body) {\n${trimmed}\n}`, valid: true };
}
