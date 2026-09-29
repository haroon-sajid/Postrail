import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { authClient } from '@/api/auth';
import { useMe } from '@/api/me';
import { Logo } from '@/components/logo';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FieldError, Input, Label } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

const schema = z.object({ email: z.email('Enter a valid email address') });
type FormValues = z.infer<typeof schema>;

const LINK_ERRORS: Record<string, string> = {
  EXPIRED_TOKEN: 'That sign-in link has expired. Request a new one below.',
  INVALID_TOKEN: 'That sign-in link is no longer valid. Request a new one below.',
};

export function LoginPage() {
  const me = useMe();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const linkError = params.get('error');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  if (me.data) return <Navigate to={next} replace />;

  const callbackURL = `${window.location.origin}${next}`;
  const errorCallbackURL = `${window.location.origin}/login`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-off-white px-4 dark:bg-bg-subtle">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <div className="mb-6 flex justify-center">
            <Logo variant="light" className="dark:hidden" />
            <Logo variant="dark" className="hidden dark:block" />
          </div>

          {sentTo ? (
            <div className="text-center" role="status">
              <Mail className="mx-auto mb-3 size-6 text-primary" aria-hidden />
              <h1 className="text-lg font-semibold">Check your email</h1>
              <p className="mt-1 text-sm text-fg-muted">
                We sent a sign-in link to <span className="font-medium text-fg">{sentTo}</span>. It
                expires in 10 minutes.
              </p>
              <Button variant="link" className="mt-4" onClick={() => setSentTo(null)}>
                Use a different address
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-center text-lg font-semibold">Sign in to Postrail</h1>
              {linkError ? (
                <Alert tone="warning" className="mt-4">
                  {LINK_ERRORS[linkError] ?? 'Sign-in failed. Please try again.'}
                </Alert>
              ) : null}
              {submitError ? (
                <Alert tone="danger" className="mt-4">
                  {submitError}
                </Alert>
              ) : null}

              <Button
                variant="secondary"
                size="lg"
                className="mt-6 w-full"
                onClick={() =>
                  void authClient.signIn.social({
                    provider: 'google',
                    callbackURL,
                    errorCallbackURL,
                  })
                }
              >
                <GoogleMark />
                Continue with Google
              </Button>

              <div className="my-5 flex items-center gap-3 text-xs text-fg-muted">
                <Separator className="flex-1" />
                or
                <Separator className="flex-1" />
              </div>

              <form
                noValidate
                onSubmit={form.handleSubmit(async ({ email }) => {
                  setSubmitError(null);
                  const result = await authClient.signIn.magicLink({
                    email,
                    callbackURL,
                    errorCallbackURL,
                  });
                  if (result.error) {
                    setSubmitError(
                      result.error.message ?? 'Could not send the link. Try again in a minute.',
                    );
                    return;
                  }
                  setSentTo(email);
                })}
              >
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  aria-invalid={!!form.formState.errors.email}
                  {...form.register('email')}
                />
                <FieldError message={form.formState.errors.email?.message} />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="mt-4 w-full"
                  loading={form.formState.isSubmitting}
                >
                  Email me a sign-in link
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
      />
    </svg>
  );
}
