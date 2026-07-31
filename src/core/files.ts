import type { WorkspaceFile } from '../shared/types';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

export function isMarkdownFile(name: string): boolean {
  return MARKDOWN_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));
}

export async function collectMarkdownFiles(
  directory: FileSystemDirectoryHandle,
  prefix = '',
  depth = 0,
): Promise<WorkspaceFile[]> {
  const entries: WorkspaceFile[] = [];

  for await (const [name, handle] of directory.entries()) {
    if (name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'directory') {
      entries.push(...await collectMarkdownFiles(handle, path, depth + 1));
    } else if (isMarkdownFile(name)) {
      entries.push({ id: path, name, path, depth, handle });
    }
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

export async function readWorkspaceFile(file: WorkspaceFile): Promise<string> {
  return (await file.handle.getFile()).text();
}
