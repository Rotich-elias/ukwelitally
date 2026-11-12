import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Terms & Conditions'
const description =
  'The rules for using UkweliTally: accounts, acceptable use, evidence submissions, opinion polls, intellectual property, disclaimers and governing law in Kenya.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/terms' },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/terms',
    type: 'website',
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} · ${SITE_NAME}`,
    description,
    images: [SOCIAL_IMAGE],
  },
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro="These terms govern your use of the UkweliTally website, dashboards and public opinion polls. By using the service you agree to them, so please read them carefully."
      updated="12 November 2026"
    >
      <section>
        <h2 className="text-lg font-semibold text-white">1. The service</h2>
        <p className="mt-2">
          UkweliTally is an independent platform for recording, verifying and aggregating election
          results, with photographic evidence and location checks. It also lets anyone create a
          public opinion poll. UkweliTally is not affiliated with IEBC, does not conduct elections
          and does not publish official results. The tally is an independent record and should
          always be read together with official announcements.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">2. Accounts and eligibility</h2>
        <p className="mt-2">
          You must be at least 18 years old and provide accurate, current information when you
          register or are given an account. Accounts are issued to candidates, agents, observers and
          administrators. You are responsible for keeping your password confidential and for
          activity carried out under your account. Tell us immediately if you believe your account
          has been compromised.
        </p>
        <p className="mt-3">
          Access to dashboards may be suspended while a registration is reviewed, or if we believe
          an account is being used in breach of these terms.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">3. Submissions and evidence</h2>
        <p className="mt-2">
          When you submit a result you confirm that the figures and photographs are genuine, were
          captured at the stated polling station, and have not been altered to misrepresent the
          outcome. You must not submit duplicate, fabricated or misleading records, upload content
          you do not have permission to share, or interfere with another user&apos;s submission.
        </p>
        <p className="mt-3">
          You retain ownership of your evidence. You grant UkweliTally a non-exclusive licence to
          store, review, display and use it for verifying and publishing the independent tally.
          Administrators may reject, correct or remove submissions that cannot be verified.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">4. Opinion polls</h2>
        <p className="mt-2">
          Polls are public and must be used for lawful opinion research or discussion. You may not
          use them to publish hate speech, harassment, threats, defamation, illegal content or
          deliberately misleading questions. One browser may vote once per poll. Polls are
          moderated and may be closed, archived or removed at our discretion. Poll results are not
          election results and carry no official weight.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">5. Acceptable use</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>Do not attempt to access accounts, data or systems you are not authorised to use.</li>
          <li>Do not probe, scan, overload or disrupt the service or its security controls.</li>
          <li>Do not scrape, harvest or republish personal data belonging to other users.</li>
          <li>Do not upload malware, or content that infringes intellectual property or privacy rights.</li>
          <li>Do not use the service to impersonate another person or to spread election disinformation.</li>
          <li>Do not circumvent rate limits or duplicate-vote protections.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">6. Intellectual property</h2>
        <p className="mt-2">
          The UkweliTally name, logo, interface, source code and original content are owned by or
          licensed to UkweliTally. You may not copy, modify or redistribute them for commercial use
          without written permission. This does not restrict your rights to your own submissions or
          to public-domain election data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">7. Third-party services</h2>
        <p className="mt-2">
          The service relies on hosting, database, storage, messaging and analytics providers. Links
          to third-party sites, including WhatsApp, are provided for convenience; we do not control
          those sites and are not responsible for their content or privacy practices.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">8. Availability and disclaimers</h2>
        <p className="mt-2">
          We work to keep the service available and accurate, but it is provided “as is” and “as
          available”. Network conditions on election day, maintenance or events outside our control
          may interrupt access. We do not warrant that the tally will be complete, error-free or
          identical to official results. Nothing in these terms excludes liability that cannot
          lawfully be excluded, including for fraud or death or personal injury caused by
          negligence.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">9. Limitation of liability</h2>
        <p className="mt-2">
          To the maximum extent permitted by law, UkweliTally is not liable for indirect or
          consequential loss, loss of data, loss of reputation or any decision taken in reliance on
          the independent tally. Our total liability for a claim relating to the service is limited
          to the amount you have paid us in the twelve months before the claim, or one thousand
          Kenyan shillings where the service was free.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">10. Suspension and termination</h2>
        <p className="mt-2">
          We may suspend or terminate access where these terms are breached, where required by law,
          or where an account presents a security or integrity risk. You may stop using the service
          at any time and may ask us to delete your account, subject to the retention needs in our
          privacy policy.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">11. Governing law</h2>
        <p className="mt-2">
          These terms are governed by the laws of Kenya. The courts of Kenya have jurisdiction over
          any dispute, subject to any mandatory consumer protections that apply to you.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">12. Changes to these terms</h2>
        <p className="mt-2">
          We may update these terms as the service develops. The current version is always available
          on this page, and the “last updated” date shows when it changed. Continuing to use the
          service after an update means you accept the revised terms.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">13. Contact</h2>
        <p className="mt-2">
          Questions about these terms should be sent to{' '}
          <a href="mailto:elgeiy8@gmail.com" className="font-medium text-brand-300 hover:text-brand-200">
            elgeiy8@gmail.com
          </a>{' '}
          or raised by phone on{' '}
          <a href="tel:+254721237811" className="font-medium text-brand-300 hover:text-brand-200">
            +254 721 237811
          </a>
          .
        </p>
      </section>
    </LegalPage>
  )
}
