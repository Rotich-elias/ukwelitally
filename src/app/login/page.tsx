'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      // Store token
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      // Redirect based on role
      switch (data.user.role) {
        case 'agent':
          router.push('/dashboard/agent')
          break
        case 'candidate':
          router.push('/dashboard/candidate')
          break
        case 'observer':
          router.push('/dashboard/observer')
          break
        case 'admin':
          router.push('/dashboard/admin')
          break
        default:
          router.push('/dashboard')
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-dark-950">
      <div className="glow-orb left-1/2 top-[-14rem] h-[28rem] w-[36rem] -translate-x-1/2 bg-brand-600/20 animate-pulse-slow lg:left-[22%]" />
      <div className="glow-orb -right-32 bottom-[-8rem] h-96 w-96 bg-cyan-500/10 animate-aurora" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between border-r border-white/[0.06] px-10 py-12 lg:flex xl:px-16">
          <Link href="/" className="inline-flex w-fit items-center gap-2.5">
            <img
              src="/icons/icon-192x192.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl ring-1 ring-white/10"
            />
            <span className="text-lg font-semibold tracking-tight text-white">
              Ukweli<span className="gradient-text">Tally</span>
            </span>
          </Link>

          <div className="max-w-md">
            <p className="section-label mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Independent election tallying
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-5xl">
              Every result has a
              <br />
              <span className="gradient-text">paper trail.</span>
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-dark-400">
              Sign in to follow your race station by station, review evidence and
              keep the tally honest.
            </p>

            <div className="mt-10 space-y-4">
              {[
                'Photo evidence attached to every submission',
                'GPS checks and duplicate detection',
                'Works on a slow or intermittent connection',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-dark-300">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <p className="text-xs leading-relaxed text-dark-500">
              Sessions are verified against your account on every request. Accounts are
              created by an administrator.
            </p>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12 xl:px-20">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Link href="/" className="inline-flex items-center gap-2.5">
                <img
                  src="/icons/icon-192x192.png"
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-xl ring-1 ring-white/10"
                />
                <span className="text-base font-semibold text-white">
                  Ukweli<span className="gradient-text">Tally</span>
                </span>
              </Link>
              <Link href="/" className="text-xs text-dark-400 transition-colors hover:text-white">
                Back home
              </Link>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Welcome back
              </h2>
              <p className="mt-2 text-sm text-dark-400">
                Sign in to your account to continue.
              </p>
            </div>

            <div className="glass-effect rounded-3xl p-6 shadow-soft sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="field-label">
                    Email address
                  </label>
                  <div className="relative">
                    <svg
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <input
                      type="email"
                      id="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full py-3 pl-10 pr-4 text-sm text-white placeholder-dark-600"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="field-label">
                    Password
                  </label>
                  <div className="relative">
                    <svg
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full py-3 pl-10 pr-12 text-sm text-white placeholder-dark-600"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-dark-500 transition-colors hover:text-dark-200"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs">
                  <label className="flex cursor-pointer items-center gap-2 text-dark-400">
                    <input
                      id="remember"
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/15 bg-white/[0.04] text-brand-500 focus:ring-brand-500/40"
                    />
                    Remember me
                  </label>
                  <a href="mailto:elgeiy8@gmail.com" className="font-medium text-brand-300 transition-colors hover:text-brand-200">
                    Forgot password?
                  </a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3.5"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    <>
                      Sign in
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 border-t border-white/[0.07] pt-5 text-center">
                <p className="text-sm text-dark-400">
                  Don&apos;t have an account?{' '}
                  <a href="mailto:elgeiy8@gmail.com" className="font-medium text-brand-300 transition-colors hover:text-brand-200">
                    Contact your administrator
                  </a>
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between text-xs text-dark-500">
              <Link href="/" className="transition-colors hover:text-dark-200">
                ← Back to home
              </Link>
              <Link href="/presidential-results" className="transition-colors hover:text-dark-200">
                View live results
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
