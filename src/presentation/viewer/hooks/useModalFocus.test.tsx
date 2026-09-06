import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useModalFocus } from './useModalFocus';

function Modal({ onClose }: { onClose(): void }) {
  const modalRef = useModalFocus<HTMLDivElement>(onClose);
  return (
    <div ref={modalRef} role="dialog" aria-label="Test dialog" tabIndex={-1}>
      <button>First action</button>
      <button>Last action</button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <main>Background content</main>
      {open && <Modal onClose={() => setOpen(false)} />}
    </>
  );
}

describe('useModalFocus', () => {
  it('isolates the background, traps focus, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    const background = screen.getByRole('main');

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' });
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });

    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(trigger.inert).toBe(true);
    expect(background.inert).toBe(true);

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.body.contains(dialog)).toBe(false));
    expect(trigger.inert).not.toBe(true);
    expect(background.inert).not.toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('focuses the container when a modal has no interactive descendants', async () => {
    function EmptyModal() {
      const modalRef = useModalFocus<HTMLDivElement>(vi.fn());
      return <div ref={modalRef} role="dialog" aria-label="Empty dialog" tabIndex={-1} />;
    }

    render(<EmptyModal />);
    const dialog = screen.getByRole('dialog', { name: 'Empty dialog' });
    await waitFor(() => expect(document.activeElement).toBe(dialog));

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
  });
});
