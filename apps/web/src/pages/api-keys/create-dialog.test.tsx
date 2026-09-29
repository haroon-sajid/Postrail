import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiKeyCreated } from '@/api/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CreateKeyDialog } from './create-dialog';

const created: ApiKeyCreated = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Production',
  prefix: 'pr_live_AbCdEfGh',
  key: 'pr_live_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  created_at: '2026-09-29T00:00:00.000Z',
  last_used_at: null,
  revoked_at: null,
  created_by: { id: '22222222-2222-4222-8222-222222222222', email: 'ada@example.com' },
};

function renderDialog(create = vi.fn(() => Promise.resolve(created))) {
  const onOpenChange = vi.fn();
  render(
    <TooltipProvider>
      <CreateKeyDialog open onOpenChange={onOpenChange} create={create} />
    </TooltipProvider>,
  );
  return { create, onOpenChange };
}

describe('<CreateKeyDialog />', () => {
  it('requires a name', async () => {
    const { create } = renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: /create key/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the key and reveals it once with a warning', async () => {
    const { create } = renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Production');
    await user.click(screen.getByRole('button', { name: /create key/i }));

    expect(create).toHaveBeenCalledWith('Production');
    await waitFor(() => expect(screen.getByTestId('secret-value')).toHaveTextContent(created.key));
    expect(screen.getByText(/only time the full key is shown/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^api key: pr_live_/i })).toBeInTheDocument();
  });

  it('closes and forgets the key on Done', async () => {
    const { onOpenChange } = renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Production');
    await user.click(screen.getByRole('button', { name: /create key/i }));
    await user.click(await screen.findByRole('button', { name: /done/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('surfaces an API error and keeps the form', async () => {
    const create = vi.fn(() => Promise.reject(new Error('requires the admin role')));
    renderDialog(create);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'x');
    await user.click(screen.getByRole('button', { name: /create key/i }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByTestId('secret-value')).not.toBeInTheDocument();
  });
});
