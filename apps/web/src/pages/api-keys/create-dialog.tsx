import { zodResolver } from '@hookform/resolvers/zod';
import { createApiKeyRequestSchema } from '@postrail/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { errorMessage } from '@/api/client';
import type { ApiKeyCreated } from '@/api/types';
import { SecretReveal } from '@/components/secret-reveal';
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
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';

type FormValues = z.infer<typeof createApiKeyRequestSchema>;

export interface CreateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Performs the create; injected so the dialog is testable without the network. */
  create: (name: string) => Promise<ApiKeyCreated>;
}

/** Asks for a name, then shows the key exactly once. Closing discards it for good. */
export function CreateKeyDialog({ open, onOpenChange, create }: CreateKeyDialogProps) {
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(createApiKeyRequestSchema),
    defaultValues: { name: '' },
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
      <DialogContent size="sm">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Key created</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-fg">{created.name}</span> is ready to use.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <SecretReveal
                value={created.key}
                label="API key"
                warning="This is the only time the full key is shown. Store it in your secret manager now."
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
            onSubmit={form.handleSubmit(async ({ name }) => {
              try {
                const key = await create(name);
                setCreated(key);
                toast.success(`Created key "${key.name}"`);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            })}
          >
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                Keys act for the whole organisation. Name it after the app or environment that will
                use it.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                autoFocus
                autoComplete="off"
                placeholder="Production backend"
                maxLength={60}
                aria-invalid={!!form.formState.errors.name}
                {...form.register('name')}
              />
              <FieldError message={form.formState.errors.name?.message} />
              <FieldHint>You can revoke a key at any time; revocation is immediate.</FieldHint>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
