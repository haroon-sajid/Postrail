import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RedirectUrlsEditor } from './redirect-urls';

const SAVED = 'https://app.example.com/auth/callback';

function renderEditor(urls: string[] = [SAVED], canManage = true) {
  const onSave = vi.fn((_urls: string[]) => Promise.resolve(true));
  render(
    <TooltipProvider>
      <RedirectUrlsEditor urls={urls} canManage={canManage} onSave={onSave} />
    </TooltipProvider>,
  );
  return { onSave, save: screen.queryByRole('button', { name: 'Save redirect URLs' }) };
}

/** Sets the box in one event. Typing a URL a key at a time is slow enough to time out. */
function fill(value: string) {
  const input = screen.getByLabelText('Add a redirect URL');
  fireEvent.change(input, { target: { value } });
  return input;
}

describe('<RedirectUrlsEditor />', () => {
  it('has nothing to save until the list changes', () => {
    const { save } = renderEditor();
    expect(screen.getByText(SAVED)).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it('adds a normalised URL and saves the whole list', async () => {
    const { onSave, save } = renderEditor();
    const user = userEvent.setup();
    await user.type(fill('http://localhost:3000'), '{Enter}');

    expect(screen.getByText('http://localhost:3000/')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(save as HTMLElement);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([SAVED, 'http://localhost:3000/']));
  });

  it('refuses plain http, a query string and a duplicate', async () => {
    const { save } = renderEditor();
    const user = userEvent.setup();

    for (const bad of ['http://app.example.com/callback', `${SAVED}?next=1`]) {
      fill(bad);
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/https URL/);
    }

    fill(SAVED);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already in the list/);
    expect(save).toBeDisabled();
  });

  it('removes a URL and saves the shorter list', async () => {
    const { onSave, save } = renderEditor();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Remove ${SAVED}` }));
    expect(screen.getByText(/No redirect URLs yet/)).toBeInTheDocument();
    await user.click(save as HTMLElement);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([]));
  });

  it('is read-only for members', () => {
    const { save } = renderEditor([SAVED], false);
    expect(screen.getByText(SAVED)).toBeInTheDocument();
    expect(save).toBeNull();
    expect(screen.queryByLabelText('Add a redirect URL')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Remove ${SAVED}` })).not.toBeInTheDocument();
  });
});
