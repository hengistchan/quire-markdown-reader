import type { WorkspaceFile, WorkspaceSnapshot, WorkspaceTreeNode } from '../shared/types';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

export function isMarkdownFile(name: string): boolean {
  return MARKDOWN_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));
}

async function collectDirectory(
  directory: FileSystemDirectoryHandle,
  prefix = '',
  depth = 0,
): Promise<{ files: WorkspaceFile[]; tree: WorkspaceTreeNode[] }> {
  const files: WorkspaceFile[] = [];
  const tree: WorkspaceTreeNode[] = [];

  const handles: Array<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> = [];
  for await (const entry of directory.entries()) handles.push(entry);
  handles.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  for (const [name, handle] of handles) {
    if (name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'directory') {
      const nested = await collectDirectory(handle, path, depth + 1);
      files.push(...nested.files);
      if (nested.tree.length) {
        tree.push({ id: path, name, path, depth, kind: 'directory', children: nested.tree });
      }
    } else if (isMarkdownFile(name)) {
      const file = { id: path, name, path, depth, handle };
      files.push(file);
      tree.push({ id: path, name, path, depth, kind: 'file', file });
    }
  }

  return { files, tree };
}

export async function collectMarkdownFiles(directory: FileSystemDirectoryHandle): Promise<WorkspaceFile[]> {
  return (await collectDirectory(directory)).files;
}

export async function collectWorkspace(directory: FileSystemDirectoryHandle): Promise<WorkspaceSnapshot> {
  const { files, tree } = await collectDirectory(directory);
  return { name: directory.name, files, tree, handle: directory };
}

export async function readWorkspaceFile(file: WorkspaceFile): Promise<string> {
  return (await file.handle.getFile()).text();
}

export async function readWorkspaceFileSnapshot(file: WorkspaceFile): Promise<{ markdown: string; lastModified: number }> {
  const snapshot = await file.handle.getFile();
  return { markdown: await snapshot.text(), lastModified: snapshot.lastModified };
}

export async function getWorkspaceFileHandle(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const segments = path.split('/').filter(Boolean);
  const filename = segments.pop();
  if (!filename) throw new Error('The workspace path does not point to a file.');
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
  return directory.getFileHandle(filename);
}
