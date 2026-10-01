import {
  DEFAULT_MAILBOX_DAILY_LIMIT,
  MAX_BATCH_SIZE,
  MAX_WEBHOOK_ATTEMPTS,
} from '@postrail/shared/browser';

export interface Plan {
  id: string;
  name: string;
  /** Shown large, e.g. "$29". */
  price: string;
  /** The small print next to the price. */
  priceNote: string;
  current: boolean;
  /** Headline rows, then the quieter ones under the divider. Same labels on every plan. */
  headline: [label: string, value: string][];
  details: [label: string, value: string][];
}

/**
 * PLACEHOLDER catalogue for the Packages tab.
 *
 * Only `free` describes the product as it is: its limits are the constants the API
 * enforces. The paid tiers, their prices and their limits are stand-ins so the page can be
 * laid out before billing exists. Nothing here is charged or enforced, and the page says
 * so. Replace the paid entries with real numbers when plans are decided.
 */
export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    priceNote: 'Free while Postrail is in preview.',
    current: true,
    headline: [
      ['Support', 'Best effort'],
      ['Mailboxes', 'Unlimited'],
      ['Daily sends per mailbox', DEFAULT_MAILBOX_DAILY_LIMIT.toLocaleString()],
    ],
    details: [
      ['API requests per key', '120 burst, 2/s'],
      ['Messages per batch', MAX_BATCH_SIZE.toLocaleString()],
      ['Webhook attempts', String(MAX_WEBHOOK_ATTEMPTS)],
      ['Members', 'Unlimited'],
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29',
    priceNote: '/month, billed monthly',
    current: false,
    headline: [
      ['Support', 'Email, 2 business days'],
      ['Mailboxes', 'Unlimited'],
      ['Daily sends per mailbox', '2,000'],
    ],
    details: [
      ['API requests per key', '600 burst, 10/s'],
      ['Messages per batch', '500'],
      ['Webhook attempts', String(MAX_WEBHOOK_ATTEMPTS)],
      ['Members', 'Unlimited'],
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '$99',
    priceNote: '/month, billed monthly',
    current: false,
    headline: [
      ['Support', 'Priority, 1 business day'],
      ['Mailboxes', 'Unlimited'],
      ['Daily sends per mailbox', 'Provider limit'],
    ],
    details: [
      ['API requests per key', '1,200 burst, 20/s'],
      ['Messages per batch', '1,000'],
      ['Webhook attempts', String(MAX_WEBHOOK_ATTEMPTS)],
      ['Members', 'Unlimited'],
    ],
  },
];

/** PLACEHOLDER, like the paid plans above. */
export const ENTERPRISE = {
  name: 'Enterprise',
  tagline: 'Annual contract, shaped around your sending volume.',
  featuresTitle: 'Included and tailored to your business',
  features: [
    'Single sign-on',
    'Custom API rate limits',
    'Audit log export',
    'Custom log retention',
    'Security review',
    'Dedicated support channel',
    'Onboarding help',
    'Uptime SLA',
    'Invoiced billing',
  ],
};
