'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface User {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
}

export default function DashboardNav() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      setUser(JSON.parse(userStr))
    } else {
      router.push('/login')
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  if (!user) return null

  return (
    <nav className="glass-effect border-b border-dark-700/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          {/* Logo and Navigation */}
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              UkweliTally
            </h1>
            <div className="flex items-center gap-4">
              <a
                href={`/dashboard/${user.role}`}
                className="text-sm text-dark-300 hover:text-white transition-colors"
              >
                Dashboard
              </a>
              {/* Hide Results link from agents */}
              {user.role !== 'agent' && (
                <a
                  href="/results"
                  className="text-sm text-dark-300 hover:text-white transition-colors"
                >
                  Results
                </a>
              )}
              <span className="text-sm px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              </span>
            </div>
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-dark-800/50 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                {user.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-sm font-medium text-white">{user.full_name}</p>
                <p className="text-xs text-dark-400">{user.email}</p>
              </div>
              <svg
                className={`w-4 h-4 text-dark-400 transition-transform ${showMenu ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 glass-effect rounded-lg shadow-lg py-2">
                <a
                  href="#"
                  className="block px-4 py-2 text-sm text-dark-200 hover:bg-dark-800/50 transition-colors"
                >
                  Profile Settings
                </a>
                <a
                  href="#"
                  className="block px-4 py-2 text-sm text-dark-200 hover:bg-dark-800/50 transition-colors"
                >
                  Notifications
                </a>
                <hr className="my-2 border-dark-700" />
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-dark-800/50 transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
