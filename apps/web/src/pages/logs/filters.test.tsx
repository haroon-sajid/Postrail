import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DEFAULT_FILTERS, readFilters, toQuery, writeFilters } from './filters';
import { FiltersBar } from './filters-bar';

const mailboxes = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'a@example.com',
    provider: 'google' as const,
    status: 'active' as const,
    daily_limit: 400,
    sent_today: 0,
    created_at: '2026-09-29T00:00:00.000Z',
  },
];

describe('log filters <-> URL', () => {
  it('round-trips through search params and drops defaults', () => {
    const params = writeFilters({
      ...DEFAULT_FILTERS,
      status: 'failed',
      q: 'invoice',
      range: '30d',
    });
    expect(params.toString()).toBe('status=failed&range=30d&q=invoice');
    expect(readFilters(params)).toEqual({
      ...DEFAULT_FILTERS,
      status: 'failed',
      q: 'invoice',
      range: '30d',
    });
    expect(writeFilters(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('ignores garbage in the URL', () => {
    const params = new URLSearchParams('status=bogus&range=1y');
    expect(readFilters(params)).toEqual(DEFAULT_FILTERS);
  });

  it('turns presets into a from bound and custom into explicit bounds', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    expect(toQuery({ ...DEFAULT_FILTERS, range: '24h' }, now)).toMatchObject({
      limit: 25,
      from: '2026-09-28T12:00:00.000Z',
    });
    const custom = toQuery(
      { ...DEFAULT_FILTERS, range: 'custom', from: '2026-09-01T00:00', to: '2026-09-02T00:00' },
      now,
    );
    // datetime-local values are in the user's timezone; the API gets them as UTC instants.
    expect(custom.from).toBe(new Date('2026-09-01T00:00').toISOString());
    expect(custom.to).toBe(new Date('2026-09-02T00:00').toISOString());
  });
});

describe('<FiltersBar />', () => {
  it('applies typed search on Enter and resets the cursor', async () => {
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <FiltersBar
          filters={{ ...DEFAULT_FILTERS, cursor: 'abc' }}
          mailboxes={mailboxes}
          onChange={onChange}
        />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search by recipient/i), 'alice{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, q: 'alice', cursor: '' });
  });

  it('shows the custom date inputs only for a custom range and offers Clear when filtered', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <FiltersBar filters={DEFAULT_FILTERS} mailboxes={mailboxes} onChange={onChange} />
      </TooltipProvider>,
    );
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <FiltersBar
          filters={{ ...DEFAULT_FILTERS, range: 'custom', status: 'sent' }}
          mailboxes={mailboxes}
          onChange={onChange}
        />
      </TooltipProvider>,
    );
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });
});
