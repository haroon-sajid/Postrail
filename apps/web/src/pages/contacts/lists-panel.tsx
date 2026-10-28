import { ListPlus, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { ContactList } from '@/api/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/states';
import { RelativeTime } from '@/components/time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber } from '@/lib/format';

export interface ListsPanelProps {
  lists: ContactList[];
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Opens the contacts tab filtered to this list. */
  onOpen: (list: ContactList) => void;
}

/** The named groups a broadcast is sent to: create, rename, delete, and jump to members. */
export function ListsPanel({ lists, onCreate, onRename, onDelete, onOpen }: ListsPanelProps) {
  const [naming, setNaming] = useState<{ list?: ContactList } | null>(null);
  const [deleting, setDeleting] = useState<ContactList | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-border bg-bg-subtle/40 px-5 py-4">
          <p className="text-sm text-fg-muted">
            A broadcast goes to one list. A contact can be on as many as you like.
          </p>
          <Button variant="primary" onClick={() => setNaming({})}>
            <ListPlus /> New list
          </Button>
        </div>
        {lists.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title="No lists yet"
            description="Create one, then add contacts to it by hand or when you import a CSV."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => (
                <TableRow key={list.id} data-clickable onClick={() => onOpen(list)}>
                  <TableCell className="font-medium">{list.name}</TableCell>
                  <TableCell className="tabular">{formatNumber(list.contact_count)}</TableCell>
                  <TableCell>
                    <RelativeTime value={list.created_at} className="text-fg-muted" />
                  </TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Rename ${list.name}`}
                        className="text-fg-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNaming({ list });
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${list.name}`}
                        className="text-fg-muted hover:text-danger-fg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(list);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!naming} onOpenChange={(o) => !o && setNaming(null)}>
        <DialogContent size="sm">
          <ListNameForm
            key={naming?.list?.id ?? 'new'}
            list={naming?.list}
            onCancel={() => setNaming(null)}
            onSubmit={async (name) => {
              try {
                if (naming?.list) await onRename(naming.list.id, name);
                else await onCreate(name);
                toast.success(naming?.list ? 'List renamed' : `Created "${name}"`);
                setNaming(null);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name ?? ''}"?`}
        description="The list goes; the contacts on it stay. A broadcast already sent to it keeps its history."
        confirmLabel="Delete list"
        destructive
        pending={pending}
        onConfirm={async () => {
          if (!deleting) return;
          setPending(true);
          try {
            await onDelete(deleting.id);
            toast.success(`Deleted "${deleting.name}"`);
            setDeleting(null);
          } catch (error) {
            toast.error(errorMessage(error));
          } finally {
            setPending(false);
          }
        }}
      />
    </>
  );
}

function ListNameForm({
  list,
  onCancel,
  onSubmit,
}: {
  list?: ContactList | undefined;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(list?.name ?? '');
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!trimmed) return;
        setSaving(true);
        await onSubmit(trimmed);
        setSaving(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>{list ? 'Rename list' : 'New list'}</DialogTitle>
        <DialogDescription>Only you see the name. Recipients never do.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Label htmlFor="list-name">List name</Label>
        <Input
          id="list-name"
          autoFocus
          maxLength={80}
          placeholder="Newsletter"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!trimmed} loading={saving}>
          {list ? 'Save' : 'Create list'}
        </Button>
      </DialogFooter>
    </form>
  );
}
