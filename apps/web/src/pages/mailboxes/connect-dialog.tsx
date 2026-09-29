import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useOrg } from '@/app/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConnectUrl } from './hooks';

/** Opens Google's consent screen in a new tab; the list refreshes when the user comes back. */
export function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { org } = useOrg();
  const connect = useConnectUrl(org.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Connect a mailbox</DialogTitle>
          <DialogDescription>
            Postrail sends through your own account. You will be asked to allow sending only; we
            never read your mail.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-start"
            loading={connect.isPending}
            onClick={async () => {
              try {
                const url = await connect.mutateAsync();
                window.open(url, '_blank', 'noopener');
                onOpenChange(false);
                toast.message('Finish in the Google tab', {
                  description: 'The mailbox appears here once you return.',
                });
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            <span className="mr-1 size-4 rounded-sm bg-[#EA4335]" aria-hidden />
            Google (Gmail)
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-start"
            disabled
            aria-disabled
          >
            <span className="mr-1 size-4 rounded-sm bg-[#0078D4]" aria-hidden />
            Microsoft (Outlook)
            <Badge tone="outline" className="ml-auto">
              Coming soon
            </Badge>
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
