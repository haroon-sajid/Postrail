import { describe, expect, it } from 'vitest';
import {
  isRedirectUrl,
  normalizeRedirectUrl,
  otpVerifyRequestSchema,
  updateAuthSettingsRequestSchema,
} from './auth';

describe('redirect URLs', () => {
  it.each([
    'https://app.example.com/auth/callback',
    'https://app.example.com',
    'http://localhost:3000/callback',
    'http://127.0.0.1:3000/callback',
  ])('accepts %s', (url) => {
    expect(isRedirectUrl(url)).toBe(true);
  });

  it.each([
    ['plain http off localhost', 'http://app.example.com/callback'],
    ['a query string', 'https://app.example.com/callback?next=/'],
    ['a fragment', 'https://app.example.com/callback#x'],
    ['credentials', 'https://user:pass@app.example.com/callback'],
    ['another scheme', 'javascript:alert(1)'],
    ['a relative path', '/callback'],
  ])('rejects %s', (_why, url) => {
    expect(isRedirectUrl(url)).toBe(false);
  });

  it('normalises to origin plus path so equal URLs compare equal', () => {
    expect(normalizeRedirectUrl('https://App.Example.com')).toBe('https://app.example.com/');
    expect(normalizeRedirectUrl('https://app.example.com:443/cb')).toBe(
      'https://app.example.com/cb',
    );
  });
});

describe('updateAuthSettingsRequestSchema', () => {
  it('needs at least one field', () => {
    expect(updateAuthSettingsRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAuthSettingsRequestSchema.safeParse({ methods: { google: false } }).success).toBe(
      true,
    );
  });

  it('takes null to clear the app name and the Google client', () => {
    const parsed = updateAuthSettingsRequestSchema.parse({ app_name: null, google: null });
    expect(parsed).toEqual({ app_name: null, google: null });
  });

  it('wants both halves of a Google client', () => {
    const result = updateAuthSettingsRequestSchema.safeParse({ google: { client_id: 'id' } });
    expect(result.success).toBe(false);
  });
});

describe('otpVerifyRequestSchema', () => {
  it('takes exactly six digits', () => {
    const ok = { email: 'a@b.co', code: '012345' };
    expect(otpVerifyRequestSchema.safeParse(ok).success).toBe(true);
    for (const code of ['12345', '1234567', '12345a', ' 123456']) {
      expect(otpVerifyRequestSchema.safeParse({ ...ok, code }).success).toBe(false);
    }
  });
});
