import { Link } from 'react-router-dom';
import { CONTACT_EMAIL, OPERATOR, POLICIES_UPDATED } from './site';
import { PolicyPage, PolicySection } from './site-layout';

/** The terms of service, in plain language. */
export function TermsPage() {
  return (
    <PolicyPage title="Terms of service" updated={POLICIES_UPDATED}>
      <p className="mt-6 text-[15px] leading-7 text-fg-muted">
        These terms are the agreement between you and {OPERATOR}, who runs Postrail (“we”). By
        creating an account or using the API you accept them. If you use Postrail for a company, you
        accept them for that company.
      </p>

      <PolicySection title="The service">
        <p>
          Postrail sends email from Gmail mailboxes you connect, through an API and a dashboard, and
          can sign your application’s users in. It is offered free of charge for now. We may add,
          change or remove features; if a change takes away something you rely on, we will tell
          account owners ahead of time where we can.
        </p>
      </PolicySection>

      <PolicySection title="Your account">
        <p>
          Give accurate details, keep your API keys and sign-in secret, and tell us at once if you
          think someone else has them. You are responsible for what happens under your account and
          your keys, including what the members you invite do.
        </p>
      </PolicySection>

      <PolicySection title="Acceptable use">
        <p>You may only use Postrail lawfully, and in particular you may not:</p>
        <ul>
          <li>
            send email to people who did not ask for it or would not expect it from you, including
            bought or scraped lists;
          </li>
          <li>send phishing, malware, fraud, harassment or anything illegal;</li>
          <li>
            break anti-spam and privacy law where you or your recipients are (such as CAN-SPAM, GDPR
            and PECR, or CASL), or Google’s terms and Gmail’s program policies;
          </li>
          <li>try to get around Gmail’s sending limits or Postrail’s own limits;</li>
          <li>
            probe, overload or attack the service, or point webhooks at systems you are not allowed
            to send to.
          </li>
        </ul>
        <p>
          Broadcasts are for announcements to people who know you. Every broadcast email carries an
          unsubscribe link, and you must honour unsubscribes and the suppression list.
        </p>
      </PolicySection>

      <PolicySection title="Your data">
        <p>
          What you send through Postrail stays yours. You let us store and process it only to
          provide the service, as the <Link to="/privacy">privacy policy</Link> describes. You are
          responsible for having the right to send to your recipients and to sign your users in, and
          for telling them how you use their data.
        </p>
      </PolicySection>

      <PolicySection title="Google, GitHub and other services">
        <p>
          Your Gmail account stays subject to Google’s terms, and Gmail’s own daily sending limits
          apply whatever Postrail does. Postrail is not made, endorsed or supported by Google or
          GitHub. If Google suspends a mailbox or withdraws access, Postrail cannot send from it.
        </p>
      </PolicySection>

      <PolicySection title="Suspension and ending">
        <p>
          You can stop using Postrail at any time and delete your workspace, which deletes its data.
          We may suspend or close an account that breaks these terms, puts others at risk or harms
          the service, and where possible we will tell you why first. We may also stop offering
          Postrail with 30 days’ notice to account owners.
        </p>
      </PolicySection>

      <PolicySection title="No warranty">
        <p>
          Postrail is provided as it is and as available. We work to keep it running and your email
          delivered, but we do not promise that it will be uninterrupted, error-free, or that any
          email will arrive.
        </p>
      </PolicySection>

      <PolicySection title="Limits of liability">
        <p>
          As far as the law allows, we are not liable for indirect or consequential loss, such as
          lost profits, revenue or data, and our total liability to you for any claim is limited to
          what you paid us for Postrail in the twelve months before it. Nothing here limits
          liability that the law does not allow to be limited.
        </p>
      </PolicySection>

      <PolicySection title="Changes to these terms">
        <p>
          We may update these terms. We change the date at the top, and for a change that matters we
          tell account owners by email at least 14 days before it takes effect. Using Postrail after
          that means you accept the new terms.
        </p>
      </PolicySection>

      <PolicySection title="Contact">
        <p>
          Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
