import { describe, expect, it, vi } from 'vitest';
import { oidcAuth, sharedSecretAuth } from './internal-auth';

describe('sharedSecretAuth', () => {
  const auth = sharedSecretAuth('correct-horse-battery-staple');

  it('accepts only the exact bearer secret', async () => {
    expect(await auth.verify('Bearer correct-horse-battery-staple', '/internal/x')).toBe(true);
    expect(await auth.verify('Bearer correct-horse-battery-stapl', '/internal/x')).toBe(false);
    expect(await auth.verify('Bearer wrong', '/internal/x')).toBe(false);
    expect(await auth.verify('correct-horse-battery-staple', '/internal/x')).toBe(false);
    expect(await auth.verify(undefined, '/internal/x')).toBe(false);
  });
});

describe('oidcAuth', () => {
  const sa = 'tasks@proj.iam.gserviceaccount.com';

  function authWith(claims: { email?: string; email_verified?: boolean } | undefined) {
    const verifyIdToken = vi.fn((_token: string, _audience: string) => Promise.resolve(claims));
    const auth = oidcAuth({
      workerUrl: 'https://api.example.com/internal/tasks/send-email',
      serviceAccountEmail: sa,
      verifyIdToken,
    });
    return { auth, verifyIdToken };
  }

  it('verifies the token against the audience derived from the request path', async () => {
    const { auth, verifyIdToken } = authWith({ email: sa, email_verified: true });
    expect(await auth.verify('Bearer jwt', '/internal/cron/reset-daily-counters')).toBe(true);
    expect(verifyIdToken).toHaveBeenCalledWith(
      'jwt',
      'https://api.example.com/internal/cron/reset-daily-counters',
    );
  });

  it('rejects other accounts, unverified emails, failed verification and missing tokens', async () => {
    expect(
      await authWith({
        email: 'x@other.iam.gserviceaccount.com',
        email_verified: true,
      }).auth.verify('Bearer jwt', '/p'),
    ).toBe(false);
    expect(
      await authWith({ email: sa, email_verified: false }).auth.verify('Bearer jwt', '/p'),
    ).toBe(false);
    expect(await authWith(undefined).auth.verify('Bearer jwt', '/p')).toBe(false);
    expect(await authWith({ email: sa, email_verified: true }).auth.verify(undefined, '/p')).toBe(
      false,
    );

    const throwing = oidcAuth({
      workerUrl: 'https://api.example.com',
      serviceAccountEmail: sa,
      verifyIdToken: () => Promise.reject(new Error('bad signature')),
    });
    expect(await throwing.verify('Bearer jwt', '/p')).toBe(false);
  });
});
