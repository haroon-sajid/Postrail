import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Contact, ContactList } from '@/api/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ContactDialog, type ContactValues, validateContact } from './contact-dialog';

const news: ContactList = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Newsletter',
  contact_count: 3,
  created_at: '2026-10-01T00:00:00.000Z',
};

const ada: Contact = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  properties: { first_name: 'Ada' },
  list_ids: [news.id],
  suppressed: false,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

function renderDialog(existing?: Contact) {
  const onSave = vi.fn((_values: ContactValues) => Promise.resolve());
  const onOpenChange = vi.fn();
  render(
    <TooltipProvider>
      <ContactDialog
        open
        onOpenChange={onOpenChange}
        existing={existing}
        lists={[news]}
        onSave={onSave}
      />
    </TooltipProvider>,
  );
  return { onSave, onOpenChange };
}

/** Sets a field in one event. Typing a key at a time is slow enough to time out. */
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('validateContact', () => {
  it('wants an email and property names a template can use, each once', () => {
    expect(validateContact('nope', [])).toMatch(/email/);
    expect(validateContact('a@b.co', [{ name: 'first name', value: 'x' }])).toMatch(/first name/);
    const twice = [
      { name: 'plan', value: 'a' },
      { name: 'plan', value: 'b' },
    ];
    expect(validateContact('a@b.co', twice)).toMatch(/once/);
    // A row left blank is ignored rather than refused.
    expect(validateContact('a@b.co', [{ name: '', value: '' }])).toBeUndefined();
  });
});

describe('<ContactDialog />', () => {
  it('adds a contact with a property and a list', async () => {
    const { onSave, onOpenChange } = renderDialog();
    const user = userEvent.setup();
    fill('Email', 'grace@example.com');
    await user.click(screen.getByRole('button', { name: 'Add property' }));
    fill('Property 1 name', 'first_name');
    fill('Property 1 value', 'Grace');
    await user.click(screen.getByRole('checkbox', { name: 'Newsletter' }));
    await user.click(screen.getByRole('button', { name: 'Add contact' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        email: 'grace@example.com',
        properties: { first_name: 'Grace' },
        list_ids: [news.id],
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('says what is wrong instead of saving', async () => {
    const { onSave } = renderDialog();
    fill('Email', 'not-an-email');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/email address/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('starts from the contact being edited and keeps its address fixed', async () => {
    const { onSave } = renderDialog(ada);
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Property 1 name')).toHaveValue('first_name');
    expect(screen.getByRole('checkbox', { name: 'Newsletter' })).toBeChecked();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove property 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Newsletter' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ email: ada.email, properties: {}, list_ids: [] }),
    );
  });
});
