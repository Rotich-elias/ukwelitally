'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import PageHeader from '@/components/PageHeader'
import PollManager from '@/components/PollManager'

export default function PollsDashboardPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('user')
    if (!raw) {
      router.push('/login')
      return
    }

    try {
      const user = JSON.parse(raw)
      if (user.role !== 'candidate' && user.role !== 'admin') {
        router.push(`/dashboard/${user.role}`)
        return
      }
      setAllowed(true)
    } catch {
      router.push('/login')
    }
  }, [router])

  if (!allowed) return null

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <PageHeader
          eyebrow="Public opinion"
          title="Opinion polls"
          description="Create a poll, add the options and share a public link. Responses are collected separately from the official election tally."
        />
        <PollManager />
      </div>
    </div>
  )
}
