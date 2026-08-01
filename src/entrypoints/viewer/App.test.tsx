import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared/settings';
import { App } from './App';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), run: vi.fn(async () => undefined) },
}));

function installBrowser(overrides: Record<string, unknown> = {}) {
  const local = {
    get: vi.fn(async (key: string | string[]) => {
      if (key === 'reader-settings') return { 'reader-settings': { ...defaultSettings, enableMermaid: false } };
      if (key === 'recent-documents') return { 'recent-documents': [] };
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

describe('Quire viewer experience', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    cleanup();
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
    await user.click(document.querySelector<HTMLElement>('.open-trigger')!);
    await user.click(within(document.querySelector<HTMLElement>('.open-menu')!).getByText('Open URL').closest('button')!);

    const urlDialog = document.querySelector<HTMLElement>('.url-dialog')!;
    await user.type(within(urlDialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/readme.md');
    await user.click(within(urlDialog).getByText('Open'));

    await waitFor(() => expect(api.permissions.request).toHaveBeenCalledWith({ origins: ['https://docs.example.com/*'] }));
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Access was not granted'));
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
      'reader-settings': expect.objectContaining({ wideView: true }),
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
      'reader-settings': expect.objectContaining({ locale: 'zh-CN' }),
    })));
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
});
