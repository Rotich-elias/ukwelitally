'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import InstallAppButton from '@/components/InstallAppButton'

interface User {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
}

interface Notification {
  id: number
  title: string
  message: string
  type: string
  read: boolean
  sent_at: string
}

export default function DashboardNav() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const response = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unread_count || 0)
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
  }

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      setUser(JSON.parse(userStr))
      fetchNotifications()
    } else {
      router.push('/login')
    }
  }, [router])

  const markAllRead = async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ all: true }),
      })
      await fetchNotifications()
    } catch (error) {
      console.error('Failed to mark notifications as read:', error)
    }
  }

  const handleLogout = async () => {
    // Clear the httpOnly session cookie used by route middleware
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Failed to clear session cookie:', error)
    }

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
              <InstallAppButton variant="compact" />
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications)
                  setShowMenu(false)
                  if (!showNotifications) fetchNotifications()
                }}
                className="relative text-sm text-dark-300 hover:text-white transition-colors"
                aria-label={`Notifications (${unreadCount} unread)`}
              >
                Notifications
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Notifications panel */}
          {showNotifications && (
            <div className="absolute right-4 mt-2 w-96 glass-effect rounded-lg shadow-lg py-2 z-50 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-2 border-b border-dark-700/50">
                <span className="text-sm font-semibold text-white">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-sm text-dark-400 text-center">
                  No notifications yet
                </p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-dark-700/30 last:border-0 ${
                      n.read ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                          n.type === 'error'
                            ? 'bg-red-500'
                            : n.type === 'warning'
                            ? 'bg-yellow-500'
                            : n.type === 'success'
                            ? 'bg-emerald-500'
                            : 'bg-blue-500'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{n.title}</p>
                        <p className="text-xs text-dark-300 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-dark-500 mt-1">
                          {new Date(n.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

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
