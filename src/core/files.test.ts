import { describe, expect, it } from 'vitest';
import { collectWorkspace, createTransientDirectoryHandle, getWorkspaceFileHandle, isMarkdownFile, readWorkspaceFileSnapshot, WorkspaceScanError } from './files';

function fileHandle(name: string, text = name, lastModified = 1): FileSystemFileHandle {
  return {
    kind: 'file', name,
    getFile: async () => ({ name, lastModified, size: text.length, text: async () => text }) as unknown as File,
  } as FileSystemFileHandle;
}

function directoryHandle(name: string, children: Record<string, FileSystemHandle>): FileSystemDirectoryHandle {
  return {
    kind: 'directory', name,
    entries: async function* () {
      for (const entry of Object.entries(children)) yield entry as [string, FileSystemHandle];
    },
    getDirectoryHandle: async (childName: string) => {
      const child = children[childName];
      if (!child || child.kind !== 'directory') throw new DOMException('Not found', 'NotFoundError');
      return child as FileSystemDirectoryHandle;
    },
    getFileHandle: async (childName: string) => {
      const child = children[childName];
      if (!child || child.kind !== 'file') throw new DOMException('Not found', 'NotFoundError');
      return child as FileSystemFileHandle;
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('isMarkdownFile', () => {
  it.each(['README.md', 'guide.markdown', 'notes.MDX'])('accepts %s', (name) => {
    expect(isMarkdownFile(name)).toBe(true);
  });

  it.each(['image.png', 'notes.txt', '.md-cache'])('rejects %s', (name) => {
    expect(isMarkdownFile(name)).toBe(false);
  });
});

describe('workspace collection', () => {
  it('builds a session-only directory handle from a folder input', async () => {
    const selected = [
      { name: 'README.md', webkitRelativePath: 'mihomo/README.md', lastModified: 1, text: async () => '# Mihomo' },
      { name: 'guide.md', webkitRelativePath: 'mihomo/docs/guide.md', lastModified: 2, text: async () => '# Guide' },
      { name: 'logo.svg', webkitRelativePath: 'mihomo/assets/logo.svg', lastModified: 3, text: async () => '<svg />' },
    ] as unknown as File[];

    const handle = createTransientDirectoryHandle(selected)!;
    const workspace = await collectWorkspace(handle);

    expect(workspace.name).toBe('mihomo');
    expect(workspace.files.map((file) => file.path)).toEqual(['docs/guide.md', 'README.md']);
    await expect((await getWorkspaceFileHandle(handle, 'assets/logo.svg')).getFile()).resolves.toBe(selected[2]);
  });

  it('builds a sorted nested tree and skips hidden and dependency/build directories', async () => {
    const root = directoryHandle('notes', {
      '10-last.md': fileHandle('10-last.md'),
      assets: directoryHandle('assets', { 'cover.png': fileHandle('cover.png') }),
      docs: directoryHandle('docs', {
        '2-next.md': fileHandle('2-next.md'),
        '1-start.md': fileHandle('1-start.md'),
        'draft.txt': fileHandle('draft.txt'),
      }),
      '.private': directoryHandle('.private', { 'secret.md': fileHandle('secret.md') }),
      node_modules: directoryHandle('node_modules', { 'package.md': fileHandle('package.md') }),
      vendor: directoryHandle('vendor', { 'dependency.md': fileHandle('dependency.md') }),
      dist: directoryHandle('dist', { 'bundle.md': fileHandle('bundle.md') }),
      '2-first.md': fileHandle('2-first.md'),
    });

    const workspace = await collectWorkspace(root);

    expect(workspace.name).toBe('notes');
    expect(workspace.files.map((file) => file.path)).toEqual([
      '2-first.md',
      '10-last.md',
      'docs/1-start.md',
      'docs/2-next.md',
    ]);
    expect(workspace.tree.map((node) => node.path)).toEqual(['2-first.md', '10-last.md', 'docs']);
    expect(workspace.tree[2]).toMatchObject({
      kind: 'directory',
      children: [
        { kind: 'file', path: 'docs/1-start.md', depth: 1 },
        { kind: 'file', path: 'docs/2-next.md', depth: 1 },
      ],
    });
  });

  it('scans the supported 5000-file workspace boundary', async () => {
    const children = Object.fromEntries(Array.from(
      { length: 5_000 },
      (_, index) => [`note-${String(index).padStart(4, '0')}.md`, fileHandle(`note-${index}.md`)],
    ));

    const workspace = await collectWorkspace(directoryHandle('large-workspace', children));

    expect(workspace.files).toHaveLength(5_000);
    expect(workspace.tree).toHaveLength(5_000);
  }, 10_000);

  it.each([
    ['max-files', { maxFiles: 1 }, directoryHandle('notes', { 'a.md': fileHandle('a.md'), 'b.md': fileHandle('b.md') })],
    ['max-directories', { maxDirectories: 1 }, directoryHandle('notes', { docs: directoryHandle('docs', { 'a.md': fileHandle('a.md') }) })],
    ['max-depth', { maxDepth: 0 }, directoryHandle('notes', { docs: directoryHandle('docs', { 'a.md': fileHandle('a.md') }) })],
  ] as const)('stops safely at the %s scan boundary', async (code, options, root) => {
    await expect(collectWorkspace(root, options)).rejects.toMatchObject({
      name: 'WorkspaceScanError', code,
    } satisfies Partial<WorkspaceScanError>);
  });

  it('honors cancellation before scanning directory contents', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(collectWorkspace(directoryHandle('notes', { 'a.md': fileHandle('a.md') }), { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'WorkspaceScanError', code: 'cancelled' } satisfies Partial<WorkspaceScanError>);
  });

  it('opens a nested handle by normalized workspace path', async () => {
    const guide = fileHandle('guide.md');
    const root = directoryHandle('notes', { docs: directoryHandle('docs', { 'guide.md': guide }) });
    await expect(getWorkspaceFileHandle(root, 'docs/guide.md')).resolves.toBe(guide);
    await expect(getWorkspaceFileHandle(root, '')).rejects.toThrow('does not point to a file');
  });

  it('returns content and last-modified metadata for refresh checks', async () => {
    const handle = fileHandle('guide.md', '# Updated', 42);
    const file = { id: 'guide.md', name: 'guide.md', path: 'guide.md', depth: 0, handle };
    await expect(readWorkspaceFileSnapshot(file)).resolves.toEqual({ markdown: '# Updated', lastModified: 42, size: 9 });
  });
});
