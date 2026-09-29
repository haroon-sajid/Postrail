import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Mailbox } from '@/api/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MailboxCard } from './mailbox-card';

const base: Mailbox = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'sender@example.com',
  provider: 'google',
  status: 'active',
  daily_limit: 400,
  sent_today: 320,
  last_used_at: null,
  created_at: '2026-09-29T00:00:00.000Z',
};

function renderCard(overrides: Partial<Mailbox> = {}, canManage = true) {
  const handlers = {
    onLimitChange: vi.fn(),
    onPauseToggle: vi.fn(),
    onReconnect: vi.fn(),
    onDisconnect: vi.fn(),
  };
  render(
    <TooltipProvider>
      <MailboxCard mailbox={{ ...base, ...overrides }} canManage={canManage} {...handlers} />
    </TooltipProvider>,
  );
  return handlers;
}

describe('<MailboxCard />', () => {
  it('shows the address, status and usage', () => {
    renderCard();
    expect(screen.getByText('sender@example.com')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
    expect(screen.getByText(/last used/i)).toHaveTextContent('—');
  });

  it('edits the daily limit inline and commits on Enter', async () => {
    const handlers = renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /daily limit 400/i }));
    const input = screen.getByLabelText('Daily limit');
    await user.clear(input);
    await user.type(input, '250{Enter}');
    expect(handlers.onLimitChange).toHaveBeenCalledWith(250);
  });

  it('rejects an out-of-range limit without calling back', async () => {
    const handlers = renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /daily limit 400/i }));
    const input = screen.getByLabelText('Daily limit');
    await user.clear(input);
    await user.type(input, '0{Enter}');
    expect(handlers.onLimitChange).not.toHaveBeenCalled();
  });

  it('shows the amber banner and reconnect for a disconnected mailbox', async () => {
    const handlers = renderCard({ status: 'disconnected' });
    expect(screen.getByText(/lost its google access/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /reconnect/i }));
    expect(handlers.onReconnect).toHaveBeenCalled();
  });

  it('hides management actions from members', () => {
    renderCard({}, false);
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /daily limit 400/i })).toBeDisabled();
  });
});
