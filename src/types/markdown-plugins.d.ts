declare module 'markdown-it-deflist' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (markdown: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it';
  interface TexmathOptions {
    engine: unknown;
    delimiters?: string;
    katexOptions?: Record<string, unknown>;
  }
  const plugin: (markdown: MarkdownIt, options: TexmathOptions) => void;
  export default plugin;
}
