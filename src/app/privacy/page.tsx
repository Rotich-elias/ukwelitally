import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Privacy Policy'
const description =
  'How UkweliTally collects, uses and protects your personal data — registration details, evidence photos, location, audit logs and your privacy rights in Kenya.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/privacy',
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

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains what personal data UkweliTally collects, why we need it, how it is protected and the choices available to you. It applies to the public website and the signed-in dashboards."
      updated="12 November 2026"
    >
      <section>
        <h2 className="text-lg font-semibold text-white">1. Who we are</h2>
        <p className="mt-2">
          UkweliTally is an independent election results tallying platform built for Kenyan
          elections. We are not affiliated with the Independent Electoral and Boundaries
          Commission (IEBC) or any political party. For the purposes of the Kenya Data Protection
          Act, 2019, UkweliTally is the data controller for the information described below.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">2. Data we collect</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white">Account and volunteer registration:</strong> full name,
            email address, phone number, national ID number, county, constituency, ward, preferred
            polling station, account role and a password. Passwords are stored only as a salted
            hash and are never visible to our staff.
          </li>
          <li>
            <strong className="text-white">Result submissions:</strong> polling station and
            electoral area, candidate or party totals, rejected votes, registered voters, turnout
            figures, uploaded evidence photographs (such as Form 34A), GPS coordinates and the time
            of submission.
          </li>
          <li>
            <strong className="text-white">Session and security data:</strong> an httpOnly
            <code className="mx-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-xs">ukwelitally_session</code>
            cookie used to protect dashboard pages, a token and basic profile kept in browser
            localStorage after sign-in, your IP address (used for rate limiting and abuse
            prevention) and audit-log entries recording administrative actions.
          </li>
          <li>
            <strong className="text-white">Opinion polls:</strong> the question and options you
            create, and a random voter key stored in your browser localStorage so the same browser
            cannot vote twice in one poll. The key is not used to identify you across the site.
          </li>
          <li>
            <strong className="text-white">Analytics (optional):</strong> if you accept analytics,
            Google Analytics 4 records page views and basic device and interaction information. No
            analytics script loads before you accept, and rejecting analytics does not limit any
            feature.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">3. Why we use your data</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>To create and secure your account and assign you to a polling station.</li>
          <li>To receive, verify and aggregate election results and their photographic evidence.</li>
          <li>To contact you about training, verification and your observer assignment.</li>
          <li>To detect duplicate submissions, fraud and abuse, and to keep audit trails.</li>
          <li>To operate public opinion polls and publish their aggregate results.</li>
          <li>To improve the website where you have consented to analytics.</li>
          <li>To comply with legal obligations and respond to lawful requests.</li>
        </ul>
        <p className="mt-3">
          Our legal bases are your consent, performance of the service you requested, our
          legitimate interest in protecting election integrity and system security, and compliance
          with applicable law.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">4. What we share</h2>
        <p className="mt-2">
          We do not sell personal data. We share it only with service providers that host the
          application, database and uploaded evidence, deliver SMS or email where you have asked for
          notifications, or provide analytics after you consent. Those providers process data on
          our instructions and under appropriate confidentiality and security terms. We may also
          disclose information where required by law or to investigate serious abuse.
        </p>
        <p className="mt-3">
          Public result pages show aggregate candidate totals and reporting progress. They do not
          publish your name, phone number, email address, national ID or exact GPS position.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">5. How long we keep data</h2>
        <p className="mt-2">
          Account and registration data is kept while your account is active and for as long as
          needed to resolve disputes about an election. Evidence photographs, submission records
          and audit logs may be retained for the election cycle and any legally required period so
          that results remain verifiable. Analytics data follows the retention setting of our
          analytics provider. When data is no longer needed, we delete it or irreversibly anonymise
          it.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">6. How we protect data</h2>
        <p className="mt-2">
          We use HTTPS, hashed passwords, httpOnly session cookies, role-based access controls,
          server-side validation, upload restrictions and rate limiting. Access to evidence and
          personal data is limited to authorised administrators and reviewers. No system is
          completely secure, but we review these controls as the platform develops.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">7. Your rights</h2>
        <p className="mt-2">
          Under the Kenya Data Protection Act, 2019 you may request access to your personal data,
          ask us to correct inaccurate information, request deletion where we no longer have a
          lawful reason to keep it, object to certain processing, or ask for a portable copy. You
          may also complain to the Office of the Data Protection Commissioner (ODPC).
        </p>
        <p className="mt-3">
          To exercise a right, email{' '}
          <a href="mailto:elgeiy8@gmail.com" className="font-medium text-brand-300 hover:text-brand-200">
            elgeiy8@gmail.com
          </a>{' '}
          or{' '}
          <a href="mailto:tetoteknologies@gmail.com" className="font-medium text-brand-300 hover:text-brand-200">
            tetoteknologies@gmail.com
          </a>
          . We may need to verify your identity before acting on a request, and we will respond
          within the period required by law.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">8. Cookies and local storage</h2>
        <p className="mt-2">
          The essential session cookie keeps signed-in users authenticated and is required for the
          dashboards to work. Local storage holds your dashboard token, basic profile, poll voter
          keys and your analytics choice. The only non-essential cookie is the analytics cookie,
          which is set only after you press “Accept analytics”. You can clear these choices at any
          time through your browser settings.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">9. Children</h2>
        <p className="mt-2">
          UkweliTally is intended for adults involved in election monitoring. It is not directed at
          children, and we do not knowingly collect data from anyone under 18.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">10. Changes to this policy</h2>
        <p className="mt-2">
          We may update this policy as the platform or the law changes. The “last updated” date at
          the top of this page will always show the current version. Material changes will be
          communicated on the site or by email where appropriate.
        </p>
      </section>
    </LegalPage>
  )
}
