import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
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
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';
import type { CreateAuthUserBody } from './hooks';

// The form keeps the name as a string; an empty one is simply left out of the request.
const formSchema = z.object({
  email: z.email('Enter an email address'),
  name: z.string().trim().max(120),
});
type FormValues = z.infer<typeof formSchema>;

export function AddUserDialog({
  open,
  onOpenChange,
  add,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  add: (body: CreateAuthUserBody) => Promise<unknown>;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', name: '' },
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
              await add({ email: values.email, ...(values.name ? { name: values.name } : {}) });
              toast.success(`Added ${values.email}`);
              close(false);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          })}
        >
          <DialogHeader>
            <DialogTitle>Add a user</DialogTitle>
            <DialogDescription>
              They can sign in to your app straight away, even while sign-ups are closed. No email
              is sent.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                autoFocus
                placeholder="person@example.com"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
              <FieldError message={form.formState.errors.email?.message} />
            </div>
            <div>
              <Label htmlFor="user-name">Name</Label>
              <Input id="user-name" maxLength={120} {...form.register('name')} />
              <FieldHint>Optional. Google or GitHub fills it in when they sign in.</FieldHint>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              Add user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
