import { MAX_CONTACT_PROPERTIES } from '@postrail/shared/browser';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { Contact, ContactList } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ContactValues {
  email: string;
  properties: Record<string, string>;
  list_ids: string[];
}

interface PropertyRow {
  name: string;
  value: string;
}

/** The first problem with the form, or undefined when it can be saved. */
export function validateContact(email: string, rows: PropertyRow[]): string | undefined {
  if (!EMAIL.test(email.trim())) return 'Enter an email address.';
  const names = rows.map((r) => r.name.trim()).filter((name) => name !== '');
  const bad = names.find((name) => !PROPERTY_NAME.test(name));
  if (bad) return `"${bad}" cannot be a property name. Use letters, digits and underscores.`;
  if (new Set(names).size !== names.length) return 'Each property name can be used once.';
  return undefined;
}

export interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing when set; adding otherwise. */
  existing?: Contact | undefined;
  lists: ContactList[];
  onSave: (values: ContactValues) => Promise<unknown>;
}

export function ContactDialog({ open, onOpenChange, existing, lists, onSave }: ContactDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {/* Keyed so the form starts from the contact being edited, or empty, every time. */}
        <ContactForm
          key={existing?.id ?? 'new'}
          existing={existing}
          lists={lists}
          onSave={onSave}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  existing,
  lists,
  onSave,
  onDone,
}: Pick<ContactDialogProps, 'existing' | 'lists' | 'onSave'> & { onDone: () => void }) {
  const [email, setEmail] = useState(existing?.email ?? '');
  const [rows, setRows] = useState<PropertyRow[]>(
    Object.entries(existing?.properties ?? {}).map(([name, value]) => ({ name, value })),
  );
  const [listIds, setListIds] = useState<string[]>(existing?.list_ids ?? []);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const setRow = (index: number, patch: Partial<PropertyRow>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const problem = validateContact(email, rows);
        setError(problem);
        if (problem) return;
        setSaving(true);
        try {
          await onSave({
            email: email.trim(),
            properties: Object.fromEntries(
              rows.filter((r) => r.name.trim() !== '').map((r) => [r.name.trim(), r.value]),
            ),
            list_ids: listIds,
          });
          toast.success(existing ? 'Contact saved' : `Added ${email.trim()}`);
          onDone();
        } catch (cause) {
          toast.error(errorMessage(cause));
        } finally {
          setSaving(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{existing ? 'Edit contact' : 'Add a contact'}</DialogTitle>
        <DialogDescription>
          Properties fill the placeholders of a template, so <code>first_name</code> here is{' '}
          <code>{'{{first_name}}'}</code> there.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div>
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            autoFocus={!existing}
            // The address is what identifies a contact; to change it, add a new one.
            disabled={!!existing}
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Properties</legend>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Property ${index + 1} name`}
                  placeholder="first_name"
                  className="font-mono text-xs"
                  value={row.name}
                  onChange={(e) => setRow(index, { name: e.target.value })}
                />
                <Input
                  aria-label={`Property ${index + 1} value`}
                  placeholder="Ada"
                  value={row.value}
                  onChange={(e) => setRow(index, { value: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove property ${index + 1}`}
                  className="text-fg-muted hover:text-danger-fg"
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className="mt-2"
            disabled={rows.length >= MAX_CONTACT_PROPERTIES}
            onClick={() => setRows([...rows, { name: '', value: '' }])}
          >
            <Plus /> Add property
          </Button>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Lists</legend>
          {lists.length === 0 ? (
            <FieldHint>No lists yet. Create one on the Lists tab to group contacts.</FieldHint>
          ) : (
            <div className="space-y-2">
              {lists.map((list) => (
                <label key={list.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={listIds.includes(list.id)}
                    onCheckedChange={(on) =>
                      setListIds(
                        on ? [...listIds, list.id] : listIds.filter((id) => id !== list.id),
                      )
                    }
                    aria-label={list.name}
                  />
                  {list.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <FieldError message={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {existing ? 'Save' : 'Add contact'}
        </Button>
      </DialogFooter>
    </form>
  );
}
