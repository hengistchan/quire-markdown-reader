const MARKDOWN_LINK = /\.(md|markdown|mdx)(?:[?#].*)?$/i;

export function isRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isRelativeUrl(value: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value);
}

export function isMarkdownLink(value: string): boolean {
  return MARKDOWN_LINK.test(value);
}

export function linkFragment(value: string): string | undefined {
  const hashIndex = value.indexOf('#');
  if (hashIndex < 0 || hashIndex === value.length - 1) return undefined;
  try {
    return decodeURIComponent(value.slice(hashIndex + 1));
  } catch {
    return undefined;
  }
}

export function resolveWorkspacePath(currentFilePath: string, href: string): string | undefined {
  if (!isRelativeUrl(href)) return undefined;
  const cleanHref = href.split(/[?#]/, 1)[0];
  if (!cleanHref) return undefined;
  const base = cleanHref.startsWith('/') ? [] : currentFilePath.split('/').slice(0, -1);
  for (const rawSegment of cleanHref.replaceAll('\\', '/').split('/')) {
    if (!rawSegment) continue;
    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return undefined;
    }
    if (segment === '.') continue;
    if (segment === '..') {
      if (!base.length) return undefined;
      base.pop();
    } else {
      if (segment.includes('/') || segment.includes('\\') || segment.includes('\0')) return undefined;
      base.push(segment);
    }
  }
  return base.length ? base.join('/') : undefined;
}

export function hostPermissionPattern(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP and HTTPS URLs are supported.');
  return `${url.origin}/*`;
}
