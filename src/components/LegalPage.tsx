import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import PoweredBy from '@/components/PoweredBy'

interface LegalPageProps {
  title: string
  intro: string
  updated: string
  children: React.ReactNode
}

/**
 * Shared shell for the public legal pages. Keeping it in one place means the
 * privacy policy and terms always carry the same navigation, contact details
 * and legal cross-links.
 */
export default function LegalPage({ title, intro, updated, children }: LegalPageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <PublicNav />
      <div className="glow-orb left-1/2 top-0 h-72 w-[32rem] -translate-x-1/2 bg-brand-600/15 animate-pulse-slow" />

      <div className="relative mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="section-label">Legal</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-dark-400">{intro}</p>
        <p className="mt-3 text-xs text-dark-500">Last updated: {updated}</p>

        <div className="legal-prose mt-10 space-y-8 text-sm leading-relaxed text-dark-300 sm:text-base">
          {children}
        </div>

        <div className="mt-12 rounded-3xl border border-white/[0.07] bg-white/[0.025] p-6">
          <p className="text-sm font-semibold text-white">Questions or requests</p>
          <p className="mt-2 text-sm leading-relaxed text-dark-400">
            Contact the UkweliTally team at{' '}
            <a href="mailto:elgeiy8@gmail.com" className="font-medium text-brand-300 hover:text-brand-200">
              elgeiy8@gmail.com
            </a>{' '}
            (alternative:{' '}
            <a href="mailto:tetoteknologies@gmail.com" className="font-medium text-brand-300 hover:text-brand-200">
              tetoteknologies@gmail.com
            </a>)
            {' '}or{' '}
            <a href="tel:+254721237811" className="font-medium text-brand-300 hover:text-brand-200">
              +254 721 237811
            </a>
            . We aim to respond to privacy requests within 30 days.
          </p>
        </div>
      </div>

      <footer className="border-t border-white/[0.06] bg-dark-950/50">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-dark-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-xs text-dark-500">
            © {new Date().getFullYear()} UkweliTally. Not affiliated with IEBC. <PoweredBy />
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="transition-colors hover:text-white">Home</Link>
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy policy</Link>
            <Link href="/terms" className="transition-colors hover:text-white">Terms &amp; conditions</Link>
            <a href="mailto:elgeiy8@gmail.com" className="transition-colors hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
