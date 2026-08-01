import type { DocumentSearchResult } from '../shared/types';

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function headingSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function readableLine(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+] |\d+\. |>\s*)/, '')
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim();
}

export function searchMarkdown(source: string, query: string, limit = 20): DocumentSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle || limit <= 0) return [];

  const results: DocumentSearchResult[] = [];
  const lines = source.split('\n');
  let headingId: string | undefined;
  let blockIndex = 0;
  let sourceOffset = 0;
  let previousLineBlank = true;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber] ?? '';
    const heading = line.match(HEADING);
    if (heading?.[2]) headingId = headingSlug(heading[2]);
    if (previousLineBlank && line.trim()) blockIndex += 1;

    const lowerLine = line.toLocaleLowerCase();
    let fromIndex = 0;
    while (results.length < limit) {
      const matchIndex = lowerLine.indexOf(needle, fromIndex);
      if (matchIndex < 0) break;
      results.push({
        id: `${lineNumber + 1}:${matchIndex}`,
        text: readableLine(line) || line.trim(),
        headingId,
        blockIndex: Math.max(0, blockIndex - 1),
        startOffset: sourceOffset + matchIndex,
        lineNumber: lineNumber + 1,
      });
      fromIndex = matchIndex + Math.max(1, needle.length);
    }

    if (results.length >= limit) break;
    previousLineBlank = !line.trim();
    sourceOffset += line.length + 1;
  }

  return results;
}
