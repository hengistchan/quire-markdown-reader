import type { WorkspaceFile, WorkspaceSnapshot, WorkspaceTreeNode } from '../shared/types';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

export const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.output', 'target', 'vendor',
]);
export const DEFAULT_WORKSPACE_MAX_DEPTH = 20;
export const DEFAULT_WORKSPACE_MAX_FILES = 5_000;
export const DEFAULT_WORKSPACE_MAX_DIRECTORIES = 20_000;

export type WorkspaceScanLimit = 'max-depth' | 'max-files' | 'max-directories';

export class WorkspaceScanError extends Error {
  constructor(public readonly code: 'cancelled' | WorkspaceScanLimit) {
    super(code);
    this.name = 'WorkspaceScanError';
  }
}

export interface WorkspaceScanOptions {
  maxDepth?: number;
  maxFiles?: number;
  maxDirectories?: number;
  ignoredDirectories?: ReadonlySet<string>;
  signal?: AbortSignal;
}

interface WorkspaceScanContext {
  maxDepth: number;
  maxFiles: number;
  maxDirectories: number;
  ignoredDirectories: ReadonlySet<string>;
  signal?: AbortSignal;
  fileCount: number;
  directoryCount: number;
}

export function isMarkdownFile(name: string): boolean {
  return MARKDOWN_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));
}

function assertScanActive(context: WorkspaceScanContext): void {
  if (context.signal?.aborted) throw new WorkspaceScanError('cancelled');
}

async function collectDirectory(
  directory: FileSystemDirectoryHandle,
  context: WorkspaceScanContext,
  prefix = '',
  depth = 0,
): Promise<{ files: WorkspaceFile[]; tree: WorkspaceTreeNode[] }> {
  assertScanActive(context);
  context.directoryCount += 1;
  if (context.directoryCount > context.maxDirectories) throw new WorkspaceScanError('max-directories');

  const files: WorkspaceFile[] = [];
  const tree: WorkspaceTreeNode[] = [];
  const handles: Array<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> = [];
  for await (const entry of directory.entries()) {
    assertScanActive(context);
    handles.push(entry);
  }
  handles.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  for (const [name, handle] of handles) {
    assertScanActive(context);
    if (name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'directory') {
      if (context.ignoredDirectories.has(name)) continue;
      if (depth >= context.maxDepth) throw new WorkspaceScanError('max-depth');
      const nested = await collectDirectory(handle, context, path, depth + 1);
      files.push(...nested.files);
      if (nested.tree.length) {
        tree.push({ id: path, name, path, depth, kind: 'directory', children: nested.tree });
      }
    } else if (isMarkdownFile(name)) {
      context.fileCount += 1;
      if (context.fileCount > context.maxFiles) throw new WorkspaceScanError('max-files');
      const file = { id: path, name, path, depth, handle };
      files.push(file);
      tree.push({ id: path, name, path, depth, kind: 'file', file });
    }
  }

  return { files, tree };
}

function createScanContext(options: WorkspaceScanOptions): WorkspaceScanContext {
  return {
    maxDepth: options.maxDepth ?? DEFAULT_WORKSPACE_MAX_DEPTH,
    maxFiles: options.maxFiles ?? DEFAULT_WORKSPACE_MAX_FILES,
    maxDirectories: options.maxDirectories ?? DEFAULT_WORKSPACE_MAX_DIRECTORIES,
    ignoredDirectories: options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES,
    signal: options.signal,
    fileCount: 0,
    directoryCount: 0,
  };
}

export async function collectMarkdownFiles(directory: FileSystemDirectoryHandle, options: WorkspaceScanOptions = {}): Promise<WorkspaceFile[]> {
  return (await collectDirectory(directory, createScanContext(options))).files;
}

export async function collectWorkspace(directory: FileSystemDirectoryHandle, options: WorkspaceScanOptions = {}): Promise<WorkspaceSnapshot> {
  const { files, tree } = await collectDirectory(directory, createScanContext(options));
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
