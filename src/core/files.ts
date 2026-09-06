import type { WorkspaceFile, WorkspaceSnapshot, WorkspaceTreeNode } from '../shared/types';
import { WorkspaceScanError } from '../shared/errors/workspaceScanError';
export { WorkspaceScanError } from '../shared/errors/workspaceScanError';
export type { WorkspaceScanLimit } from '../shared/errors/workspaceScanError';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

export const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.output',
  'target',
  'vendor',
]);
export const DEFAULT_WORKSPACE_MAX_DEPTH = 20;
export const DEFAULT_WORKSPACE_MAX_FILES = 5_000;
export const DEFAULT_WORKSPACE_MAX_DIRECTORIES = 20_000;
export const DEFAULT_WORKSPACE_MAX_ENTRIES = 50_000;

export interface WorkspaceScanOptions {
  workspaceId?: string;
  maxDepth?: number;
  maxFiles?: number;
  maxDirectories?: number;
  maxEntries?: number;
  ignoredDirectories?: ReadonlySet<string>;
  signal?: AbortSignal;
}

interface WorkspaceScanContext {
  maxDepth: number;
  maxFiles: number;
  maxDirectories: number;
  maxEntries: number;
  ignoredDirectories: ReadonlySet<string>;
  signal?: AbortSignal;
  fileCount: number;
  directoryCount: number;
  entryCount: number;
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
    context.entryCount += 1;
    if (context.entryCount > context.maxEntries) throw new WorkspaceScanError('max-entries');
    const [name, handle] = entry;
    if (handle.kind === 'directory' && (name.startsWith('.') || context.ignoredDirectories.has(name))) continue;
    if (handle.kind === 'file' && !isMarkdownFile(name)) continue;
    handles.push(entry);
  }
  handles.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  for (const [name, handle] of handles) {
    assertScanActive(context);
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'directory') {
      if (name.startsWith('.') || context.ignoredDirectories.has(name)) continue;
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
    maxEntries: options.maxEntries ?? DEFAULT_WORKSPACE_MAX_ENTRIES,
    ignoredDirectories: options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES,
    signal: options.signal,
    fileCount: 0,
    directoryCount: 0,
    entryCount: 0,
  };
}

export async function collectMarkdownFiles(
  directory: FileSystemDirectoryHandle,
  options: WorkspaceScanOptions = {},
): Promise<WorkspaceFile[]> {
  return (await collectDirectory(directory, createScanContext(options))).files;
}

export async function collectWorkspace(
  directory: FileSystemDirectoryHandle,
  options: WorkspaceScanOptions = {},
): Promise<WorkspaceSnapshot> {
  const { files, tree } = await collectDirectory(directory, createScanContext(options));
  return { id: options.workspaceId, name: directory.name, files, tree, handle: directory };
}

interface TransientDirectoryNode {
  name: string;
  directories: Map<string, TransientDirectoryNode>;
  files: Map<string, File>;
}

function transientFileHandle(file: File): FileSystemFileHandle {
  return { kind: 'file', name: file.name, getFile: async () => file } as FileSystemFileHandle;
}

function transientDirectoryHandle(node: TransientDirectoryNode): FileSystemDirectoryHandle {
  const directories = new Map<string, FileSystemDirectoryHandle>();
  const files = new Map<string, FileSystemFileHandle>();
  for (const [name, child] of node.directories) directories.set(name, transientDirectoryHandle(child));
  for (const [name, file] of node.files) files.set(name, transientFileHandle(file));
  return {
    kind: 'directory',
    name: node.name,
    entries: async function* () {
      for (const entry of directories) yield entry;
      for (const entry of files) yield entry;
    },
    getDirectoryHandle: async (name: string) => {
      const child = directories.get(name);
      if (!child) throw new DOMException('Directory not found.', 'NotFoundError');
      return child;
    },
    getFileHandle: async (name: string) => {
      const child = files.get(name);
      if (!child) throw new DOMException('File not found.', 'NotFoundError');
      return child;
    },
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  } as unknown as FileSystemDirectoryHandle;
}

export function createTransientDirectoryHandle(selectedFiles: Iterable<File>): FileSystemDirectoryHandle | undefined {
  const entries = [...selectedFiles]
    .map((file) => ({
      file,
      parts: (file.webkitRelativePath || file.name).split('/').filter((part) => part && part !== '.'),
    }))
    .filter(({ parts }) => parts.length > 0 && !parts.includes('..'));
  if (!entries.length) return undefined;
  const firstEntry = entries[0]!;
  const firstRoot = firstEntry.parts[0];
  const sharedRoot =
    firstRoot && firstEntry.parts.length > 1 && entries.every(({ parts }) => parts.length > 1 && parts[0] === firstRoot)
      ? firstRoot
      : 'Selected folder';
  const root: TransientDirectoryNode = { name: sharedRoot, directories: new Map(), files: new Map() };
  for (const { file, parts: originalParts } of entries) {
    const parts = sharedRoot === 'Selected folder' ? [...originalParts] : originalParts.slice(1);
    const filename = parts.pop();
    if (!filename) continue;
    let directory = root;
    for (const part of parts) {
      let child = directory.directories.get(part);
      if (!child) {
        child = { name: part, directories: new Map(), files: new Map() };
        directory.directories.set(part, child);
      }
      directory = child;
    }
    directory.files.set(filename, file);
  }
  return transientDirectoryHandle(root);
}

export async function readWorkspaceFile(file: WorkspaceFile): Promise<string> {
  return (await file.handle.getFile()).text();
}

export async function readWorkspaceFileSnapshot(
  file: WorkspaceFile,
): Promise<{ markdown: string; lastModified: number; size: number }> {
  const snapshot = await file.handle.getFile();
  return { markdown: await snapshot.text(), lastModified: snapshot.lastModified, size: snapshot.size };
}

export async function getWorkspaceFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const segments = path.split('/').filter(Boolean);
  const filename = segments.pop();
  if (!filename) throw new Error('The workspace path does not point to a file.');
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
  return directory.getFileHandle(filename);
}
