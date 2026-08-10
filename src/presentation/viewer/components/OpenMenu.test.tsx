import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecentResource } from '../../../application/ports/recentResourceRepository';
import { createTranslator } from '../../../shared/i18n';
import { OpenMenu } from './OpenMenu';

const shortcuts = { openFile: '⌘O', openFolder: '⇧⌘O', openUrl: '⌘L', command: '⌘K' };
const t = createTranslator('en');

function resource(index: number, kind: RecentResource['kind'] = 'local-file'): RecentResource {
  if (kind === 'workspace') {
    return {
      id: `workspace:${index}`,
      title: `Workspace ${index}`,
      kind,
      workspaceId: String(index),
      openedAt: index,
    };
  }
  if (kind === 'remote') {
    return {
      id: `remote:https://example.com/${index}.md`,
      title: `Remote ${index}`,
      kind,
      url: `https://example.com/${index}.md`,
      openedAt: index,
    };
  }
  return {
    id: `local-file:${index}`,
    title: `File ${index}.md`,
    kind,
    fileId: String(index),
    openedAt: index,
  };
}

function renderMenu(recent: RecentResource[] = []) {
  const actions = {
    onFile: vi.fn(),
    onFolder: vi.fn(),
    onUrl: vi.fn(),
    onRecent: vi.fn(),
    onRemoveRecent: vi.fn(),
    onViewAllRecent: vi.fn(),
    onClose: vi.fn(),
  };
  const rendered = render(<OpenMenu t={t} shortcuts={shortcuts} recent={recent} {...actions} />);
  return { ...rendered, actions };
}

describe('OpenMenu Recent Resources', () => {
  afterEach(() => vi.restoreAllMocks());

  it('omits an empty recent section and keeps all Open actions', () => {
    const { container } = renderMenu();

    expect(container.querySelector('.recent-resource-section')).toBeNull();
    expect(screen.getByRole('button', { name: /Open file/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open folder/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open URL/ })).toBeTruthy();
  });

  it('shows at most five mixed resources with contextual secondary text', () => {
    const recent = [
      resource(6, 'workspace'),
      resource(5, 'remote'),
      resource(4),
      resource(3),
      resource(2),
      resource(1),
    ];
    renderMenu(recent);

    const section = screen.getByLabelText('Recently opened');
    expect(within(section).getAllByRole('button')).toHaveLength(11);
    expect(within(section).getByText('Workspace')).toBeTruthy();
    expect(within(section).getByText('example.com')).toBeTruthy();
    expect(within(section).queryByText('File 1.md')).toBeNull();
    expect(within(section).getByRole('button', { name: 'View all recent…' })).toBeTruthy();
  });

  it('opens and removes independently without nested buttons', async () => {
    const user = userEvent.setup();
    const item = resource(1);
    const { container, actions } = renderMenu([item]);

    expect(container.querySelector('button button')).toBeNull();
    await user.click(screen.getByRole('button', { name: /File 1.md Local file/ }));
    expect(actions.onRecent).toHaveBeenCalledWith(item);
    expect(actions.onRemoveRecent).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove from recent: File 1.md' }));
    expect(actions.onRemoveRecent).toHaveBeenCalledWith(item.id);
    expect(actions.onRecent).toHaveBeenCalledOnce();
  });

  it('uses one Arrow/Enter sequence across recent resources, View all, and Open actions', async () => {
    const user = userEvent.setup();
    const item = resource(1, 'workspace');
    const { container, actions } = renderMenu([item]);
    const menu = container.querySelector<HTMLElement>('.open-menu')!;

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Workspace 1 Workspace/ }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View all recent…' }));
    await user.keyboard('{Enter}');
    expect(actions.onViewAllRecent).toHaveBeenCalledOnce();

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Open file/ }));
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(actions.onClose).toHaveBeenCalledOnce();
  });
});
