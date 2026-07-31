import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

  it('shows first-run choices and explains a denied remote permission', async () => {
    const { api } = installBrowser();
    const user = userEvent.setup();
    render(<App />);

    const onboarding = await screen.findByRole('dialog', { name: 'Your documents, set for reading.' });
    expect(within(onboarding).getAllByText('Private by design')).toHaveLength(2);
    await user.click(within(onboarding).getByRole('button', { name: /Open a web URL/ }));

    const urlDialog = screen.getByRole('dialog', { name: 'Open Markdown from the web' });
    await user.type(within(urlDialog).getByPlaceholderText('https://example.com/guide.md'), 'https://docs.example.com/readme.md');
    await user.click(within(urlDialog).getByRole('button', { name: 'Open' }));

    await waitFor(() => expect(api.permissions.request).toHaveBeenCalledWith({ origins: ['https://docs.example.com/*'] }));
    expect((await screen.findByRole('alert')).textContent).toContain('Access was not granted');
  });

  it('switches the complete reader UI to Simplified Chinese and persists it', async () => {
    const { local } = installBrowser();
    const user = userEvent.setup();
    render(<App />);

    const onboarding = await screen.findByRole('dialog', { name: 'Your documents, set for reading.' });
    await user.click(within(onboarding).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Reader settings' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'zh-CN');

    expect(await screen.findByText('按你的方式阅读')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开文件' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.markdown-body')?.textContent).toContain('Quire 将 Markdown 变成专注的阅读空间'));
    expect(screen.getByLabelText('文档导航')).toBeTruthy();
    await waitFor(() => expect(local.set).toHaveBeenCalledWith(expect.objectContaining({
      'reader-settings': expect.objectContaining({ locale: 'zh-CN' }),
    })));
  });
});
