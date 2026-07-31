import { describe, expect, it } from 'vitest';
import { collectWorkspace, getWorkspaceFileHandle, isMarkdownFile, readWorkspaceFileSnapshot } from './files';

function fileHandle(name: string, text = name, lastModified = 1): FileSystemFileHandle {
  return {
    kind: 'file', name,
    getFile: async () => ({ name, lastModified, text: async () => text }) as File,
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
  it('builds a sorted nested tree, filters non-Markdown files, and ignores hidden directories', async () => {
    const root = directoryHandle('notes', {
      '10-last.md': fileHandle('10-last.md'),
      assets: directoryHandle('assets', { 'cover.png': fileHandle('cover.png') }),
      docs: directoryHandle('docs', {
        '2-next.md': fileHandle('2-next.md'),
        '1-start.md': fileHandle('1-start.md'),
        'draft.txt': fileHandle('draft.txt'),
      }),
      '.private': directoryHandle('.private', { 'secret.md': fileHandle('secret.md') }),
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

  it('opens a nested handle by normalized workspace path', async () => {
    const guide = fileHandle('guide.md');
    const root = directoryHandle('notes', { docs: directoryHandle('docs', { 'guide.md': guide }) });
    await expect(getWorkspaceFileHandle(root, 'docs/guide.md')).resolves.toBe(guide);
    await expect(getWorkspaceFileHandle(root, '')).rejects.toThrow('does not point to a file');
  });

  it('returns content and last-modified metadata for refresh checks', async () => {
    const handle = fileHandle('guide.md', '# Updated', 42);
    const file = { id: 'guide.md', name: 'guide.md', path: 'guide.md', depth: 0, handle };
    await expect(readWorkspaceFileSnapshot(file)).resolves.toEqual({ markdown: '# Updated', lastModified: 42 });
  });
});
