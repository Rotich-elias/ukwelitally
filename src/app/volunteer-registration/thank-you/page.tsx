import type { Metadata } from 'next'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import ThankYouTracker from '@/components/ThankYouTracker'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Registration received'
const description =
  'Your volunteer registration has been received. Here is what happens next, including verification, training and your polling station assignment details.'

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/volunteer-registration/thank-you' },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/volunteer-registration/thank-you',
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

const nextSteps = [
  'We review your details and confirm your polling station.',
  'We contact you by phone or email within 48 hours.',
  'You complete the online training on election procedures.',
  'You receive your observer assignment and credentials.',
]

export default function VolunteerThankYouPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <ThankYouTracker eventName="volunteer_registration" params={{ form: 'volunteer' }} />
      <PublicNav active="volunteer" />
      <div className="glow-orb left-1/2 top-0 h-72 w-[32rem] -translate-x-1/2 bg-emerald-500/15 animate-pulse-slow" />

      <section className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:py-24">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 text-emerald-300">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <p className="section-label mt-6">Registration received</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Thank you for joining the network
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-dark-400">
          Your volunteer registration has been submitted. We will review your details and contact
          you within 48 hours to complete verification and training.
        </p>

        <div className="glass-effect mt-10 rounded-3xl p-6 text-left sm:p-8">
          <h2 className="text-base font-semibold text-white">What happens next</h2>
          <ol className="mt-5 space-y-4">
            {nextSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-400/30 bg-brand-500/10 text-[11px] font-semibold text-brand-200">
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed text-dark-300">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/presidential-results" className="btn-primary px-6 py-3">
            View live results
          </Link>
          <Link href="/" className="btn-secondary px-6 py-3">
            Back to home
          </Link>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-dark-500">
          Submitted the wrong details or need to change your polling station?{' '}
          <a href="mailto:elgeiy8@gmail.com" className="font-medium text-brand-300 hover:text-brand-200">
            Email us
          </a>{' '}
          or{' '}
          <a href="tel:+254721237811" className="font-medium text-brand-300 hover:text-brand-200">
            call +254 721 237811
          </a>
          .
        </p>
      </section>
    </main>
  )
}
