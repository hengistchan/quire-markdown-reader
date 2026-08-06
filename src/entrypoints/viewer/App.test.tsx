import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared/settings';
import { createDocumentHandoff, takeDocumentHandoff } from '../../infrastructure/handoffStore';
import * as workspacePersistence from '../../core/workspacePersistence';
import { App } from './App';

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: async (options?: { nodes?: HTMLElement[] }) => {
    for (const node of options?.nodes ?? []) node.innerHTML = '<svg role="img" aria-label="Rendered Mermaid diagram"></svg>';
  },
  run: vi.fn(),
}));

vi.mock('mermaid', () => ({ default: { initialize: mermaidMocks.initialize, run: mermaidMocks.run } }));

function installBrowser(overrides: Record<string, unknown> = {}, recentItems: unknown = []) {
  const local = {
    get: vi.fn(async (key: string | string[]) => {
      if (key === 'reader-settings') return { 'reader-settings': { ...defaultSettings, enableMermaid: false } };
      if (key === 'recent-documents') return { 'recent-documents': recentItems };
      return { onboardingComplete: false };
    }),
    set: vi.fn(async () => undefined),
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
    mermaidMocks.initialize.mockClear();
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
    expect(location.search).toBe('');
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'zh-CN');

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
    const palette = screen.getByRole('dialog', { name: 'Command center' });
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
    vi.spyOn(workspacePersistence, 'loadWorkspaceRecord').mockImplementation(async (id) => ({
      id,
      kind: 'workspace',
      name: 'docs',
      handle: handles[id as keyof typeof handles],
      savedAt: 1,
    }));
    vi.spyOn(workspacePersistence, 'saveWorkspaceHandle').mockImplementation(async (_handle, id) => id ?? 'generated');
    installBrowser({}, { version: 2, items: [
      { id: 'workspace-file:first:first.md', title: 'first.md', kind: 'workspace-file', workspaceId: 'first', filePath: 'first.md', openedAt: 2, scrollPosition: 320, headingId: 'first-workspace' },
      { id: 'workspace-file:second:second.md', title: 'second.md', kind: 'workspace-file', workspaceId: 'second', filePath: 'second.md', openedAt: 1 },
    ] });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText('Document navigation');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await user.click(within(screen.getByRole('dialog', { name: 'Command center' })).getByRole('button', { name: /first.md/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('First workspace'));
    await user.click(screen.getByRole('button', { name: 'Continue reading' }));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }));

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const commandCenter = within(screen.getByRole('dialog', { name: 'Command center' }));
    const commandInput = commandCenter.getByPlaceholderText('Type a command, filename, or URL…');
    await user.type(commandInput, 'first');
    expect(commandCenter.getAllByRole('button', { name: /first.md/ })).toHaveLength(1);
    await user.clear(commandInput);
    await user.type(commandInput, 'second');
    await user.click(commandCenter.getByRole('button', { name: /second.md/ }));
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Second workspace'));
    expect(screen.getByRole('button', { name: 'Previous document' }).hasAttribute('disabled')).toBe(false);

    fireEvent.popState(window, { state: {
      quireWorkspaceNavigation: { workspaceId: 'first', filePath: 'first.md' },
    } });
    await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('First workspace'));
    expect(screen.getByRole('button', { name: 'Next document' }).hasAttribute('disabled')).toBe(false);
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

  it('keeps menus, command center, URL dialog, and settings mutually exclusive', async () => {
    installBrowser();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    expect(document.querySelector('.open-menu')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.querySelector('.open-menu')).toBeNull();
    const command = screen.getByRole('dialog', { name: 'Command center' });
    await user.click(within(command).getByRole('button', { name: /Open URL/ }));
    expect(screen.queryByRole('dialog', { name: 'Command center' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Open Markdown from the web' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const nextCommand = screen.getByRole('dialog', { name: 'Command center' });
    await user.click(within(nextCommand).getByRole('button', { name: /Reader settings/ }));
    expect(screen.queryByRole('dialog', { name: 'Command center' })).toBeNull();
    expect(document.querySelector('.settings-drawer[aria-label="Reader settings"]')).toBeTruthy();
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
    const palette = screen.getByRole('dialog', { name: 'Command center' });
    await user.type(within(palette).getByPlaceholderText('Type a command, filename, or URL…'), 'needle');
    await user.click(within(palette).getByRole('button', { name: /Find the needle in this paragraph/ }));

    await waitFor(() => expect(document.querySelector('mark[data-quire-search-hit]')?.textContent).toBe('needle'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
