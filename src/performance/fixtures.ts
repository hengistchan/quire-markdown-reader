export const PERFORMANCE_FIXTURE_SIZES = {
  regularMarkdownBytes: 50 * 1024,
  largeMarkdownBytes: 5 * 1024 * 1024,
  headings: 1_000,
  codeFences: 500,
  mermaidDiagrams: 100,
  workspaceFiles: 5_000,
  directoryDepth: 20,
  relativeImages: 1_000,
} as const;

export function markdownByBytes(bytes: number, needle = 'performance-target'): string {
  const paragraph = `Quire benchmark paragraph with ${needle} and stable Markdown content.\n\n`;
  return paragraph.repeat(Math.ceil(bytes / paragraph.length)).slice(0, bytes);
}

export function headingDocument(count = PERFORMANCE_FIXTURE_SIZES.headings): string {
  return Array.from({ length: count }, (_, index) => `## Heading ${index + 1}\n\nContent ${index + 1}.`).join('\n\n');
}

export function codeFenceDocument(count = PERFORMANCE_FIXTURE_SIZES.codeFences): string {
  return Array.from({ length: count }, (_, index) => `\`\`\`ts\nconst value${index} = ${index};\n\`\`\``).join('\n\n');
}

export function mermaidDocument(count = PERFORMANCE_FIXTURE_SIZES.mermaidDiagrams): string {
  return Array.from(
    { length: count },
    (_, index) => `\`\`\`mermaid\nflowchart LR\n  A${index} --> B${index}\n\`\`\``,
  ).join('\n\n');
}

export function imageDocument(count = PERFORMANCE_FIXTURE_SIZES.relativeImages): string {
  return Array.from({ length: count }, (_, index) => `![Image ${index}](assets/image-${index}.png)`).join('\n');
}
