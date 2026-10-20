'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Dashboard index.
 *
 * Sends the user to the dashboard matching their role. Acts as the fallback
 * for the login page's default redirect.
 */
export default function DashboardIndexPage() {
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')

    if (!token || !user) {
      router.push('/login')
      return
    }

    try {
      const { role } = JSON.parse(user)
      router.push(`/dashboard/${role}`)
    } catch {
      router.push('/login')
    }
  }, [router])

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-dark-300">Redirecting to your dashboard...</p>
      </div>
    </div>
  )
}
