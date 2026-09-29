import { zodResolver } from '@hookform/resolvers/zod';
import { createSuppressionRequestSchema, SUPPRESSION_REASONS } from '@postrail/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { errorMessage } from '@/api/client';
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
import { FieldError, FieldHint, Input, Label, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseEmailList, type CreateSuppressionBody, type ImportSuppressionsBody } from './hooks';

export const REASON_LABEL: Record<(typeof SUPPRESSION_REASONS)[number], string> = {
  manual: 'Manual',
  hard_bounce: 'Hard bounce',
  complaint: 'Complaint',
  unsubscribe: 'Unsubscribe',
};

type Reason = (typeof SUPPRESSION_REASONS)[number];

function ReasonSelect({
  value,
  onChange,
  id,
}: {
  value: Reason;
  onChange: (r: Reason) => void;
  id: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Reason)}>
      <SelectTrigger id={id} aria-label="Reason">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPRESSION_REASONS.map((r) => (
          <SelectItem key={r} value={r}>
            {REASON_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type AddInput = z.input<typeof createSuppressionRequestSchema>;
type AddValues = z.output<typeof createSuppressionRequestSchema>;

export function AddSuppressionDialog({
  open,
  onOpenChange,
  add,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  add: (body: CreateSuppressionBody) => Promise<unknown>;
}) {
  const form = useForm<AddInput, unknown, AddValues>({
    resolver: zodResolver(createSuppressionRequestSchema),
    defaultValues: { email: '', reason: 'manual' },
  });
  const close = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await add(values);
              toast.success(`Suppressed ${values.email}`);
              close(false);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          })}
        >
          <DialogHeader>
            <DialogTitle>Suppress an address</DialogTitle>
            <DialogDescription>
              Sends to this recipient are rejected with SUPPRESSED until you remove it.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="sup-email">Email</Label>
              <Input
                id="sup-email"
                type="email"
                autoFocus
                placeholder="person@example.com"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
              <FieldError message={form.formState.errors.email?.message} />
            </div>
            <div>
              <Label htmlFor="sup-reason">Reason</Label>
              <Controller
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <ReasonSelect
                    id="sup-reason"
                    value={field.value ?? 'manual'}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              Suppress
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const MAX_IMPORT = 1000;

export function ImportSuppressionsDialog({
  open,
  onOpenChange,
  importEmails,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importEmails: (body: ImportSuppressionsBody) => Promise<{ added: number; skipped: number }>;
}) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState<Reason>('manual');
  const [pending, setPending] = useState(false);
  const emails = parseEmailList(text);
  const invalid = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const tooMany = emails.length > MAX_IMPORT;
  const ready = emails.length > 0 && invalid.length === 0 && !tooMany;

  const close = (next: boolean) => {
    if (!next) {
      setText('');
      setReason('manual');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Import suppressions</DialogTitle>
          <DialogDescription>
            Paste addresses separated by newlines, commas or spaces. Already-suppressed ones are
            skipped.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="sup-import">Addresses</Label>
            <Textarea
              id="sup-import"
              rows={8}
              autoFocus
              placeholder={'a@example.com\nb@example.com'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={invalid.length > 0 || tooMany}
              className="font-mono text-xs"
            />
            {invalid.length > 0 ? (
              <FieldError
                message={`${invalid.length} ${invalid.length === 1 ? 'entry is' : 'entries are'} not a valid email, e.g. "${invalid[0] ?? ''}"`}
              />
            ) : tooMany ? (
              <FieldError message={`At most ${MAX_IMPORT} addresses per import.`} />
            ) : (
              <FieldHint>
                {emails.length === 0
                  ? 'Nothing to import yet.'
                  : `${emails.length} unique ${emails.length === 1 ? 'address' : 'addresses'} ready.`}
              </FieldHint>
            )}
          </div>
          <div>
            <Label htmlFor="sup-import-reason">Reason</Label>
            <ReasonSelect id="sup-import-reason" value={reason} onChange={setReason} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={pending}
            onClick={async () => {
              setPending(true);
              try {
                const result = await importEmails({ emails, reason });
                toast.success(`Added ${result.added}, skipped ${result.skipped} already listed`);
                close(false);
              } catch (error) {
                toast.error(errorMessage(error));
              } finally {
                setPending(false);
              }
            }}
          >
            Import {emails.length > 0 ? emails.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
