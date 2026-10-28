import { describe, expect, it } from 'vitest';
import { templateFits } from './emails-section';

describe('templateFits', () => {
  it('needs the link in a magic-link template and the code in a code template', () => {
    expect(templateFits({ variables: ['url', 'app_name'] }, 'magic_link')).toBe(true);
    expect(templateFits({ variables: ['app_name'] }, 'magic_link')).toBe(false);
    expect(templateFits({ variables: ['code'] }, 'email_otp')).toBe(true);
    expect(templateFits({ variables: ['code'] }, 'magic_link')).toBe(false);
  });

  it('refuses a template that asks for something Postrail does not fill in', () => {
    expect(templateFits({ variables: ['url', 'first_name'] }, 'magic_link')).toBe(false);
    expect(templateFits({ variables: ['url', 'email', 'expires_in_minutes'] }, 'magic_link')).toBe(
      true,
    );
  });
});
