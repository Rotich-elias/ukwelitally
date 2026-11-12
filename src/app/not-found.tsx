import type { Metadata } from 'next'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const description =
  'The page you were looking for does not exist or may have moved. Return to the UkweliTally home page, view live results or register as a volunteer observer.'

export const metadata: Metadata = {
  title: 'Page not found',
  description,
  robots: { index: false, follow: false },
  openGraph: {
    title: `Page not found · ${SITE_NAME}`,
    description,
    type: 'website',
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Page not found · ${SITE_NAME}`,
    description,
    images: [SOCIAL_IMAGE],
  },
}

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <PublicNav />
      <div className="glow-orb left-1/2 top-0 h-72 w-[32rem] -translate-x-1/2 bg-brand-600/20 animate-pulse-slow" />

      <section className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:py-28">
        <p className="section-label">404 · Page not found</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-dark-400">
          The link may be broken, or the page may have moved. Nothing has gone
          wrong with your account — use one of the links below to get back on
          track.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className="btn-primary px-6 py-3">
            Back to home
          </Link>
          <Link href="/presidential-results" className="btn-secondary px-6 py-3">
            View live results
          </Link>
        </div>

        <div className="mt-12 grid w-full gap-4 sm:grid-cols-3">
          {[
            { title: 'Live results', description: 'Follow the presidential tally as verified results arrive.', href: '/presidential-results' },
            { title: 'Volunteer', description: 'Join the observer network monitoring polling stations.', href: '/volunteer-registration' },
            { title: 'Create a poll', description: 'Ask a public opinion question in under a minute.', href: '/polls/create' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="glass-effect card-hover rounded-2xl p-5 text-left transition-colors hover:border-brand-400/30"
            >
              <p className="text-sm font-semibold text-white">{link.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-dark-400">{link.description}</p>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-xs text-dark-500">
          Need help?{' '}
          <a href="mailto:elgeiy8@gmail.com" className="font-medium text-brand-300 hover:text-brand-200">
            Email the team
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
