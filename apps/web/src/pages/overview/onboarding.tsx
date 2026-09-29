import { Check, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_ORIGIN } from '@/api/client';
import { orgPath, useOrg } from '@/app/org-context';
import { CodeBlock } from '@/components/code-block';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface OnboardingStatus {
  hasMailbox: boolean;
  hasApiKey: boolean;
  hasSent: boolean;
}

export const KEY_PLACEHOLDER = 'pr_live_YOUR_API_KEY';

export function curlSnippet(apiKey = KEY_PLACEHOLDER): string {
  return `curl -X POST ${API_ORIGIN}/v1/emails \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"you@example.com","subject":"Hello from Postrail","text":"It works."}'`;
}

export function nodeSnippet(apiKey = KEY_PLACEHOLDER): string {
  return `const res = await fetch('${API_ORIGIN}/v1/emails', {
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
      title: 'Connect a mailbox',
      body: 'Emails go out through your own Gmail account.',
      action: (
        <Button asChild variant={status.hasMailbox ? 'secondary' : 'primary'} size="sm">
          <Link to={orgPath(org.id, '/mailboxes')}>
            {status.hasMailbox ? 'Manage mailboxes' : 'Connect Gmail'}
          </Link>
        </Button>
      ),
    },
    {
      done: status.hasApiKey,
      title: 'Create an API key',
      body: 'Your app authenticates with a bearer key.',
      action: (
        <Button
          asChild
          variant={status.hasApiKey || !status.hasMailbox ? 'secondary' : 'primary'}
          size="sm"
        >
          <Link to={orgPath(org.id, '/api-keys')}>
            {status.hasApiKey ? 'View keys' : 'Create key'}
          </Link>
        </Button>
      ),
    },
    {
      done: status.hasSent,
      title: 'Send your first email',
      body: 'Replace the key placeholder and run one of these.',
      action: null,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card data-testid="onboarding">
      <CardHeader>
        <div>
          <CardTitle>Get set up</CardTitle>
          <CardDescription>
            {doneCount} of {steps.length} done
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  step.done
                    ? 'border-primary bg-primary text-primary-fg'
                    : 'border-border-strong text-fg-muted',
                )}
                aria-label={step.done ? 'Done' : `Step ${i + 1}`}
              >
                {step.done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', step.done && 'text-fg-muted line-through')}>
                  {step.title}
                </p>
                <p className="text-sm text-fg-muted">{step.body}</p>
              </div>
              {step.action}
            </li>
          ))}
        </ol>
        {!status.hasSent ? (
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">curl</TabsTrigger>
              <TabsTrigger value="node">Node</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-2">
              <CodeBlock code={curlSnippet()} title="curl" />
            </TabsContent>
            <TabsContent value="node" className="mt-2">
              <CodeBlock code={nodeSnippet()} title="node" />
            </TabsContent>
          </Tabs>
        ) : null}
      </CardContent>
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
