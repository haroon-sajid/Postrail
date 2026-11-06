import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { CONTACT_EMAIL, OPERATOR } from './site';

/**
 * The frame of the public pages (home, privacy, terms). Readable signed out: no API call,
 * no session. "Sign in" goes to /login, which sends a signed-in visitor on to the dashboard.
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-off-white text-fg dark:bg-bg-subtle">
      <header className="border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="Postrail home" className="rounded-md">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <a
              href="/docs"
              className="hidden rounded-md px-2 py-1.5 text-fg-muted hover:text-fg sm:inline"
            >
              API docs
            </a>
            <Link
              to="/privacy"
              className="hidden rounded-md px-2 py-1.5 text-fg-muted hover:text-fg sm:inline"
            >
              Privacy
            </Link>
            <Button asChild variant="primary" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Postrail is run by {OPERATOR}.{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
          <nav className="flex gap-4" aria-label="Legal">
            <Link to="/privacy" className="hover:text-fg">
              Privacy policy
            </Link>
            <Link to="/terms" className="hover:text-fg">
              Terms of service
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A titled block of a policy page. */
export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-fg-muted [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-fg">
        {children}
      </div>
    </section>
  );
}

/** Title, date and body of a policy page. */
export function PolicyPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">Last updated {updated}</p>
        {children}
      </article>
    </SiteLayout>
  );
}
