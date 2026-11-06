import { RETENTION_DAYS } from '@postrail/shared/browser';
import { render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomePage } from './home';
import { PrivacyPage } from './privacy';
import { CONTACT_EMAIL, GOOGLE_SCOPES } from './site';
import { TermsPage } from './terms';

const renderAt = (element: ReactElement) => render(<MemoryRouter>{element}</MemoryRouter>);

describe('public pages', () => {
  it('home page explains every Google permission and links to the policies', () => {
    renderAt(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/own Gmail/);
    for (const { scope } of GOOGLE_SCOPES) {
      expect(screen.getByText(scope)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of service' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/login');
  });

  it('privacy policy carries Google’s Limited Use statement and the real retention periods', () => {
    renderAt(<PrivacyPage />);
    expect(screen.getByText(/will adhere to the/, { exact: false }).textContent).toMatch(
      /Google API Services User Data Policy, including the Limited Use requirements/,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain(
      `deleted ${RETENTION_DAYS.messageBodies} days after the email was created`,
    );
    expect(text).toContain(
      `Webhook deliveries: deleted after ${RETENTION_DAYS.webhookDeliveries} days`,
    );
    expect(text).toContain('train generalized AI or machine-learning models');
    for (const { scope } of GOOGLE_SCOPES) expect(text).toContain(scope);
    expect(screen.getAllByRole('link', { name: CONTACT_EMAIL }).length).toBeGreaterThan(0);
  });

  it('terms forbid unsolicited email and point to the privacy policy', () => {
    renderAt(<TermsPage />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/did not ask for it or would not expect it/);
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
