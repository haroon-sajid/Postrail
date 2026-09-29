import { type AuthContext } from './context';
import { AppError } from './errors';
import { type EmailService } from '../modules/emails/service';
import { type MailboxStore } from '../modules/mailboxes/repo';
import { type SystemMailer } from '../modules/orgs/service';

export interface SystemMailerDeps {
  mailboxes: MailboxStore;
  emails: EmailService;
  /** SYSTEM_MAILBOX_EMAIL. Undefined disables magic links and invites with a clear error. */
  systemEmail: string | undefined;
}

/**
 * Postrail's own transactional mail (magic links, invites) goes through the same queue
 * as tenant mail, from a connected mailbox designated by SYSTEM_MAILBOX_EMAIL.
 */
export function createSystemMailer({
  mailboxes,
  emails,
  systemEmail,
}: SystemMailerDeps): SystemMailer {
  return {
    async send({ to, subject, html, text }) {
      if (!systemEmail) {
        throw new AppError('NO_MAILBOX', 'SYSTEM_MAILBOX_EMAIL is not configured', 503);
      }
      const mailbox = await mailboxes.findByEmailAnyOrg(systemEmail);
      if (!mailbox || mailbox.status !== 'active') {
        throw new AppError('NO_MAILBOX', `system mailbox ${systemEmail} is not connected`, 503);
      }
      const auth: AuthContext = { orgId: mailbox.orgId, actor: 'system' };
      await emails.send(auth, { to, from: mailbox.email, subject, html, text });
    },
  };
}
