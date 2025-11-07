'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const router = useRouter()

  // Redirect to login - public registration is disabled
  useEffect(() => {
    router.push('/login')
  }, [router])

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-dark-300">Redirecting to login...</p>
      </div>
    </div>
  )
}
