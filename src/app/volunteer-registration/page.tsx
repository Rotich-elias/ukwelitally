'use client'

import { useState } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import PageHeader from '@/components/PageHeader'
import LocationSelector from '@/components/LocationSelector'

const benefits = [
  {
    title: 'Training provided',
    description: 'Complete training on election procedures and result submission.',
    tone: 'border-brand-400/20 bg-brand-500/10 text-brand-300',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  {
    title: 'Secure platform',
    description: 'Your data is protected with enterprise-grade security measures.',
    tone: 'border-purple-400/20 bg-purple-500/10 text-purple-300',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    ),
  },
  {
    title: 'Join a community',
    description: 'Become part of a nationwide network of election observers.',
    tone: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    ),
  },
]

const instructions = [
  'Complete the registration form above with accurate information.',
  'We will contact you for verification and training within 48 hours.',
  'Attend the online training session on election procedures.',
  'Receive your observer assignment and credentials.',
  'Monitor presidential results at your assigned polling station on election day.',
]

export default function VolunteerRegistrationPage() {
  const [volunteerFormData, setVolunteerFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    id_number: '',
    county_id: undefined as number | undefined,
    constituency_id: undefined as number | undefined,
    ward_id: undefined as number | undefined,
    polling_station_id: undefined as number | undefined,
  })
  const [volunteerLoading, setVolunteerLoading] = useState(false)
  const [volunteerError, setVolunteerError] = useState('')
  const [volunteerSuccess, setVolunteerSuccess] = useState('')

  const handleVolunteerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setVolunteerError('')
    setVolunteerSuccess('')
    setVolunteerLoading(true)

    try {
      const response = await fetch('/api/volunteers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(volunteerFormData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit registration')
      }

      setVolunteerSuccess(data.message || 'Thank you for your interest! We will contact you soon to complete your registration.')
      setVolunteerFormData({
        full_name: '',
        email: '',
        phone: '',
        id_number: '',
        county_id: undefined,
        constituency_id: undefined,
        ward_id: undefined,
        polling_station_id: undefined,
      })
    } catch (err: any) {
      setVolunteerError(err.message || 'Failed to submit registration. Please try again.')
    } finally {
      setVolunteerLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setVolunteerFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleLocationChange = (location: any) => {
    setVolunteerFormData(prev => ({
      ...prev,
      county_id: location.countyId,
      constituency_id: location.constituencyId,
      ward_id: location.wardId,
      polling_station_id: location.pollingStationId,
    }))
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PublicNav active="volunteer" />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <PageHeader
          eyebrow="Join the network"
          title="Volunteer for presidential results monitoring"
          description="Join our network of independent observers specifically for presidential election results. Help ensure transparent and accurate presidential tallying."
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-brand">Observer onboarding</span>
              <span className="badge border-white/10 bg-white/[0.03] text-dark-300">Training included</span>
              <span className="badge border-white/10 bg-white/[0.03] text-dark-300">Nationwide network</span>
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-start">
          {/* Form */}
          <div className="glass-effect rounded-3xl p-5 sm:p-7">
            {volunteerError && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{volunteerError}</span>
              </div>
            )}

            {volunteerSuccess && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{volunteerSuccess}</span>
              </div>
            )}

            <form onSubmit={handleVolunteerSubmit} className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-white">Your details</h2>
                <p className="mt-1 text-sm text-dark-400">
                  Fields marked with an asterisk are required.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="full_name" className="field-label">
                    Full name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    value={volunteerFormData.full_name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 text-sm"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="field-label">
                    Email address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={volunteerFormData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 text-sm"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="field-label">
                    Phone number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={volunteerFormData.phone}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 text-sm"
                    placeholder="e.g. 0721 234567"
                  />
                </div>

                <div>
                  <label htmlFor="id_number" className="field-label">
                    National ID number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    id="id_number"
                    name="id_number"
                    value={volunteerFormData.id_number}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 text-sm"
                    placeholder="Enter your ID number"
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.07] pt-6">
                <h2 className="text-base font-semibold text-white">Preferred polling station</h2>
                <p className="mb-4 mt-1 text-sm text-dark-400">
                  Choose the station where you would like to observe on election day.
                </p>
                <LocationSelector
                  onLocationChange={handleLocationChange}
                  showPollingStations={true}
                  required={true}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-sm text-xs leading-relaxed text-dark-500">
                  By registering, you agree to our terms of service and privacy policy. You&apos;ll
                  be contacted for verification and training.
                </p>
                <button type="submit" disabled={volunteerLoading} className="btn-primary px-6 py-3">
                  {volunteerLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    <>
                      Register as volunteer
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="glass-effect rounded-3xl p-5 sm:p-6">
              <h2 className="text-base font-semibold text-white">Why volunteer</h2>
              <div className="mt-4 space-y-4">
                {benefits.map((benefit) => (
                  <div key={benefit.title} className="flex items-start gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${benefit.tone}`}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {benefit.icon}
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{benefit.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-dark-400">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-effect rounded-3xl p-5 sm:p-6">
              <h2 className="text-base font-semibold text-white">What happens next</h2>
              <ol className="mt-4 space-y-3.5">
                {instructions.map((instruction, index) => (
                  <li key={instruction} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-400/30 bg-brand-500/10 text-[11px] font-semibold text-brand-200">
                      {index + 1}
                    </span>
                    <span className="text-xs leading-relaxed text-dark-300">{instruction}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5">
              <p className="text-xs leading-relaxed text-dark-500">
                Not ready to register?{' '}
                <Link href="/presidential-results" className="font-medium text-brand-300 transition-colors hover:text-brand-200">
                  View live results
                </Link>{' '}
                or{' '}
                <Link href="/" className="font-medium text-brand-300 transition-colors hover:text-brand-200">
                  return home
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-white/[0.06] bg-dark-950/50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
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
              <p className="mt-4 text-sm leading-relaxed text-dark-500">
                Independent election results tallying for candidates, agents and observers. Not
                affiliated with IEBC.
              </p>
              <p className="mt-4 text-xs text-dark-600">
                © {new Date().getFullYear()} UkweliTally. Built for Kenyan elections.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-12 gap-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark-500">Platform</p>
                <div className="mt-3 space-y-2.5 text-sm">
                  <Link href="/" className="block text-dark-400 transition-colors hover:text-white">Home</Link>
                  <Link href="/presidential-results" className="block text-dark-400 transition-colors hover:text-white">Live results</Link>
                  <Link href="/login" className="block text-dark-400 transition-colors hover:text-white">Sign in</Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark-500">Get in touch</p>
                <div className="mt-3 flex items-center gap-2">
                  <a href="mailto:elgeiy8@gmail.com" title="Email" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-brand-400/30 hover:text-brand-300">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </a>
                  <a href="https://wa.me/254721237811" target="_blank" rel="noopener noreferrer" title="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-emerald-400/30 hover:text-emerald-300">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.655 4.395 1.906 6.215l-1.036 3.793 3.863-1.025z" /></svg>
                  </a>
                  <a href="tel:+254721237811" title="Call" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-purple-400/30 hover:text-purple-300">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
