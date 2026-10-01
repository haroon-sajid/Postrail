import { DEFAULT_MAILBOX_DAILY_LIMIT, MAX_WEBHOOK_ATTEMPTS } from '@postrail/shared/browser';
import { AlertTriangle, Gauge, Rocket, Webhook, type LucideIcon } from 'lucide-react';

export interface AssistantTopic {
  id: string;
  icon: LucideIcon;
  /** The suggestion as the user would ask it. */
  prompt: string;
  answer: string;
  /** Where the answer can be acted on. */
  action: { label: string; to: string };
  /** Lowercase fragments that route a typed question to this topic. */
  keywords: string[];
}

/**
 * The assistant answers from this list; there is no model behind it yet. Every answer
 * describes what the product does today and points at the page that does it, so it stays
 * useful (and true) until real chat replaces it.
 *
 * Order matters twice: it is the order of the suggestions, and the first topic whose
 * keywords appear in a typed question wins. Webhooks sits before failures so that
 * "notify me when a send fails" is about being notified.
 */
export const ASSISTANT_TOPICS: AssistantTopic[] = [
  {
    id: 'first-email',
    icon: Rocket,
    prompt: 'Walk me through sending my first email',
    answer:
      'There are three steps: connect a Gmail mailbox, create an API key, then POST to /v1/emails with that key. Home tracks each step and has a curl snippet ready to run.',
    action: { label: 'Open getting started', to: '/' },
    keywords: ['first', 'get started', 'set up', 'setup', 'begin', 'how do i send', 'quickstart'],
  },
  {
    id: 'webhooks',
    icon: Webhook,
    prompt: 'Notify my app when a send fails',
    answer: `Add a webhook and subscribe it to email.failed. Each delivery is signed with HMAC-SHA256 and retried up to ${MAX_WEBHOOK_ATTEMPTS} times.`,
    action: { label: 'Open webhooks', to: '/webhooks' },
    keywords: ['webhook', 'notify', 'notification', 'callback'],
  },
  {
    id: 'failures',
    icon: AlertTriangle,
    prompt: 'Why did my recent emails fail?',
    answer:
      "Every failed message keeps the provider's error. Open Logs filtered to failed and click a row to read it. Recipients the provider rejects as invalid are added to Suppressions automatically.",
    action: { label: 'Open failed emails', to: '/logs?status=failed' },
    keywords: ['fail', 'error', 'bounce', 'not deliver', 'undeliver', 'rejected'],
  },
  {
    id: 'limits',
    icon: Gauge,
    prompt: 'How much can I still send today?',
    answer: `Each mailbox has its own daily limit (${DEFAULT_MAILBOX_DAILY_LIMIT} by default, adjustable per mailbox). Billing shows today's sends against the total, and Mailboxes shows each one.`,
    action: { label: 'Open usage', to: '/billing' },
    keywords: ['limit', 'quota', 'how much', 'how many', 'usage', 'capacity'],
  },
];

/** The topic a typed question is about, or undefined when none of them fits. */
export function matchTopic(question: string): AssistantTopic | undefined {
  const text = question.toLowerCase();
  return ASSISTANT_TOPICS.find((topic) => topic.keywords.some((k) => text.includes(k)));
}
