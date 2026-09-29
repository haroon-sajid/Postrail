import { CheckCircle2, Circle, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { Email } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { ErrorState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { AbsoluteTime } from '@/components/time';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEmail, useEmailBody, useResend } from './hooks';

export function DetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { org } = useOrg();
  const email = useEmail(org.id, id);
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {email.isPending ? (
          <div className="space-y-3 p-5" aria-busy>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : email.isError ? (
          <ErrorState error={email.error} onRetry={() => void email.refetch()} />
        ) : (
          <DetailBody email={email.data} />
        )}
      </SheetContent>
    </Dialog>
  );
}

function DetailBody({ email }: { email: Email }) {
  const { org } = useOrg();
  const body = useEmailBody(org.id, email.id);
  const resend = useResend(org.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-5 pr-14">
        <div className="flex items-center gap-2.5">
          <StatusPill status={email.status} />
          <DialogTitle className="truncate text-lg font-semibold">{email.subject}</DialogTitle>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
          <code className="truncate">{email.id}</code>
          <CopyButton value={email.id} label="Message id" />
        </p>
      </div>

      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
          <Row label="To">
            <span className="flex items-center gap-1">
              {email.to} <CopyButton value={email.to} label="Recipient" />
            </span>
          </Row>
          <Row label="From">{email.from}</Row>
          <Row label="Created">
            <AbsoluteTime value={email.created_at} />
          </Row>
          <Row label="Sent">
            <AbsoluteTime value={email.sent_at} />
          </Row>
          <Row label="Attempts">
            <span className="tabular">{email.attempts}</span>
          </Row>
          <Row label="Provider id">
            {email.provider_message_id ? (
              <span className="flex items-center gap-1">
                <code className="text-xs">{email.provider_message_id}</code>
                <CopyButton value={email.provider_message_id} label="Provider id" />
              </span>
            ) : (
              '—'
            )}
          </Row>
          <Row label="Idempotency">
            {email.idempotency_key ? <code className="text-xs">{email.idempotency_key}</code> : '—'}
          </Row>
          <Row label="Mailbox">
            {email.mailbox_id ? <code className="text-xs">{email.mailbox_id}</code> : '—'}
          </Row>
        </dl>

        {email.error ? (
          <div
            className="rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger-fg"
            role="alert"
          >
            {email.error}
          </div>
        ) : null}

        <section aria-label="Timeline">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Timeline
          </h3>
          <Timeline email={email} />
        </section>

        <section aria-label="Content">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Content
          </h3>
          {body.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : body.isError ? (
            <ErrorState error={body.error} onRetry={() => void body.refetch()} />
          ) : body.data.html || body.data.text ? (
            <Tabs defaultValue={body.data.html ? 'html' : 'text'}>
              <TabsList>
                {body.data.html ? <TabsTrigger value="html">HTML</TabsTrigger> : null}
                {body.data.text ? <TabsTrigger value="text">Text</TabsTrigger> : null}
              </TabsList>
              {body.data.html ? (
                <TabsContent value="html" className="mt-2">
                  {/* sandbox with no flags: no scripts, no same-origin, no forms, no navigation. */}
                  <iframe
                    title="Rendered HTML preview"
                    sandbox=""
                    srcDoc={body.data.html}
                    className="h-72 w-full rounded border border-border bg-white"
                  />
                </TabsContent>
              ) : null}
              {body.data.text ? (
                <TabsContent value="text" className="mt-2">
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg-subtle p-3 text-xs">
                    {body.data.text}
                  </pre>
                </TabsContent>
              ) : null}
            </Tabs>
          ) : (
            <p className="text-sm text-fg-muted">
              The content of this message is no longer stored.
            </p>
          )}
        </section>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-subtle/60 px-6 py-4">
        <Button
          variant="secondary"
          onClick={() => setConfirming(true)}
          disabled={!body.data?.html && !body.data?.text}
        >
          <RotateCcw /> Resend
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Resend this email?"
        description={`A new message with the same content will be queued to ${email.to}.`}
        confirmLabel="Resend"
        pending={resend.isPending}
        onConfirm={async () => {
          try {
            const result = await resend.mutateAsync(email.id);
            toast.success(`Queued a new message (${result.id.slice(0, 8)}…)`);
            setConfirming(false);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 truncate text-fg">{children}</dd>
    </>
  );
}

function Timeline({ email }: { email: Email }) {
  const steps: Array<{
    label: string;
    at: string | null;
    state: 'done' | 'active' | 'failed' | 'todo';
  }> = [
    { label: 'Queued', at: email.created_at, state: 'done' },
    {
      label:
        email.attempts > 0
          ? `Sending (${email.attempts} attempt${email.attempts === 1 ? '' : 's'})`
          : 'Sending',
      at: null,
      state: email.status === 'sending' ? 'active' : email.attempts > 0 ? 'done' : 'todo',
    },
    email.status === 'failed'
      ? { label: 'Failed', at: null, state: 'failed' }
      : { label: 'Sent', at: email.sent_at, state: email.status === 'sent' ? 'done' : 'todo' },
  ];
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-sm">
          {s.state === 'done' ? (
            <CheckCircle2 className="size-4 text-success" aria-hidden />
          ) : s.state === 'active' ? (
            <Loader2 className="size-4 animate-spin text-fg-muted" aria-hidden />
          ) : s.state === 'failed' ? (
            <XCircle className="size-4 text-danger" aria-hidden />
          ) : (
            <Circle className="size-4 text-fg-faint" aria-hidden />
          )}
          <span className={s.state === 'todo' ? 'text-fg-muted' : 'text-fg'}>{s.label}</span>
          {s.at ? (
            <span className="ml-auto text-xs text-fg-muted">
              <AbsoluteTime value={s.at} />
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
