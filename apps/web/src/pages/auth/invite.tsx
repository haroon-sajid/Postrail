import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage, unwrap } from '@/api/client';
import { meKey, useMe } from '@/api/me';
import { Logo } from '@/components/logo';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Landing page for an invite link. The user is already signed in (RequireAuth). */
export function InvitePage() {
  const { token = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const client = useQueryClient();
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.GET('/app/invites/{token}', { params: { path: { token } } }).then(unwrap),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api.POST('/app/invites/accept', { body: { token } }).then(unwrap),
    onSuccess: async ({ org }) => {
      await client.invalidateQueries({ queryKey: meKey });
      toast.success(`You joined ${org.name}`);
      void navigate(`/o/${org.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const mismatch =
    preview.data &&
    me.data &&
    preview.data.email.toLowerCase() !== me.data.user.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-off-white px-4 dark:bg-bg-subtle">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <div className="mb-6 flex justify-center">
            <Logo variant="light" className="dark:hidden" />
            <Logo variant="dark" className="hidden dark:block" />
          </div>
          {preview.isPending ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : preview.isError ? (
            <Alert tone="warning" title="This invite can't be used">
              {errorMessage(preview.error)}
            </Alert>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Join {preview.data.org_name}</h1>
              <p className="mt-1 text-sm text-fg-muted">
                You were invited as <span className="font-medium text-fg">{preview.data.role}</span>
                . The invite was sent to {preview.data.email}.
              </p>
              {mismatch ? (
                <Alert tone="warning" className="mt-4">
                  You are signed in as {me.data?.user.email}. Sign out and use {preview.data.email}{' '}
                  to accept.
                </Alert>
              ) : null}
              <Button
                variant="primary"
                size="lg"
                className="mt-5 w-full"
                disabled={!!mismatch}
                loading={accept.isPending}
                onClick={() => accept.mutate()}
              >
                Accept invitation
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
