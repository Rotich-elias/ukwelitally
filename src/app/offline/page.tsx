'use client'

const offlineFeatures = [
  'View previously loaded results',
  'Prepare submissions that sync when online',
  'Access cached polling station data',
]

const tips = [
  'Check your WiFi or mobile data connection',
  'Try moving to an area with better signal',
  'Pending submissions sync automatically when you reconnect',
]

export default function OfflinePage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="glow-orb left-1/2 top-0 h-72 w-[32rem] -translate-x-1/2 bg-brand-600/20 animate-pulse-slow" />

      <div className="relative w-full max-w-lg">
        <div className="glass-effect rounded-3xl p-6 text-center shadow-soft sm:p-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-dark-400">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
              />
            </svg>
          </div>

          <span className="badge-warning mt-5">No connection</span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            You&apos;re offline
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-dark-400">
            It looks like you&apos;ve lost your internet connection. UkweliTally needs an active
            connection to load new data.
          </p>

          <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left">
            <h2 className="text-sm font-semibold text-white">What you can still do</h2>
            <ul className="mt-3 space-y-2.5">
              {offlineFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-dark-300">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <button onClick={() => window.location.reload()} className="btn-primary mt-6 w-full py-3.5">
            Try again
          </button>

          <div className="mt-6 border-t border-white/[0.07] pt-5 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-dark-500">Tips</p>
            <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-dark-400">
              {tips.map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-dark-500" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
