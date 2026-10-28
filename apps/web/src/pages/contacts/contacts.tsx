import {
  ChevronLeft,
  ChevronRight,
  Contact as ContactIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { Contact, ContactList } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, PageEmptyState, TableSkeleton } from '@/components/states';
import { RelativeTime } from '@/components/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LineTabsList, LineTabsTrigger, Tabs, TabsContent } from '@/components/ui/tabs';
import { ContactDialog } from './contact-dialog';
import {
  useContactLists,
  useContacts,
  useCreateContactList,
  useDeleteContact,
  useDeleteContactList,
  useImportContacts,
  useRenameContactList,
  useUpdateContact,
  useUpsertContact,
} from './hooks';
import { ImportContactsDialog } from './import-dialog';
import { ListsPanel } from './lists-panel';

/** Radix Select cannot hold an empty value, so "every list" needs a name of its own. */
const ALL_LISTS = '__all__';
/** Properties shown inline before the rest collapse into a count. */
const SHOWN_PROPERTIES = 2;

/**
 * People and the lists they are on, as two tabs. The open tab lives in the URL
 * (`?tab=lists`) so a link lands on it.
 */
export function ContactsPage() {
  const { org } = useOrg();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'lists' ? 'lists' : 'contacts';
  const setTab = (next: string) =>
    setParams(next === 'lists' ? { tab: 'lists' } : {}, { replace: true });

  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [listId, setListId] = useState('');
  const [cursor, setCursor] = useState('');
  // Cursor pagination only goes forward; remember where we came from for "Previous".
  const [history, setHistory] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'add' | 'import' | null>(null);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const contacts = useContacts(org.id, { q, listId, cursor });
  const lists = useContactLists(org.id);
  const upsert = useUpsertContact(org.id);
  const update = useUpdateContact(org.id);
  const remove = useDeleteContact(org.id);
  const importContacts = useImportContacts(org.id);
  const createList = useCreateContactList(org.id);
  const renameList = useRenameContactList(org.id);
  const deleteList = useDeleteContactList(org.id);

  const rows = contacts.data?.data ?? [];
  const allLists = lists.data ?? [];
  const listNames = new Map(allLists.map((l) => [l.id, l.name]));
  // Nobody at all, as opposed to a search, a list or a later page that came back empty.
  const noContactsAtAll = contacts.data?.data.length === 0 && !q && !listId && !cursor;

  const firstPage = (change: () => void) => {
    change();
    setCursor('');
    setHistory([]);
  };
  const showList = (list: ContactList) => {
    firstPage(() => setListId(list.id));
    setTab('contacts');
  };

  const actions = (
    <>
      <Button variant="secondary" onClick={() => setDialog('import')}>
        <Upload /> Import
      </Button>
      <Button variant="primary" onClick={() => setDialog('add')}>
        <Plus /> Add contact
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Contacts"
        description="The people you send to, and the lists they are on."
        actions={actions}
      />
      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col">
        <LineTabsList aria-label="Contacts sections">
          <LineTabsTrigger value="contacts">Contacts</LineTabsTrigger>
          <LineTabsTrigger value="lists">Lists</LineTabsTrigger>
        </LineTabsList>

        <TabsContent
          value="contacts"
          className="flex flex-1 flex-col pt-5 focus-visible:outline-none"
        >
          {noContactsAtAll ? (
            <PageEmptyState
              icon={ContactIcon}
              title="No contacts yet"
              description="Add one by hand or import a CSV. Then group them into lists and send a broadcast."
              action={actions}
            />
          ) : (
            <Card>
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-bg-subtle/40 px-5 py-4">
                <form
                  role="search"
                  className="relative w-full max-w-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    firstPage(() => setQ(draft.trim()));
                  }}
                >
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-fg-muted" />
                  <Input
                    type="search"
                    aria-label="Search contacts"
                    placeholder="Search by email, then press Enter"
                    className="pl-9"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      // Clearing the box should not need a second keypress to show everyone.
                      if (e.target.value === '' && q) firstPage(() => setQ(''));
                    }}
                  />
                </form>
                <div className="w-48">
                  <Select
                    value={listId || ALL_LISTS}
                    onValueChange={(v) => firstPage(() => setListId(v === ALL_LISTS ? '' : v))}
                  >
                    <SelectTrigger aria-label="Filter by list">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_LISTS}>All lists</SelectItem>
                      {allLists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {contacts.isPending ? (
                <TableSkeleton rows={6} cols={4} />
              ) : contacts.isError ? (
                <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
              ) : rows.length === 0 ? (
                <EmptyState
                  title="No matches"
                  description="No contact matches this search and list."
                />
              ) : (
                <Table className={contacts.isPlaceholderData ? 'opacity-60' : undefined}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Properties</TableHead>
                      <TableHead>Lists</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="max-w-72">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{contact.email}</span>
                            <CopyButton value={contact.email} label="Email" />
                            {contact.suppressed ? <Badge tone="warning">Suppressed</Badge> : null}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-72">
                          <Properties properties={contact.properties} />
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1">
                            {contact.list_ids.map((id) => (
                              <Badge key={id} tone="outline">
                                {listNames.get(id) ?? 'List'}
                              </Badge>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <RelativeTime value={contact.created_at} className="text-fg-muted" />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${contact.email}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(contact)}>
                                <Pencil /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => setDeleting(contact)}>
                                <Trash2 /> Delete contact
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <div className="flex items-center justify-between border-t border-border bg-bg-subtle/40 px-5 py-3 text-xs text-fg-muted">
                <span>{rows.length > 0 ? `${rows.length} on this page` : ''}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={history.length === 0}
                    onClick={() => {
                      setCursor(history.at(-1) ?? '');
                      setHistory((h) => h.slice(0, -1));
                    }}
                  >
                    <ChevronLeft /> Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!contacts.data?.next_cursor}
                    onClick={() => {
                      setHistory((h) => [...h, cursor]);
                      setCursor(contacts.data?.next_cursor ?? '');
                    }}
                  >
                    Next <ChevronRight />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="lists" className="pt-5 focus-visible:outline-none">
          {lists.isError ? (
            <Card>
              <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
            </Card>
          ) : (
            <ListsPanel
              lists={allLists}
              onCreate={(name) => createList.mutateAsync(name)}
              onRename={(id, name) => renameList.mutateAsync({ id, name })}
              onDelete={(id) => deleteList.mutateAsync(id)}
              onOpen={showList}
            />
          )}
        </TabsContent>
      </Tabs>

      <ContactDialog
        open={dialog === 'add' || !!editing}
        onOpenChange={(o) => {
          if (o) return;
          setDialog(null);
          setEditing(null);
        }}
        existing={editing ?? undefined}
        lists={allLists}
        onSave={({ email, properties, list_ids }) =>
          editing
            ? update.mutateAsync({ id: editing.id, body: { properties, list_ids } })
            : upsert.mutateAsync({ email, properties, list_ids })
        }
      />
      <ImportContactsDialog
        open={dialog === 'import'}
        onOpenChange={(o) => setDialog(o ? 'import' : null)}
        lists={allLists}
        importBatch={(body) => importContacts.mutateAsync(body)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.email ?? ''}?`}
        description="The contact leaves every list. Messages already sent to them stay in Logs."
        confirmLabel="Delete contact"
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(`Deleted ${deleting.email}`);
            setDeleting(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}

function Properties({ properties }: { properties: Record<string, string> }) {
  const entries = Object.entries(properties);
  if (entries.length === 0) return <span className="text-fg-faint">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {entries.slice(0, SHOWN_PROPERTIES).map(([name, value]) => (
        <code key={name} className="max-w-40 truncate rounded bg-bg-muted px-1 py-0.5 text-xs">
          {name}: {value}
        </code>
      ))}
      {entries.length > SHOWN_PROPERTIES ? (
        <span className="text-xs text-fg-muted">+{entries.length - SHOWN_PROPERTIES}</span>
      ) : null}
    </span>
  );
}
