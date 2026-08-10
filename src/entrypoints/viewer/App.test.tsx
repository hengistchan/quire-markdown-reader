import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../infrastructure/browser/settingsRepository';
import { createDocumentHandoff, takeDocumentHandoff } from '../../infrastructure/handoffStore';
import { IndexedDBHandleRepository } from '../../infrastructure/indexeddb/handleRepository';
import { App } from './App';

interface MermaidConfigMock {
  theme?: string;
  themeVariables?: { darkMode?: boolean };
}

const mermaidMocks = vi.hoisted(() => ({
  state: { darkMode: false },
  render: async (options?: { nodes?: HTMLElement[] }) => {
    for (const node of options?.nodes ?? []) node.innerHTML = `<svg role="img" aria-label="Rendered Mermaid diagram" data-dark-mode="${mermaidMocks.state.darkMode}"></svg>`;
  },
  run: vi.fn(),
}));

vi.mock('mermaid', () => ({ default: {
  initialize: (config: MermaidConfigMock) => {
    mermaidMocks.state.darkMode = Boolean(config.themeVariables?.darkMode);
  },
  run: (options: unknown) => mermaidMocks.run(options),
} }));

function installBrowser(
  overrides: Record<string, unknown> = {},
  recentItems: unknown = [],
  recentResources: unknown = [],
) {
  let storedRecentItems = recentItems;
  let storedRecentResources = recentResources;
  const local = {
    get: vi.fn(async (key: string | string[]) => {
      if (key === 'reader-settings') return { 'reader-settings': { ...defaultSettings, enableMermaid: false } };
      if (key === 'recent-documents') return { 'recent-documents': storedRecentItems };
      if (key === 'recent-resources') return { 'recent-resources': storedRecentResources };
      return { onboardingComplete: false };
    }),
    set: vi.fn(async (value: Record<string, unknown>) => {
      if ('recent-documents' in value) storedRecentItems = value['recent-documents'];
      if ('recent-resources' in value) storedRecentResources = value['recent-resources'];
    }),
    remove: vi.fn(async () => undefined),
  };
  const api = {
    storage: { local },
    permissions: { request: vi.fn(async () => false) },
    ...overrides,
  };
  vi.stubGlobal('browser', api);
  return { api, local };
}

async function deleteHandoffDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('quire-document-handoffs');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe('Quire viewer experience', () => {
  beforeEach(async () => {
    await deleteHandoffDatabase();
    history.replaceState(null, '', '/');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('scrollTo', vi.fn());
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    mermaidMocks.state.darkMode = false;
    mermaidMocks.run.mockReset();
    mermaidMocks.run.mockImplementation(mermaidMocks.render);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts in quiet reading mode and explains a denied remote permission', async () => {
    const { api } = installBrowser();
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByLabelText('Document navigation')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Quire' }).getAttribute('src')).toBe('/icon/96.png');
    expect(screen.queryByText('Your documents, set for reading.')).toBeNull();
    expect(document.querySelector('.context-panel')).toBeNull();
    const outlineToggle = screen.getByRole('button', { name: 'Toggle document outline' });
    expect(outlineToggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(outlineToggle);
    expect(document.querySelector('.context-panel.outline-panel')).toBeTruthy();
    const welcomeHeading = document.getElementById('welcome-to-quire')!;
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Welcome to Quire' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(welcomeHeading.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(welcomeHeading);
    expect(outlineToggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(outlineToggle);
    expect(document.querySelector('.context-panel')).toBeNull();
    await user.click(document.querySelector<HTMLElement>('.open-trigger')!);
    await user.click(within(document.querySelector<HTMLElement>('.open-menu')!).getByText('Open URL').closest('button')!);

    const urlDialog = document.querySelector<HTMLElement>('.url-dialog')!;
    await user.type(within(urlDialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/readme.md');
    await user.click(within(urlDialog).getByText('Open'));

    await waitFor(() => expect(api.permissions.request).toHaveBeenCalledWith({ origins: ['https://docs.example.com/*'] }));
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Access was not granted'));
  });

  it('consumes only the handoff ID from its own URL and removes it from the address', async () => {
    installBrowser();
    await createDocumentHandoff(
      { title: 'Session A.md', markdown: '# Session A\n\nIsolated document.' },
      { id: 'viewer-a', now: Date.now() },
    );
    await createDocumentHandoff(
      { title: 'Session B.md', markdown: '# Session B\n\nOther document.' },
      { id: 'viewer-b', now: Date.now() },
    );
    history.replaceState(null, '', '/viewer.html?handoff=viewer-a');

    render(<App />);

    expect(await screen.findByText('Isolated document.')).toBeTruthy();
    expect(screen.queryByText('Other document.')).toBeNull();
    expect(new URLSearchParams(location.search).has('handoff')).toBe(false);
    expect(new URLSearchParams(location.search).get('imported')).toBeTruthy();
    await expect(takeDocumentHandoff('viewer-a')).resolves.toBeUndefined();
    await expect(takeDocumentHandoff('viewer-b')).resolves.toEqual({
      title: 'Session B.md', markdown: '# Session B\n\nOther document.',
    });
  });

  it('shows immediate loading feedback while a remote Markdown request is pending', async () => {
    let finishRequest: (response: Response) => void = () => undefined;
    const pendingResponse = new Promise<Response>((resolve) => { finishRequest = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => pendingResponse));
    installBrowser({ permissions: { request: vi.fn(async () => true) } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/guide.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));

    expect((await screen.findByRole('status')).textContent).toContain('Loading Markdown…');
    expect(within(dialog).getByRole('button', { name: 'Loading Markdown…' }).hasAttribute('disabled')).toBe(true);
    expect(dialog.getAttribute('aria-busy')).toBe('true');

    finishRequest(new Response('# Loaded guide\n\nRemote content arrived.', { status: 200 }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(await screen.findByText('Remote content arrived.')).toBeTruthy();
  });

  it('lets the user cancel a pending remote request without showing a failure', async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    installBrowser({ permissions: { request: vi.fn(async () => true) } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/slow.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open Markdown from the web' })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the latest history target when a delayed remote traversal is superseded', async () => {
    let bRequestCount = 0;
    let delayedBAborted = false;
    let resolveDelayedB: (response: Response) => void = () => undefined;
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/B.md')) {
        bRequestCount += 1;
        if (bRequestCount === 2) {
          return new Promise<Response>((resolve, reject) => {
            resolveDelayedB = resolve;
            init?.signal?.addEventListener('abort', () => {
              delayedBAborted = true;
              reject(init.signal?.reason);
            }, { once: true });
          });
        }
        return Promise.resolve(new Response('# Remote B\n\nRemote B body.'));
      }
      return Promise.resolve(new Response('# Remote A\n\n[Open B](https://docs.example.com/B.md)'));
    });
    vi.stubGlobal('fetch', fetcher);
    installBrowser({ permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/A.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));
    await user.click(await screen.findByRole('link', { name: 'Open B' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote B body.'));

    await user.click(screen.getByRole('button', { name: 'Previous document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote A'));
    await user.click(screen.getByRole('button', { name: 'Next document' }));
    await screen.findByRole('status');
    expect(new URLSearchParams(location.search).get('remote')).toBe('https://docs.example.com/B.md');

    await user.click(screen.getByRole('button', { name: 'Previous document' }));
    await waitFor(() => expect(new URLSearchParams(location.search).get('remote')).toBe('https://docs.example.com/A.md'));
    await user.click(screen.getByRole('button', { name: 'Previous document' }));
    await waitFor(() => expect(document.querySelector('.document-identity strong')?.textContent).toBe('Welcome to Quire'));
    resolveDelayedB(new Response('# Late Remote B\n\nThis response must never win.'));

    await waitFor(() => expect(delayedBAborted).toBe(true));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Welcome to Quire'));
    expect(screen.queryByText('This response must never win.')).toBeNull();
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('Welcome to Quire');
    expect(new URLSearchParams(location.search).has('remote')).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('offers a retry after a remote network failure', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('Offline'))
      .mockResolvedValueOnce(new Response('# Retried\n\nThe retry succeeded.'));
    vi.stubGlobal('fetch', fetcher);
    installBrowser({ permissions: { request: vi.fn(async () => true) } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/retry.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('The retry succeeded.')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('toggles a persistent wider reading width beside the Open control', async () => {
    const { local } = installBrowser();
    const user = userEvent.setup();
    render(<App />);

    const wideButton = await screen.findByRole('button', { name: 'Use wider reading width' });
    const openButton = screen.getByRole('button', { name: 'Open' });
    const searchButton = within(document.querySelector<HTMLElement>('.topbar-actions')!).getByRole('button', { name: 'Command center' });
    expect(openButton.compareDocumentPosition(wideButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wideButton.compareDocumentPosition(searchButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wideButton.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector<HTMLElement>('.app-shell')?.style.getPropertyValue('--reader-width')).toBe('760px');

    await user.click(wideButton);

    expect(screen.getByRole('button', { name: 'Use standard reading width' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector<HTMLElement>('.app-shell')?.style.getPropertyValue('--reader-width')).toBe('980px');
    await waitFor(() => expect(local.set).toHaveBeenCalledWith(expect.objectContaining({
      'reader-settings': expect.objectContaining({
        settings: expect.objectContaining({ wideView: true }),
      }),
    })));

    await user.click(screen.getByRole('button', { name: 'Use standard reading width' }));
    expect(document.querySelector<HTMLElement>('.app-shell')?.style.getPropertyValue('--reader-width')).toBe('760px');
  });

  it('switches the complete reader UI to Simplified Chinese and persists it', async () => {
    const { local } = installBrowser();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Reader settings' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Language' }), 'zh-CN');

    expect(await screen.findByText('修改后立即应用到当前文档。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.markdown-body')?.textContent).toContain('Quire 将 Markdown 变成专注的阅读空间'));
    expect(screen.getByLabelText('文档导航')).toBeTruthy();
    await waitFor(() => expect(local.set).toHaveBeenCalledWith(expect.objectContaining({
      'reader-settings': expect.objectContaining({
        settings: expect.objectContaining({ locale: 'zh-CN' }),
      }),
    })));
  });

  it('follows live operating-system theme changes in system mode', async () => {
    let dark = false;
    let onChange: (() => void) | undefined;
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return dark; },
      addEventListener: vi.fn((_type: string, listener: () => void) => { onChange = listener; }),
      removeEventListener: vi.fn(),
    })));
    installBrowser();
    render(<App />);

    await screen.findByLabelText('Document navigation');
    expect(document.documentElement.dataset.theme).toBe('light');
    dark = true;
    act(() => onChange?.());
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  it('opens a keyboard-friendly command center with progressive reader actions', async () => {
    installBrowser();
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText('Document navigation');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command center' });
    expect(within(palette).getByRole('button', { name: /Open file/ })).toBeTruthy();
    expect(within(palette).getByRole('button', { name: /Open folder/ })).toBeTruthy();
    expect(within(palette).getByRole('button', { name: /Open URL/ })).toBeTruthy();
    expect(within(palette).getByRole('button', { name: /Enter quiet reading mode/ })).toBeTruthy();
    expect(within(palette).getByRole('button', { name: /Use dark theme/ })).toBeTruthy();
    expect(within(palette).getByRole('button', { name: /Reader settings/ })).toBeTruthy();

    const input = within(palette).getByPlaceholderText('Type a command, filename, or URL…');
    await user.type(input, 'dark');
    expect(within(palette).getByRole('button', { name: /Use dark theme/ })).toBeTruthy();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(palette).getByRole('button', { name: /Use dark theme/ }));
  });

  it('resumes the routed workspace file after the browser asks for access again', async () => {
    const markdown = '# Routed guide\n\n## Tasks\n';
    const file = {
      kind: 'file', name: 'guide.md',
      getFile: vi.fn(async () => ({ name: 'guide.md', lastModified: 1, size: markdown.length, text: async () => markdown }) as unknown as File),
    } as unknown as FileSystemFileHandle;
    const docs = {
      kind: 'directory', name: 'docs',
      entries: async function* () { yield ['guide.md', file] as [string, FileSystemFileHandle]; },
    } as unknown as FileSystemDirectoryHandle;
    const workspace = {
      kind: 'directory', name: 'notes',
      queryPermission: vi.fn(async () => 'prompt' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      entries: async function* () { yield ['docs', docs] as [string, FileSystemDirectoryHandle]; },
    } as unknown as FileSystemDirectoryHandle;
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getWorkspace').mockResolvedValue({
      id: 'routed', kind: 'workspace', name: 'notes', handle: workspace, savedAt: 1,
    });
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveWorkspace').mockResolvedValue('routed');
    history.replaceState(null, '', '/viewer.html?workspace=routed&file=docs%2Fguide.md#tasks');
    vi.stubGlobal('showDirectoryPicker', vi.fn());
    installBrowser();
    const user = userEvent.setup();

    render(<App />);
    const restoreWorkspace = await screen.findByRole('button', { name: 'Restore workspace' });
    expect(workspace.requestPermission).not.toHaveBeenCalled();
    await user.click(restoreWorkspace);

    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Routed guide'));
    expect(workspace.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
    expect(location.search).toBe('?workspace=routed&file=docs%2Fguide.md');
    expect(location.hash).toBe('#tasks');
  });

  it('restores separate same-named workspaces from recent documents', async () => {
    const workspaceHandle = (fileName: string, markdown: string) => {
      const file = {
        kind: 'file', name: fileName,
        getFile: vi.fn(async () => ({ name: fileName, lastModified: 1, size: markdown.length, text: async () => markdown }) as unknown as File),
      } as unknown as FileSystemFileHandle;
      return {
        kind: 'directory', name: 'docs',
        queryPermission: vi.fn(async () => 'granted' as PermissionState),
        requestPermission: vi.fn(async () => 'granted' as PermissionState),
        entries: async function* () { yield [fileName, file] as [string, FileSystemFileHandle]; },
      } as unknown as FileSystemDirectoryHandle;
    };
    const handles = {
      first: workspaceHandle('first.md', '# First workspace'),
      second: workspaceHandle('second.md', '# Second workspace'),
    };
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getWorkspace').mockImplementation(async (id) => ({
      id,
      kind: 'workspace',
      name: 'docs',
      handle: handles[id as keyof typeof handles],
      savedAt: 1,
    }));
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveWorkspace').mockImplementation(async (_handle, id) => id ?? 'generated');
    installBrowser({}, { version: 2, items: [
      { id: 'workspace-file:first:first.md', title: 'first.md', kind: 'workspace-file', workspaceId: 'first', filePath: 'first.md', openedAt: 2, scrollPosition: 320, headingId: 'first-workspace' },
      { id: 'workspace-file:second:second.md', title: 'second.md', kind: 'workspace-file', workspaceId: 'second', filePath: 'second.md', openedAt: 1 },
    ] }, { version: 1, items: [
      { id: 'workspace:first', title: 'docs', kind: 'workspace', workspaceId: 'first', lastFilePath: 'first.md', openedAt: 2 },
      { id: 'workspace:second', title: 'docs', kind: 'workspace', workspaceId: 'second', lastFilePath: 'second.md', openedAt: 1 },
    ] });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText('Document navigation');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const firstCommand = within(await screen.findByRole('dialog', { name: 'Command center' }));
    await user.click(firstCommand.getAllByRole('button', { name: /docs Workspace/ })[0]!);
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('First workspace'));
    await user.click(screen.getByRole('button', { name: 'Continue reading' }));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }));

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const commandCenter = within(await screen.findByRole('dialog', { name: 'Command center' }));
    await user.click(commandCenter.getAllByRole('button', { name: /docs Workspace/ })[1]!);
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Second workspace'));
    expect(screen.getByRole('button', { name: 'Previous document' }).hasAttribute('disabled')).toBe(false);

    fireEvent.popState(window, { state: {
      quireWorkspaceNavigation: { workspaceId: 'first', filePath: 'first.md' },
    } });
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('First workspace'));
    expect(screen.getByRole('button', { name: 'Next document' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps explicit workspace resources separate from internal document reading history', async () => {
    const workspaceHandle = (name: string, files: Record<string, string>) => {
      const handles = Object.entries(files).map(([fileName, markdown]) => [
        fileName,
        {
          kind: 'file',
          name: fileName,
          getFile: vi.fn(async () => ({
            name: fileName,
            lastModified: 1,
            size: markdown.length,
            text: async () => markdown,
          }) as unknown as File),
        } as unknown as FileSystemFileHandle,
      ] as const);
      return {
        kind: 'directory',
        name,
        queryPermission: vi.fn(async () => 'prompt' as PermissionState),
        requestPermission: vi.fn(async () => 'granted' as PermissionState),
        entries: async function* () {
          for (const entry of handles) yield entry;
        },
      } as unknown as FileSystemDirectoryHandle;
    };
    const first = workspaceHandle('Workspace A', {
      'README.md': '# Workspace A readme',
      'design.md': '# Workspace A design\n\nLast document body.',
    });
    const second = workspaceHandle('Workspace B', {
      'README.md': '# Workspace B readme\n\nSecond workspace body.',
    });
    const ids = new Map<FileSystemDirectoryHandle, string>([[first, 'workspace-a'], [second, 'workspace-b']]);
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getActiveWorkspace').mockResolvedValue(undefined);
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveWorkspace').mockImplementation(async (handle, existingId) => (
      existingId ?? ids.get(handle) ?? 'generated'
    ));
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getWorkspace').mockImplementation(async (id) => {
      const handle = id === 'workspace-a' ? first : id === 'workspace-b' ? second : undefined;
      return handle ? { id, kind: 'workspace', name: handle.name, handle, savedAt: 1 } : undefined;
    });
    vi.stubGlobal('showDirectoryPicker', vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second));
    const { local } = installBrowser();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open folder/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Workspace A readme'));
    await user.click(screen.getByRole('button', { name: 'design.md' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Last document body.'));

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open folder/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Second workspace body.'));

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const menu = within(document.querySelector<HTMLElement>('.open-menu')!);
    const recentButtons = menu.getAllByRole('button', { name: /Workspace [AB] Workspace/ });
    expect(recentButtons.map((button) => button.textContent)).toEqual([
      'Workspace BWorkspace',
      'Workspace AWorkspace',
    ]);
    expect(menu.getAllByRole('button', { name: /Workspace A Workspace/ })).toHaveLength(1);

    await user.click(menu.getByRole('button', { name: 'Remove from recent: Workspace B' }));
    expect(document.querySelector('article')?.textContent).toContain('Second workspace body.');
    expect(menu.queryByRole('button', { name: /Workspace B Workspace/ })).toBeNull();

    await user.click(menu.getByRole('button', { name: 'View all recent…' }));
    const palette = within(await screen.findByRole('dialog', { name: 'Command center' }));
    const searchRecent = palette.getByPlaceholderText('Search recently opened…');
    await user.type(searchRecent, 'workspace a');
    await user.click(palette.getByRole('button', { name: /Workspace A Workspace/ }));

    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Last document body.'));
    expect(first.requestPermission).toHaveBeenCalledOnce();
    await waitFor(() => expect(local.set).toHaveBeenCalledWith(expect.objectContaining({
      'recent-resources': expect.objectContaining({
        version: 1,
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'workspace:workspace-a',
            lastFilePath: 'design.md',
          }),
        ]),
      }),
    })));
  });

  it('keeps mixed workspace, remote, and local navigation aligned with browser history', async () => {
    const workspaceMarkdown = '# Workspace A\n\nWorkspace body.';
    const workspaceFile = {
      kind: 'file', name: 'A.md',
      getFile: vi.fn(async () => ({
        name: 'A.md', lastModified: 1, size: workspaceMarkdown.length,
        text: async () => workspaceMarkdown,
      }) as unknown as File),
    } as unknown as FileSystemFileHandle;
    const workspaceHandle = {
      kind: 'directory', name: 'mixed-workspace',
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      entries: async function* () { yield ['A.md', workspaceFile] as [string, FileSystemFileHandle]; },
    } as unknown as FileSystemDirectoryHandle;
    const localMarkdown = '# Local C\n\nLocal body.';
    const localHandle = {
      kind: 'file', name: 'C.md',
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      getFile: vi.fn(async () => ({
        name: 'C.md', lastModified: 2, size: localMarkdown.length,
        text: async () => localMarkdown,
      }) as unknown as File),
    } as unknown as FileSystemFileHandle;
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getActiveWorkspace').mockResolvedValue(undefined);
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveWorkspace').mockResolvedValue('workspace-a');
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getWorkspace').mockResolvedValue({
      id: 'workspace-a', kind: 'workspace', name: 'mixed-workspace', handle: workspaceHandle, savedAt: 1,
    });
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveFile').mockResolvedValue('local-c');
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getFile').mockResolvedValue({
      id: 'local-c', kind: 'file', name: 'C.md', handle: localHandle, savedAt: 1,
    });
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => workspaceHandle));
    vi.stubGlobal('showOpenFilePicker', vi.fn(async () => [localHandle]));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# Remote B\n\nRemote body.')));
    installBrowser({ permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open folder/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Workspace body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('A');
    expect(location.search).toBe('?workspace=workspace-a&file=A.md');

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/B.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('B');
    expect(new URLSearchParams(location.search).get('remote')).toBe('https://docs.example.com/B.md');

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open file/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Local body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('C');
    expect(location.search).toBe('?local=local-c');
    expect(screen.getByRole('button', { name: 'Previous document' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Next document' }).hasAttribute('disabled')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Previous document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('B');
    expect(new URLSearchParams(location.search).get('remote')).toBe('https://docs.example.com/B.md');
    expect(screen.getByRole('button', { name: 'Next document' }).hasAttribute('disabled')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Previous document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Workspace body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('A');
    expect(location.search).toBe('?workspace=workspace-a&file=A.md');

    await user.click(screen.getByRole('button', { name: 'Next document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('B');
    expect(new URLSearchParams(location.search).get('remote')).toBe('https://docs.example.com/B.md');
  });

  it('restores remote documents and fragments through back and forward', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return url.includes('/B.md')
        ? new Response('# Remote B\n\n## Part\n\nSecond remote body.')
        : new Response('# Remote A\n\n[Open B](https://docs.example.com/B.md#part)');
    }));
    installBrowser({ permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/A.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote A'));

    await user.click(screen.getByRole('link', { name: 'Open B' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Second remote body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('B');
    expect(new URLSearchParams(location.search).get('remote')).toBe('https://docs.example.com/B.md');
    expect(location.hash).toBe('#part');

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const recentMenu = within(document.querySelector<HTMLElement>('.open-menu')!);
    expect(recentMenu.getAllByRole('button', { name: /A\.md docs\.example\.com/ })).toHaveLength(1);
    expect(recentMenu.queryByRole('button', { name: /B\.md docs\.example\.com/ })).toBeNull();
    fireEvent.keyDown(document.querySelector<HTMLElement>('.open-menu')!, { key: 'Escape' });

    await user.click(screen.getByRole('button', { name: 'Previous document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote A'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('A');
    expect(new URLSearchParams(location.search).get('remote')).toBe('https://docs.example.com/A.md');
    expect(location.hash).toBe('');

    await user.click(screen.getByRole('button', { name: 'Next document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Second remote body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('B');
    expect(location.hash).toBe('#part');
  });

  it('restores local files through back and forward', async () => {
    const createHandle = (name: string, markdown: string) => ({
      kind: 'file', name,
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      getFile: vi.fn(async () => ({
        name, lastModified: 1, size: markdown.length, text: async () => markdown,
      }) as unknown as File),
    } as unknown as FileSystemFileHandle);
    const first = createHandle('A.md', '# Local A\n\nFirst local body.');
    const second = createHandle('B.md', '# Local B\n\nSecond local body.');
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getActiveWorkspace').mockResolvedValue(undefined);
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveFile').mockImplementation(async (handle, existingId) => (
      existingId ?? (handle === first ? 'local-a' : 'local-b')
    ));
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getFile').mockImplementation(async (id) => {
      const handle = id === 'local-a' ? first : id === 'local-b' ? second : undefined;
      return handle ? { id, kind: 'file', name: handle.name, handle, savedAt: 1 } : undefined;
    });
    vi.stubGlobal('showOpenFilePicker', vi.fn()
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([second]));
    installBrowser();
    const user = userEvent.setup();
    render(<App />);

    for (const expected of ['First local body.', 'Second local body.']) {
      await user.click(await screen.findByRole('button', { name: 'Open' }));
      await user.click(screen.getByRole('button', { name: /Open file/ }));
      await waitFor(() => expect(document.querySelector('article')?.textContent).toContain(expected));
    }
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('B');
    expect(location.search).toBe('?local=local-b');

    await user.click(screen.getByRole('button', { name: 'Previous document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('First local body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('A');
    expect(location.search).toBe('?local=local-a');

    await user.click(screen.getByRole('button', { name: 'Next document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Second local body.'));
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('B');
    expect(location.search).toBe('?local=local-b');
  });

  it('shows an unavailable document instead of stale content when a local history handle is lost', async () => {
    const markdown = '# Local A\n\nLocal history body.';
    const handle = {
      kind: 'file', name: 'A.md',
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      getFile: vi.fn(async () => ({
        name: 'A.md', lastModified: 1, size: markdown.length, text: async () => markdown,
      }) as unknown as File),
    } as unknown as FileSystemFileHandle;
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getActiveWorkspace').mockResolvedValue(undefined);
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveFile').mockResolvedValue('local-a');
    const getFile = vi.spyOn(IndexedDBHandleRepository.prototype, 'getFile').mockResolvedValue({
      id: 'local-a', kind: 'file', name: 'A.md', handle, savedAt: 1,
    });
    vi.stubGlobal('showOpenFilePicker', vi.fn(async () => [handle]));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# Remote B\n\nRemote history body.')));
    installBrowser({ permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open file/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Local history body.'));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/B.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote history body.'));

    getFile.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Previous document' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not read that file'));
    expect(location.search).toBe('?local=local-a');
    expect(document.querySelector('article')?.textContent).not.toContain('Remote history body.');
    expect(document.querySelector('.document-identity strong')?.textContent).toBe('Document unavailable');
  });

  it('waits for an explicit user action before restoring revoked workspace permission', async () => {
    const markdown = '# Workspace A\n\nWorkspace permission body.';
    const file = {
      kind: 'file', name: 'A.md',
      getFile: vi.fn(async () => ({
        name: 'A.md', lastModified: 1, size: markdown.length, text: async () => markdown,
      }) as unknown as File),
    } as unknown as FileSystemFileHandle;
    let permission: PermissionState = 'granted';
    const requestPermission = vi.fn(async () => {
      permission = 'granted';
      return permission;
    });
    const handle = {
      kind: 'directory', name: 'workspace-a',
      queryPermission: vi.fn(async () => permission),
      requestPermission,
      entries: async function* () { yield ['A.md', file] as [string, FileSystemFileHandle]; },
    } as unknown as FileSystemDirectoryHandle;
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getActiveWorkspace').mockResolvedValue(undefined);
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveWorkspace').mockResolvedValue('workspace-a');
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getWorkspace').mockResolvedValue({
      id: 'workspace-a', kind: 'workspace', name: 'workspace-a', handle, savedAt: 1,
    });
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => handle));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# Remote B\n\nRemote after workspace.')));
    installBrowser({ permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open folder/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Workspace permission body.'));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/B.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote after workspace.'));

    permission = 'prompt';
    await user.click(screen.getByRole('button', { name: 'Previous document' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('needs your permission'));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(location.search).toBe('?workspace=workspace-a&file=A.md');
    expect(document.querySelector('article')?.textContent).not.toContain('Remote after workspace.');

    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Restore access' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Workspace permission body.'));
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it('waits for an explicit user action before restoring revoked remote permission', async () => {
    const localMarkdown = '# Local B\n\nLocal after remote.';
    const localHandle = {
      kind: 'file', name: 'B.md',
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      getFile: vi.fn(async () => ({
        name: 'B.md', lastModified: 1, size: localMarkdown.length, text: async () => localMarkdown,
      }) as unknown as File),
    } as unknown as FileSystemFileHandle;
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getActiveWorkspace').mockResolvedValue(undefined);
    vi.spyOn(IndexedDBHandleRepository.prototype, 'saveFile').mockResolvedValue('local-b');
    vi.spyOn(IndexedDBHandleRepository.prototype, 'getFile').mockResolvedValue({
      id: 'local-b', kind: 'file', name: 'B.md', handle: localHandle, savedAt: 1,
    });
    vi.stubGlobal('showOpenFilePicker', vi.fn(async () => [localHandle]));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# Remote A\n\nRemote permission body.')));
    const request = vi.fn(async () => true);
    const contains = vi.fn(async () => false);
    installBrowser({ permissions: { request, contains } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open URL/ }));
    const dialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(dialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/A.md');
    await user.click(within(dialog).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote permission body.'));
    expect(request).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: /Open file/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Local after remote.'));
    await user.click(screen.getByRole('button', { name: 'Previous document' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('needs your permission'));
    expect(request).toHaveBeenCalledTimes(1);
    expect(document.querySelector('article')?.textContent).not.toContain('Local after remote.');
    await user.click(screen.getByRole('button', { name: 'Restore access' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Remote permission body.'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('opens pasted and dropped Markdown without another dialog', async () => {
    installBrowser();
    render(<App />);
    await screen.findByLabelText('Document navigation');
    const shell = document.querySelector<HTMLElement>('.app-shell')!;

    fireEvent.paste(shell, {
      clipboardData: { files: [], getData: () => '# Pasted heading\n\nPasted body.' },
    });
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Pasted body.'));
    expect(screen.queryByRole('dialog')).toBeNull();

    const file = { name: 'dropped.md', text: async () => '# Dropped heading\n\nDropped body.' } as File;
    fireEvent.drop(shell, { dataTransfer: { items: [], files: [file] } });
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Dropped body.'));
  });

  it('restores imported documents from the current tab registry during back and forward', async () => {
    installBrowser();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText('Document navigation');
    const shell = document.querySelector<HTMLElement>('.app-shell')!;

    fireEvent.paste(shell, { clipboardData: { files: [], getData: () => '# Imported A\n\nFirst import.' } });
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('First import.'));
    const firstSession = new URLSearchParams(location.search).get('imported');
    fireEvent.paste(shell, { clipboardData: { files: [], getData: () => '# Imported B\n\nSecond import.' } });
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Second import.'));
    const secondSession = new URLSearchParams(location.search).get('imported');
    expect(secondSession).toBeTruthy();
    expect(secondSession).not.toBe(firstSession);

    await user.click(screen.getByRole('button', { name: 'Previous document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('First import.'));
    expect(new URLSearchParams(location.search).get('imported')).toBe(firstSession);
    await user.click(screen.getByRole('button', { name: 'Next document' }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Second import.'));
    expect(new URLSearchParams(location.search).get('imported')).toBe(secondSession);
  });

  it('defers Mermaid until a diagram approaches the viewport and retries a transient failure', async () => {
    const observers: Array<{ callback: IntersectionObserverCallback; targets: Element[] }> = [];
    class TestIntersectionObserver {
      readonly root = null;
      readonly rootMargin = '500px 0px';
      readonly thresholds = [0];
      private readonly record: { callback: IntersectionObserverCallback; targets: Element[] };
      constructor(callback: IntersectionObserverCallback) {
        this.record = { callback, targets: [] };
        observers.push(this.record);
      }
      observe(target: Element) { this.record.targets.push(target); }
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    installBrowser({ storage: { local: {
      get: vi.fn(async (key: string) => key === 'reader-settings'
        ? { 'reader-settings': { ...defaultSettings, enableMermaid: true } }
        : { 'recent-documents': [] }),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    } } });
    await createDocumentHandoff({
      title: 'Lazy diagram.md',
      markdown: '# Lazy diagram\n\n```mermaid\ngraph TD\nUniqueLazyNode-->B\n```',
    }, { id: 'lazy-mermaid', now: Date.now() });
    history.replaceState(null, '', '/viewer.html?handoff=lazy-mermaid');
    render(<App />);

    let target: HTMLElement | undefined;
    await waitFor(() => {
      target = [...document.querySelectorAll<HTMLElement>('.mermaid')]
        .find((node) => decodeURIComponent(node.dataset.mermaidSource ?? '').includes('UniqueLazyNode'));
      expect(target).toBeTruthy();
    });
    expect(mermaidMocks.run).not.toHaveBeenCalled();
    let record: { callback: IntersectionObserverCallback; targets: Element[] } | undefined;
    await waitFor(() => {
      record = [...observers].reverse().find((candidate) => candidate.targets.includes(target!));
      expect(record).toBeTruthy();
    });
    await import('mermaid');
    mermaidMocks.run.mockRejectedValueOnce(new Error('transient Mermaid failure'));
    await act(async () => {
      record!.callback(
        [{ target: target!, isIntersecting: true } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    await waitFor(() => expect(target!.dataset.resourceState).toBe('ready'));
    expect(target!.querySelector('svg')).toBeTruthy();
    expect(mermaidMocks.run).toHaveBeenCalledTimes(2);
    expect(mermaidMocks.run).toHaveBeenCalledWith(expect.objectContaining({ nodes: [target!] }));
  });

  it('re-renders Mermaid with versioned base-theme variables when appearance changes', async () => {
    const themeNode = `ThemeNode${Date.now()}`;
    installBrowser({ storage: { local: {
      get: vi.fn(async (key: string) => key === 'reader-settings'
        ? { 'reader-settings': { ...defaultSettings, enableMermaid: true, theme: 'light' } }
        : { 'recent-documents': [] }),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    } } });
    await createDocumentHandoff({
      title: 'Theme diagram.md',
      markdown: `# Theme diagram\n\n\`\`\`mermaid\nflowchart LR\n${themeNode}-->Dark\n\`\`\``,
    }, { id: 'theme-mermaid', now: Date.now() });
    history.replaceState(null, '', '/viewer.html?handoff=theme-mermaid');
    const user = userEvent.setup();
    render(<App />);

    const target = await waitFor(() => {
      const node = document.querySelector<HTMLElement>('.mermaid');
      expect(node?.dataset.resourceState).toBe('ready');
      expect(node?.dataset.mermaidTheme).toBe('light');
      return node!;
    });
    const lightSvg = target.innerHTML;
    expect(target.querySelector('svg')?.dataset.darkMode).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Reader settings' }));
    const drawer = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.settings-drawer[aria-label="Reader settings"]');
      expect(element).toBeTruthy();
      return element!;
    });
    await user.click(within(drawer).getByRole('button', { name: /Dark/ }));
    const darkTarget = await waitFor(() => {
      const node = document.querySelector<HTMLElement>('.mermaid');
      expect(node?.dataset.mermaidTheme).toBe('dark');
      expect(node?.querySelector('svg')?.dataset.darkMode).toBe('true');
      return node!;
    });
    const darkSvg = darkTarget.innerHTML;
    expect(darkSvg).not.toBe(lightSvg);

    await user.click(within(drawer).getByRole('button', { name: /Light/ }));
    await waitFor(() => {
      const node = document.querySelector<HTMLElement>('.mermaid');
      expect(node?.dataset.mermaidTheme).toBe('light');
      expect(node?.innerHTML).toBe(lightSvg);
    });
    expect(mermaidMocks.run.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps menus, command center, URL dialog, and settings mutually exclusive', async () => {
    installBrowser();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    expect(document.querySelector('.open-menu')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.querySelector('.open-menu')).toBeNull();
    const command = await screen.findByRole('dialog', { name: 'Command center' });
    await user.click(within(command).getByRole('button', { name: /Open URL/ }));
    expect(screen.queryByRole('dialog', { name: 'Command center' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Open Markdown from the web' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const nextCommand = await screen.findByRole('dialog', { name: 'Command center' });
    await user.click(within(nextCommand).getByRole('button', { name: /Reader settings/ }));
    expect(screen.queryByRole('dialog', { name: 'Command center' })).toBeNull();
    await waitFor(() => expect(document.querySelector('.settings-drawer[aria-label="Reader settings"]')).toBeTruthy());
  });

  it('preserves native find and implements the displayed open shortcuts', async () => {
    installBrowser();
    const openFilePicker = vi.fn(async () => []);
    const openDirectoryPicker = vi.fn(async () => { throw new DOMException('Cancelled', 'AbortError'); });
    vi.stubGlobal('showOpenFilePicker', openFilePicker);
    vi.stubGlobal('showDirectoryPicker', openDirectoryPicker);
    render(<App />);
    await screen.findByLabelText('Document navigation');

    const nativeFind = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
    window.dispatchEvent(nativeFind);
    expect(nativeFind.defaultPrevented).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Command center' })).toBeNull();

    fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
    await waitFor(() => expect(openFilePicker).toHaveBeenCalledOnce());
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(openDirectoryPicker).toHaveBeenCalledOnce());
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Open Markdown from the web' })).toBeTruthy();
  });

  it('jumps to and highlights a structured document search result', async () => {
    installBrowser();
    await createDocumentHandoff({
      title: 'Searchable.md',
      markdown: '# Searchable\n\nIntro.\n\n## Details\n\nFind the needle in this paragraph.',
    }, { id: 'search-document', now: Date.now() });
    history.replaceState(null, '', '/viewer.html?handoff=search-document');
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Find the needle in this paragraph.');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Command center' });
    await user.type(within(palette).getByPlaceholderText('Type a command, filename, or URL…'), 'needle');
    await user.click(within(palette).getByRole('button', { name: /Find the needle in this paragraph/ }));

    await waitFor(() => expect(document.querySelector('mark[data-quire-search-hit]')?.textContent).toBe('needle'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
