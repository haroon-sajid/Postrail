import { ArrowRight, Check, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PUBLIC_API_URL } from '@/lib/config';
import { orgPath, useOrg } from '@/app/org-context';
import { CodeBlock } from '@/components/code-block';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface OnboardingStatus {
  hasMailbox: boolean;
  hasApiKey: boolean;
  hasSent: boolean;
}

export const KEY_PLACEHOLDER = 'pr_live_YOUR_API_KEY';

export function curlSnippet(apiKey = KEY_PLACEHOLDER): string {
  return `curl -X POST ${PUBLIC_API_URL}/v1/emails \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"you@example.com","subject":"Hello from Postrail","text":"It works."}'`;
}

export function nodeSnippet(apiKey = KEY_PLACEHOLDER): string {
  return `const res = await fetch('${PUBLIC_API_URL}/v1/emails', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ${apiKey}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    to: 'you@example.com',
    subject: 'Hello from Postrail',
    text: 'It works.',
  }),
});
const { id, status } = await res.json();`;
}

/** Three steps to a first email. Derived from server data, so it stays until all are done. */
export function OnboardingCard({ status }: { status: OnboardingStatus }) {
  const { org } = useOrg();
  const steps = [
    {
      done: status.hasMailbox,
      current: !status.hasMailbox,
      title: 'Connect a mailbox',
      body: 'Email goes out through your own Gmail account, under your name.',
      action: (
        <Button asChild variant={status.hasMailbox ? 'secondary' : 'primary'} size="sm">
          <Link to={orgPath(org.id, '/mailboxes')}>
            {status.hasMailbox ? 'Manage mailboxes' : 'Connect Gmail'}
            {!status.hasMailbox ? <ArrowRight /> : null}
          </Link>
        </Button>
      ),
    },
    {
      done: status.hasApiKey,
      current: status.hasMailbox && !status.hasApiKey,
      title: 'Create an API key',
      body: 'Your application authenticates every request with a bearer key.',
      action: (
        <Button
          asChild
          variant={status.hasMailbox && !status.hasApiKey ? 'primary' : 'secondary'}
          size="sm"
        >
          <Link to={orgPath(org.id, '/api-keys')}>
            {status.hasApiKey ? 'View keys' : 'Create key'}
            {status.hasMailbox && !status.hasApiKey ? <ArrowRight /> : null}
          </Link>
        </Button>
      ),
    },
    {
      done: status.hasSent,
      current: status.hasMailbox && status.hasApiKey && !status.hasSent,
      title: 'Send your first email',
      body: 'Paste your key into the snippet below and run it.',
      action: null,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card data-testid="onboarding">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold leading-6 text-fg">Get started</h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            Three steps to your first email. Usually under five minutes.
          </p>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-56">
          <Progress
            value={(doneCount / steps.length) * 100}
            aria-label={`${doneCount} of ${steps.length} steps done`}
          />
          <span className="tabular shrink-0 text-xs font-medium text-fg-muted">
            {doneCount}/{steps.length}
          </span>
        </div>
      </div>

      <ol className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cn('flex flex-col gap-3 p-5', step.current && 'bg-primary/[0.035]')}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  step.done
                    ? 'border-primary bg-primary text-primary-fg'
                    : step.current
                      ? 'border-primary text-primary'
                      : 'border-border-strong text-fg-muted',
                )}
                aria-label={step.done ? 'Done' : `Step ${i + 1}`}
              >
                {step.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <p className={cn('text-sm font-semibold', step.done ? 'text-fg-muted' : 'text-fg')}>
                {step.title}
              </p>
            </div>
            <p className="text-sm leading-5 text-fg-muted">{step.body}</p>
            {step.action ? <div className="mt-auto pt-1">{step.action}</div> : null}
          </li>
        ))}
      </ol>

      {!status.hasSent ? (
        <div className="border-t border-border bg-bg-subtle/60 p-5">
          <Tabs defaultValue="curl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-fg">Send a test message</p>
              <TabsList>
                <TabsTrigger value="curl">curl</TabsTrigger>
                <TabsTrigger value="node">Node</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="curl">
              <CodeBlock code={curlSnippet()} title="curl" />
            </TabsContent>
            <TabsContent value="node">
              <CodeBlock code={nodeSnippet()} title="node" />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </Card>
  );
}

export function StepIcon({ done }: { done: boolean }) {
  return done ? (
    <Check className="size-4 text-success" />
  ) : (
    <Circle className="size-4 text-fg-faint" />
  );
}
