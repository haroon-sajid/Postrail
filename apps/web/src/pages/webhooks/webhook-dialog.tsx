import { zodResolver } from '@hookform/resolvers/zod';
import {
  createWebhookRequestSchema,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from '@postrail/shared/browser';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { errorMessage } from '@/api/client';
import type { Webhook, WebhookCreated } from '@/api/types';
import { SecretReveal } from '@/components/secret-reveal';
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

type FormValues = z.infer<typeof createWebhookRequestSchema>;

const EVENT_HELP: Record<WebhookEvent, string> = {
  'email.sent': 'A message was accepted by the provider.',
  'email.failed': 'A message gave up after its last attempt.',
  'mailbox.disconnected': 'A mailbox lost its Google access and needs reconnecting.',
};

export interface WebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing when set; creating otherwise. */
  existing?: Webhook;
  onCreate: (body: FormValues) => Promise<WebhookCreated>;
  onUpdate: (id: string, body: FormValues) => Promise<Webhook>;
}

export function WebhookDialog({
  open,
  onOpenChange,
  existing,
  onCreate,
  onUpdate,
}: WebhookDialogProps) {
  const [created, setCreated] = useState<WebhookCreated | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(createWebhookRequestSchema),
    defaultValues: existing
      ? { url: existing.url, events: existing.events }
      : { url: '', events: ['email.sent', 'email.failed'] },
  });

  const close = (next: boolean) => {
    if (!next) {
      setCreated(null);
      form.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Webhook created</DialogTitle>
              <DialogDescription>
                Verify every delivery with this secret. See the docs for the signature scheme.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <SecretReveal
                value={created.secret}
                label="Signing secret"
                warning="Shown once. You can rotate it later, which invalidates this one."
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => close(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            onSubmit={form.handleSubmit(async (values) => {
              try {
                if (existing) {
                  await onUpdate(existing.id, values);
                  toast.success('Webhook updated');
                  close(false);
                } else {
                  setCreated(await onCreate(values));
                  toast.success('Webhook created');
                }
              } catch (error) {
                toast.error(errorMessage(error));
              }
            })}
          >
            <DialogHeader>
              <DialogTitle>{existing ? 'Edit webhook' : 'New webhook'}</DialogTitle>
              <DialogDescription>
                POST requests with a JSON body, signed with HMAC-SHA256, retried up to 8 times.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div>
                <Label htmlFor="wh-url">Endpoint URL</Label>
                <Input
                  id="wh-url"
                  type="url"
                  placeholder="https://example.com/webhooks/postrail"
                  aria-invalid={!!form.formState.errors.url}
                  {...form.register('url')}
                />
                <FieldError message={form.formState.errors.url?.message} />
                <FieldHint>
                  Must answer 2xx within 10 seconds. Use http only for local testing.
                </FieldHint>
              </div>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Events</legend>
                <Controller
                  control={form.control}
                  name="events"
                  render={({ field }) => (
                    <div className="space-y-2">
                      {WEBHOOK_EVENTS.map((event) => {
                        const checked = field.value.includes(event);
                        return (
                          <label
                            key={event}
                            className="flex cursor-pointer items-start gap-2.5 text-sm"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={(v) =>
                                field.onChange(
                                  v
                                    ? [...field.value, event]
                                    : field.value.filter((e) => e !== event),
                                )
                              }
                              aria-label={event}
                            />
                            <span>
                              <code className="text-xs">{event}</code>
                              <span className="block text-xs text-fg-muted">
                                {EVENT_HELP[event]}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
                <FieldError message={form.formState.errors.events?.message} />
              </fieldset>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
                {existing ? 'Save' : 'Create webhook'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
