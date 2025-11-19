'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LocationSelector from '@/components/LocationSelector'

export default function VolunteerRegistrationPage() {
  const router = useRouter()
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
    <div className="min-h-screen bg-dark-950">
      {/* Public Navigation Header */}
      <nav className="glass-effect border-b border-dark-700/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <a href="/" className="cursor-pointer">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              UkweliTally
            </h1>
          </a>
          <div className="space-x-4">
            <a href="/" className="text-dark-300 hover:text-blue-400 transition-colors">
              Home
            </a>
            <a 
              href="/presidential-results" 
              className="text-dark-300 hover:text-blue-400 transition-colors"
            >
              Results
            </a>
            <a 
              href="/login" 
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-2 rounded-lg hover:from-blue-500 hover:to-blue-400 transition-all hover:shadow-glow"
            >
              Login
            </a>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            Volunteer for Presidential Results Monitoring
          </h1>
          <p className="text-xl text-dark-300 max-w-2xl mx-auto">
            Join our network of independent observers specifically for presidential election results. 
            Help ensure transparent and accurate presidential tallying.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="glass-effect rounded-2xl p-8">
            {/* Error/Success Messages */}
            {volunteerError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
                {volunteerError}
              </div>
            )}

            {volunteerSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-6">
                {volunteerSuccess}
              </div>
            )}

            <form onSubmit={handleVolunteerSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    value={volunteerFormData.full_name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your full name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={volunteerFormData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your email"
                  />
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Phone Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={volunteerFormData.phone}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 0721 234567"
                  />
                </div>

                {/* ID Number */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    National ID Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="id_number"
                    value={volunteerFormData.id_number}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your ID number"
                  />
                </div>
              </div>

              {/* Polling Station Selection */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-2">
                  Preferred Polling Station <span className="text-red-400">*</span>
                </label>
                <LocationSelector
                  onLocationChange={handleLocationChange}
                  showPollingStations={true}
                  required={true}
                />
              </div>

              {/* Submit Button */}
              <div className="flex justify-center pt-4">
                <button
                  type="submit"
                  disabled={volunteerLoading}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all hover:shadow-glow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {volunteerLoading ? 'Submitting...' : 'Register as Presidential Results Volunteer'}
                </button>
              </div>

              <p className="text-center text-sm text-dark-400">
                By registering, you agree to our terms of service and privacy policy.
                You'll be contacted for verification and training.
              </p>
            </form>
          </div>

          {/* Benefits */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="font-semibold text-white mb-2">Training Provided</h4>
              <p className="text-dark-300 text-sm">Complete training on election procedures and result submission</p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="font-semibold text-white mb-2">Secure Platform</h4>
              <p className="text-dark-300 text-sm">Your data is protected with enterprise-grade security measures</p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h4 className="font-semibold text-white mb-2">Join a Community</h4>
              <p className="text-dark-300 text-sm">Become part of a nationwide network of election observers</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="glass-effect rounded-xl p-6 mt-8">
            <h3 className="text-xl font-semibold text-white mb-4">Volunteer Instructions</h3>
            <ul className="space-y-3 text-dark-300">
              <li className="flex items-start gap-3">
                <span className="text-blue-400 font-bold">1.</span>
                <span>Complete the registration form above with accurate information</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-400 font-bold">2.</span>
                <span>We will contact you for verification and training within 48 hours</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-400 font-bold">3.</span>
                <span>Attend the online training session on election procedures</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-400 font-bold">4.</span>
                <span>Receive your observer assignment and credentials</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-400 font-bold">5.</span>
                <span>Monitor presidential results at your assigned polling station on election day</span>
              </li>
            </ul>
          </div>

          {/* Back to Home */}
          <div className="text-center mt-8">
            <button
              onClick={() => router.push('/')}
              className="text-blue-400 hover:text-blue-300 transition-colors flex items-center justify-center gap-2 mx-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home Page
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="glass-effect border-t border-dark-700/50 py-12 mt-20">
        <div className="container mx-auto px-4 text-center">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="text-center md:text-left">
              <h4 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                UkweliTally
              </h4>
              <p className="text-dark-200">&copy; 2025 UkweliTally. Built for Kenyan Elections.</p>
              <p className="text-sm mt-1 text-dark-400">
                Independent platform - Not affiliated with IEBC
              </p>
            </div>
            <div className="text-center md:text-right">
              <h4 className="text-lg font-semibold text-white mb-4">Get in Touch</h4>
              <div className="flex justify-center md:justify-end items-center gap-6">
                <a href="mailto:elgeiy8@gmail.com" title="Email" className="text-dark-300 hover:text-blue-400 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                </a>
                <a href="https://wa.me/254721237811" target="_blank" rel="noopener noreferrer" title="WhatsApp" className="text-dark-300 hover:text-green-400 transition-colors">
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.655 4.395 1.906 6.215l-1.036 3.793 3.863-1.025z"></path></svg>
                </a>
                <a href="tel:+254721237811" title="Call" className="text-dark-300 hover:text-purple-400 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}