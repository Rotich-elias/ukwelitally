'use client'

import Link from 'next/link'
import { useState } from 'react'

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

  const getStarted = onGetStarted ? (
    <button onClick={onGetStarted} className="btn-primary px-4 py-2.5">
      Get started
    </button>
  ) : (
    <Link href="/login" className="btn-primary px-4 py-2.5">
      Get started
    </Link>
  )

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-dark-950/[0.72] backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="relative">
            <span className="absolute inset-0 rounded-xl bg-brand-500/40 blur-lg transition-opacity duration-300 group-hover:opacity-100" />
            <img
              src="/icons/icon-192x192.png"
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
  )
}
