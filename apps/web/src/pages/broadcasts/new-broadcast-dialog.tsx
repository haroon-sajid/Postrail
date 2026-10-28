import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { Broadcast, ContactList, Template } from '@/api/types';
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
import { FieldHint, Input, Label } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/format';
import type { CreateBroadcastBody } from './hooks';

export interface NewBroadcastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  lists: ContactList[];
  create: (body: CreateBroadcastBody) => Promise<Broadcast>;
  /** Called with the new draft so the page can open it. */
  onCreated: (broadcast: Broadcast) => void;
}

/** Makes a draft: nothing is sent until the draft is reviewed and started. */
export function NewBroadcastDialog({
  open,
  onOpenChange,
  templates,
  lists,
  create,
  onCreated,
}: NewBroadcastDialogProps) {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [listId, setListId] = useState('');
  const [pending, setPending] = useState(false);
  const template = templates.find((t) => t.id === templateId);
  const ready = name.trim() !== '' && templateId !== '' && listId !== '';

  const close = (next: boolean) => {
    if (!next) {
      setName('');
      setTemplateId('');
      setListId('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md">
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ready) return;
            setPending(true);
            try {
              const created = await create({
                name: name.trim(),
                template_id: templateId,
                list_id: listId,
              });
              close(false);
              onCreated(created);
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New broadcast</DialogTitle>
            <DialogDescription>
              This creates a draft. You review who it goes to before anything is sent.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="broadcast-name">Name</Label>
              <Input
                id="broadcast-name"
                autoFocus
                maxLength={120}
                placeholder="October product update"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <FieldHint>Only you see this. Recipients see the template&apos;s subject.</FieldHint>
            </div>
            <div>
              <Label htmlFor="broadcast-template">Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="broadcast-template" aria-label="Template">
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 ? (
                <FieldHint>
                  No templates yet.{' '}
                  <Link to="/templates/new" className="text-primary underline">
                    Create one
                  </Link>{' '}
                  first.
                </FieldHint>
              ) : template && template.variables.length > 0 ? (
                <FieldHint>
                  Each contact needs these properties:{' '}
                  {template.variables
                    .filter((v) => v !== 'email' && v !== 'unsubscribe_url')
                    .join(', ') || 'none'}
                  . A contact without them is not sent to.
                </FieldHint>
              ) : null}
            </div>
            <div>
              <Label htmlFor="broadcast-list">Contact list</Label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger id="broadcast-list" aria-label="Contact list">
                  <SelectValue placeholder="Choose a list" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({formatNumber(l.contact_count)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {lists.length === 0 ? (
                <FieldHint>
                  No lists yet.{' '}
                  <Link to="/contacts?tab=lists" className="text-primary underline">
                    Create one
                  </Link>{' '}
                  and add contacts to it.
                </FieldHint>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!ready} loading={pending}>
              Create draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
