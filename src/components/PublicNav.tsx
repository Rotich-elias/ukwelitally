'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { trackEvent } from '@/lib/analytics'

interface PublicNavProps {
  active?: 'home' | 'results' | 'volunteer' | 'polls'
  onGetStarted?: () => void
}

const links = [
  { label: 'How it works', href: '/#how-it-works', key: 'home' as const },
  { label: 'Results', href: '/presidential-results', key: 'results' as const },
  { label: 'Create poll', href: '/polls/create', key: 'polls' as const },
  { label: 'Volunteer', href: '/volunteer-registration', key: 'volunteer' as const },
]

export default function PublicNav({ active = 'home', onGetStarted }: PublicNavProps) {
  const [open, setOpen] = useState(false)

  // Reserve room at the bottom of public pages so the fixed mobile contact bar
  // never covers the footer or the last form control.
  useEffect(() => {
    document.body.classList.add('has-mobile-contact')
    return () => document.body.classList.remove('has-mobile-contact')
  }, [])

  const getStarted = onGetStarted ? (
    <button
      onClick={() => {
        trackEvent('cta_click', { label: 'get_started', location: 'nav' })
        onGetStarted()
      }}
      className="btn-primary px-4 py-2.5"
    >
      Get started
    </button>
  ) : (
    <Link
      href="/login"
      onClick={() => trackEvent('cta_click', { label: 'get_started', location: 'nav' })}
      className="btn-primary px-4 py-2.5"
    >
      Get started
    </Link>
  )

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-dark-950/[0.72] backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="relative">
            <span className="absolute inset-0 rounded-xl bg-brand-500/40 blur-lg transition-opacity duration-300 group-hover:opacity-100" />
            <img
              src="/icons/icon-72x72.webp"
              alt=""
              width={36}
              height={36}
              className="relative h-9 w-9 rounded-xl ring-1 ring-white/10"
            />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">
            Ukweli<span className="gradient-text">Tally</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                active === link.key
                  ? 'bg-white/[0.07] text-white'
                  : 'text-dark-400 hover:bg-white/[0.04] hover:text-dark-100'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-dark-300 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          {getStarted}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-dark-200 transition-colors hover:bg-white/[0.08] hover:text-white md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/[0.06] bg-dark-950/95 px-4 pb-5 pt-3 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                  active === link.key
                    ? 'bg-white/[0.07] text-white'
                    : 'text-dark-300 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-4">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="btn-secondary flex-1 px-4 py-2.5"
            >
              Sign in
            </Link>
            <div className="flex-1" onClick={() => setOpen(false)}>
              {getStarted}
            </div>
          </div>
        </div>
      )}

      </header>

      {/* Persistent contact bar on phones. The body class added above reserves
          space for it, so it never hides page content. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-dark-950/[0.94] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <a
            href="https://wa.me/254721237811"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('contact_click', { method: 'whatsapp', location: 'mobile_bar' })}
            className="btn-secondary flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.655 4.395 1.906 6.215l-1.036 3.793 3.863-1.025z" />
            </svg>
            WhatsApp
          </a>
          <a
            href="tel:+254721237811"
            onClick={() => trackEvent('contact_click', { method: 'call', location: 'mobile_bar' })}
            className="btn-primary flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call us
          </a>
        </div>
      </div>
    </>
  )
}
