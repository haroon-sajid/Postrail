import { RETENTION_DAYS } from '@postrail/shared/browser';
import { Link } from 'react-router-dom';
import { CONTACT_EMAIL, GOOGLE_SCOPES, OPERATOR, POLICIES_UPDATED } from './site';
import { PolicyPage, PolicySection } from './site-layout';

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/**
 * The privacy policy. Every retention period comes from RETENTION_DAYS, which is also what
 * the scheduler deletes by (ADR 0014), so the policy cannot promise something the code
 * does not do. Google's verification reads the "Google user data" section closely.
 */
export function PrivacyPage() {
  return (
    <PolicyPage title="Privacy policy" updated={POLICIES_UPDATED}>
      <p className="mt-6 text-[15px] leading-7 text-fg-muted">
        Postrail is an email API: you connect your own Gmail mailbox and your application sends
        email through it, and can sign its users in. Postrail is run by {OPERATOR} (“we”). This
        policy says what we collect, why, how long we keep it and who else touches it. Questions go
        to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <PolicySection title="Two kinds of data">
        <p>
          <strong>Your account.</strong> When you sign up for Postrail, we decide what happens to
          your account data and are responsible for it.
        </p>
        <p>
          <strong>Data you send through Postrail.</strong> The people you email, your contacts and
          the people who sign in to your application are your data. We process it only on your
          instructions, to provide the service to you. If you are one of those people, the business
          that uses Postrail is responsible for it; contact them first, and we will help them answer
          you.
        </p>
      </PolicySection>

      <PolicySection title="What we collect">
        <ul>
          <li>
            <strong>Account:</strong> your name, email address and profile picture from Google
            sign-in, or your email address if you sign in by link; the workspaces you belong to and
            your role in each; a record of sensitive actions such as creating API keys or removing
            members.
          </li>
          <li>
            <strong>Connected mailboxes:</strong> the Gmail address, Google’s access and refresh
            tokens (encrypted), and how many emails it sent today.
          </li>
          <li>
            <strong>Emails you send:</strong> recipient, sender, subject, status and any error, kept
            as your delivery log. The content (body, reply-to and headers) is kept so it can be
            delivered, previewed and resent.
          </li>
          <li>
            <strong>Templates, contacts, lists and the suppression list</strong> you create, with
            the properties you give each contact.
          </li>
          <li>
            <strong>People who sign in to your application:</strong> email address, name, picture
            and the id of their Google or GitHub account; their sessions and sign-in codes, which we
            store only as hashes.
          </li>
          <li>
            <strong>Webhooks:</strong> the endpoint address, its signing secret (encrypted) and a
            record of each delivery with its payload.
          </li>
          <li>
            <strong>API keys:</strong> stored only as a hash. We cannot show a key again after you
            create it.
          </li>
          <li>
            <strong>Technical logs:</strong> the path, status and timing of each API request, with
            your workspace id. Logs never contain request bodies, email content, tokens or keys.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="How we use it">
        <p>
          Only to run Postrail for you: to send the emails you ask us to send, show you their
          status, deliver your webhooks, sign your users in, keep the service secure and within its
          limits, and answer you when you contact us. We do not sell personal data, we do not show
          advertising, and we do not use your data or your users’ data to train AI models.
        </p>
      </PolicySection>

      <PolicySection title="Google user data">
        <p>Postrail asks Google for these permissions and nothing more:</p>
        <ul>
          {GOOGLE_SCOPES.map(({ scope, when, why }) => (
            <li key={scope}>
              <strong className="font-mono text-[13px]">{scope}</strong>, asked {when}, {why}
            </li>
          ))}
        </ul>
        <p>
          Postrail’s use and transfer to any other app of information received from Google APIs will
          adhere to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular:
        </p>
        <ul>
          <li>
            We use Google data only to provide and improve the features you can see: sending the
            email you asked for and signing people in.
          </li>
          <li>
            We do not transfer it to anyone except as needed to provide those features, to comply
            with the law, or as part of a merger or sale of Postrail with notice to you.
          </li>
          <li>
            We do not use it for advertising, we do not sell it, and we do not use it to develop,
            improve or train generalized AI or machine-learning models.
          </li>
          <li>
            No person reads it unless you ask us to, it is needed for security or to comply with the
            law, or it is aggregated and anonymous for running the service.
          </li>
        </ul>
        <p>
          Removing a mailbox in the dashboard deletes its tokens at once. You can also withdraw
          Postrail’s access at any time from your{' '}
          <a href="https://myaccount.google.com/permissions">Google account permissions</a>.
        </p>
      </PolicySection>

      <PolicySection title="How long we keep it">
        <ul>
          <li>
            Email content: deleted {days(RETENTION_DAYS.messageBodies)} after the email was created.
            Sign-in emails, which contain a link or code, are never shown to anyone and their
            content is deleted as soon as delivery finishes.
          </li>
          <li>Webhook deliveries: deleted after {days(RETENTION_DAYS.webhookDeliveries)}.</li>
          <li>
            Sessions of people who sign in to your application: deleted{' '}
            {days(RETENTION_DAYS.authSessions)} after they expire. Sign-in links and codes: deleted{' '}
            {days(RETENTION_DAYS.authChallenges)} after they expire.
          </li>
          <li>
            Broadcasts: the copy of each recipient’s contact properties is deleted once that
            recipient’s email is handed to delivery.
          </li>
          <li>
            Everything else (your delivery log, contacts, templates, users): until you delete it, or
            delete the workspace, which deletes all of the workspace’s data.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="Who else processes it">
        <p>We use these providers to run Postrail. Each sees only what its job needs.</p>
        <ul>
          <li>Google: sends your email through the Gmail API, and Google sign-in.</li>
          <li>GitHub: sign-in, for applications that turn it on.</li>
          <li>Neon: the database.</li>
          <li>Render: runs the API.</li>
          <li>Cloudflare: serves the dashboard and passes its requests to the API.</li>
        </ul>
        <p>These providers may process data in the United States and other countries.</p>
      </PolicySection>

      <PolicySection title="Security">
        <p>
          Traffic is encrypted with TLS. Mailbox tokens, webhook secrets and signing keys are
          encrypted at rest with AES-256-GCM. API keys, session tokens and sign-in codes are stored
          only as hashes. Each workspace’s data is kept apart by the database itself (row-level
          security), not only by our code. No system is perfectly secure; if a breach affects your
          data we will tell you without undue delay.
        </p>
      </PolicySection>

      <PolicySection title="Cookies">
        <p>
          The dashboard sets only the cookies sign-in needs: a session cookie and, while you sign in
          with Google, a short-lived state cookie. Your browser also remembers your theme and your
          last workspace. There are no analytics or advertising cookies.
        </p>
      </PolicySection>

      <PolicySection title="Your rights">
        <p>
          You can see, correct and delete your data in the dashboard, and you can ask us for a copy
          of it, or to delete your account, at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Depending on where you live you
          may have further rights, such as to object to processing or to complain to your data
          protection authority. We answer within 30 days.
        </p>
      </PolicySection>

      <PolicySection title="Children">
        <p>
          Postrail is not meant for anyone under 16, and we do not knowingly collect their data.
        </p>
      </PolicySection>

      <PolicySection title="Changes">
        <p>
          If we change this policy we update the date at the top, and for a change that matters we
          tell account owners by email before it takes effect. The{' '}
          <Link to="/terms">terms of service</Link> cover the rest of how Postrail may be used.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
