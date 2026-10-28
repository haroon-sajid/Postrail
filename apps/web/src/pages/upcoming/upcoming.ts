export interface UpcomingFeature {
  /** Route path; must match a nav item marked `soon` so the header gets its icon. */
  path: string;
  title: string;
  /** The one-liner under the page title. */
  description: string;
  headline: string;
  body: string;
  /** What it is planned to do, as short statements. */
  points: string[];
  /** What already covers part of this today. `external` opens in a new tab. */
  today: { label: string; to: string; external?: boolean };
}

/**
 * Features that are planned and not built. Each gets a page that says what it will do and
 * points at what already covers some of the need. Nothing here exists in the API yet; when
 * one ships, delete its entry and drop the `soon` badge from the nav item.
 */
export const UPCOMING: UpcomingFeature[] = [
  {
    path: '/metrics',
    title: 'Metrics',
    description: 'How sending performs over time.',
    headline: 'See how your sending performs',
    body: 'Volume, failure rate and time to send over any period, broken down by mailbox and by template, with an export for your own reporting.',
    points: ['Compare periods side by side', 'Break down by mailbox or template', 'Export to CSV'],
    today: { label: 'Open overview', to: '/' },
  },
  {
    path: '/alerts',
    title: 'Alerts',
    description: 'Hear about problems before your users do.',
    headline: 'Be told when something needs attention',
    body: 'Get an email or a chat message when a mailbox disconnects, failures spike or a mailbox is close to its daily limit, without building a webhook receiver first.',
    points: [
      'Mailbox disconnected or paused',
      'Failure rate above a threshold you set',
      'Daily limit nearly used up',
    ],
    today: { label: 'Use webhooks for now', to: '/webhooks' },
  },
  {
    path: '/playground',
    title: 'Playground',
    description: 'Try the API from the browser.',
    headline: 'Send a request without writing code',
    body: 'Build a send request in the browser, pick a key and a template, run it, and see both the API response and the message as it lands in Logs.',
    points: [
      'Fill in a request with your own templates',
      'Copy it out as curl or Node',
      'Follow the message from queued to sent',
    ],
    today: { label: 'Open API reference', to: '/docs', external: true },
  },
  {
    path: '/integrations',
    title: 'Integrations',
    description: 'Connect Postrail to the tools you already use.',
    headline: 'Plug Postrail into your stack',
    body: 'Ready-made connections for automation tools and chat, and more mailbox providers beside Gmail, so you can send and react to sends without custom code.',
    points: ['Outlook and Microsoft 365 mailboxes', 'Zapier, Make and n8n', 'Slack notifications'],
    today: { label: 'Open webhooks', to: '/webhooks' },
  },
];

/** A Settings tab rather than a page of its own, so it is not in the list above. */
export const AUDIT_LOG: UpcomingFeature = {
  path: '/settings/audit-log',
  title: 'Audit log',
  description: 'A record of who changed what in this workspace.',
  headline: 'See who changed what, and when',
  body: 'Postrail already records sensitive actions such as creating a key, connecting a mailbox or changing a member. This tab will let you browse, filter and export that record.',
  points: [
    'API keys created and revoked',
    'Mailboxes connected and removed',
    'Member, invite and role changes',
  ],
  today: { label: 'Open members', to: '/settings/members' },
};
