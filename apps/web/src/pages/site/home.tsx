import {
  ArrowRight,
  FileText,
  Inbox,
  LogIn,
  Send,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GOOGLE_SCOPES } from './site';
import { SiteLayout } from './site-layout';

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Send,
    title: 'One call to send',
    body: 'POST /v1/emails with an API key. Postrail queues it, sends it from your mailbox, retries what fails and never sends twice for the same idempotency key.',
  },
  {
    icon: Inbox,
    title: 'Your own Gmail',
    body: 'Mail comes from an address your users already know. No DNS records to set up, no new sending domain to warm up.',
  },
  {
    icon: Webhook,
    title: 'Signed webhooks',
    body: 'Hear about every sent or failed email, disconnected mailbox and sign-in, signed with HMAC and retried for hours.',
  },
  {
    icon: FileText,
    title: 'Templates',
    body: 'Write the email once with {{placeholders}} and send it by name with the values for each person.',
  },
  {
    icon: LogIn,
    title: 'Sign-in for your users',
    body: 'Google, GitHub, magic links and emailed codes with the same API key, ending in a session token and a short-lived JWT.',
  },
  {
    icon: Users,
    title: 'Contacts and broadcasts',
    body: 'Send an announcement to a list, paced within Gmail’s daily limits, with one-click unsubscribe in every email.',
  },
];

const EXAMPLE = `curl https://<your-dashboard>/v1/emails \\
  -H "Authorization: Bearer pr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"to":"ada@example.com","subject":"Welcome","text":"Thanks for signing up."}'`;

/**
 * The public home page: what Postrail does and why it asks for Google access. Google's
 * OAuth verification requires one that is reachable signed out and links to the privacy
 * policy (ADR 0016). Signed-out visitors to `/` see it; signed-in ones get the dashboard.
 */
export function HomePage() {
  return (
    <SiteLayout>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.14),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Send your app’s email through your own Gmail
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-fg-muted">
            Postrail is an email API for small teams. Connect a Gmail mailbox, get an API key, and
            send sign-up confirmations, invites and password resets from an address your users
            already trust.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="primary" size="lg">
              <Link to="/login">
                Get started
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href="/docs">Read the API docs</a>
            </Button>
          </div>
          <pre className="mx-auto mt-12 max-w-2xl overflow-x-auto rounded-lg border border-border bg-bg p-4 text-left text-[13px] leading-6 shadow-xs">
            <code>{EXAMPLE}</code>
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-lg border border-border bg-bg p-5 shadow-xs">
              <Icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-fg-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-4 sm:px-6" aria-labelledby="google-data">
        <div className="rounded-lg border border-border bg-bg p-6 shadow-xs sm:p-8">
          <h2 id="google-data" className="text-xl font-semibold">
            What Postrail does with your Google account
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-muted">
            Postrail asks Google for these permissions and nothing more. It never reads your inbox,
            never uses your data for advertising, and never sells it or uses it to train AI models.
          </p>
          <dl className="mt-5 divide-y divide-border text-sm">
            {GOOGLE_SCOPES.map(({ scope, when, why }) => (
              <div
                key={scope}
                className="grid gap-1 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
              >
                <dt className="break-all font-mono text-[13px] text-fg">{scope}</dt>
                <dd className="leading-6 text-fg-muted">
                  Asked {when}, {why}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-fg-muted">
            The details are in the{' '}
            <Link to="/privacy" className="text-primary underline-offset-4 hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </section>
    </SiteLayout>
  );
}
