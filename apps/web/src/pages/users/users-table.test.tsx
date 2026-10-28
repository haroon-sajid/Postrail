import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/api/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UsersTable } from './users-table';

const ada: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  email_verified: true,
  name: 'Ada Lovelace',
  image: null,
  providers: ['google'],
  created_at: '2026-09-29T00:00:00.000Z',
  last_sign_in_at: '2026-10-01T00:00:00.000Z',
};

const grace: AuthUser = {
  ...ada,
  id: '22222222-2222-4222-8222-222222222222',
  email: 'grace@example.com',
  name: null,
  providers: [],
  last_sign_in_at: null,
};

function renderTable(canManage = true) {
  const handlers = { onSignOut: vi.fn(), onDelete: vi.fn() };
  render(
    <TooltipProvider>
      <UsersTable users={[ada, grace]} canManage={canManage} {...handlers} />
    </TooltipProvider>,
  );
  return handlers;
}

describe('<UsersTable />', () => {
  it('shows each user with how they sign in', () => {
    renderTable();
    const [, adaRow, graceRow] = screen.getAllByRole('row');
    if (!adaRow || !graceRow) throw new Error('expected a header and two rows');

    expect(within(adaRow).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(adaRow).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(adaRow).getByText('Google')).toBeInTheDocument();

    // No linked provider: this user has only ever used an emailed link or code.
    expect(within(graceRow).getByText('Email')).toBeInTheDocument();
    expect(within(graceRow).getByText('—')).toBeInTheDocument();
  });

  it('offers sign-out and delete for the chosen user', async () => {
    const handlers = renderTable();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Actions for grace@example.com' }));
    await user.click(await screen.findByRole('menuitem', { name: /sign out everywhere/i }));
    expect(handlers.onSignOut).toHaveBeenCalledWith(grace);

    await user.click(screen.getByRole('button', { name: 'Actions for ada@example.com' }));
    await user.click(await screen.findByRole('menuitem', { name: /delete user/i }));
    expect(handlers.onDelete).toHaveBeenCalledWith(ada);
  });

  it('hides the actions from members', () => {
    renderTable(false);
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
  });
});
