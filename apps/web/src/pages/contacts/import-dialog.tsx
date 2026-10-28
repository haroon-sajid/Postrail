import { MAX_CONTACT_IMPORT } from '@postrail/shared/browser';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { ContactList } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError, FieldHint, Label, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { contactsFromCsv, inBatches } from './csv';
import type { ImportContactsBody } from './hooks';

/** Radix Select cannot hold an empty value, so "no list" needs a name of its own. */
const NO_LIST = '__none__';

export interface ImportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: ContactList[];
  importBatch: (body: ImportContactsBody) => Promise<{ created: number; updated: number }>;
}

/** Paste or pick a CSV; it is read in the browser and sent as batches the API accepts. */
export function ImportContactsDialog({
  open,
  onOpenChange,
  lists,
  importBatch,
}: ImportContactsDialogProps) {
  const [text, setText] = useState('');
  const [listId, setListId] = useState(NO_LIST);
  const [pending, setPending] = useState(false);
  const parsed = useMemo(() => contactsFromCsv(text), [text]);
  const ready = parsed.contacts.length > 0;

  const close = (next: boolean) => {
    if (!next) {
      setText('');
      setListId(NO_LIST);
    }
    onOpenChange(next);
  };

  const run = async () => {
    setPending(true);
    let created = 0;
    let updated = 0;
    try {
      for (const contacts of inBatches(parsed.contacts, MAX_CONTACT_IMPORT)) {
        const result = await importBatch({
          contacts,
          ...(listId === NO_LIST ? {} : { list_id: listId }),
        });
        created += result.created;
        updated += result.updated;
      }
      toast.success(`Added ${created}, updated ${updated}`);
      close(false);
    } catch (error) {
      // Earlier batches are already saved; say so rather than imply nothing happened.
      const done = created + updated;
      toast.error(done > 0 ? `${errorMessage(error)} (${done} were saved)` : errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            A CSV with an <code>email</code> column. Every other column becomes a property, so a
            &quot;First Name&quot; column fills <code>{'{{first_name}}'}</code>. Contacts you
            already have are updated, not duplicated.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="contacts-file">CSV file</Label>
            <input
              id="contacts-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-bg file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-bg-subtle"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setText(await file.text());
              }}
            />
          </div>
          <div>
            <Label htmlFor="contacts-csv">Or paste it</Label>
            <Textarea
              id="contacts-csv"
              rows={7}
              placeholder={'email,first_name\nada@example.com,Ada\ngrace@example.com,Grace'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-xs"
            />
            {text.trim() !== '' && !ready ? (
              <FieldError message="No usable rows. The file needs an email column, or one address per line." />
            ) : (
              <FieldHint>
                {ready
                  ? `${parsed.contacts.length} ${parsed.contacts.length === 1 ? 'contact' : 'contacts'} ready` +
                    (parsed.columns.length > 0 ? `, with ${parsed.columns.join(', ')}.` : '.')
                  : 'Nothing to import yet.'}
              </FieldHint>
            )}
            {parsed.skipped.length > 0 ? (
              <p className="mt-1.5 text-xs text-warning-fg" role="status">
                {parsed.skipped.length} {parsed.skipped.length === 1 ? 'row' : 'rows'} will be
                skipped, e.g. line {parsed.skipped[0]?.line}: {parsed.skipped[0]?.reason}.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="contacts-list">Add them to a list</Label>
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger id="contacts-list" aria-label="Add them to a list">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LIST}>No list</SelectItem>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} loading={pending} onClick={() => void run()}>
            Import {ready ? parsed.contacts.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
