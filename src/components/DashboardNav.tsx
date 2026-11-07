'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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

const roleStyles: Record<string, string> = {
  admin: 'border-purple-400/25 bg-purple-500/10 text-purple-300',
  candidate: 'border-brand-400/25 bg-brand-500/10 text-brand-300',
  agent: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-300',
  observer: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
}

export default function DashboardNav() {
  const router = useRouter()
  const pathname = usePathname()
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
        headers: { Authorization: `Bearer ${token}` },
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
          Authorization: `Bearer ${token}`,
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

  const dashboardHref = `/dashboard/${user.role}`
  const roleLabel = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'
  const roleClass = roleStyles[user.role] || 'border-white/15 bg-white/[0.05] text-dark-300'

  const navLinks = [
    { href: dashboardHref, label: 'Dashboard' },
    ...(user.role !== 'agent' ? [{ href: '/results', label: 'Results' }] : []),
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-dark-950/[0.78] backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <Link href={dashboardHref} className="flex shrink-0 items-center gap-2.5">
            <img
              src="/icons/icon-192x192.png"
              alt=""
              width={34}
              height={34}
              className="h-8 w-8 rounded-xl ring-1 ring-white/10"
            />
            <span className="hidden text-base font-semibold tracking-tight text-white sm:inline">
              Ukweli<span className="gradient-text">Tally</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Dashboard">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== '/results' && pathname?.startsWith(link.href))
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/[0.07] text-white'
                      : 'text-dark-400 hover:bg-white/[0.04] hover:text-dark-100'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold sm:inline-flex ${roleClass}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {roleLabel}
          </span>

          <div className="hidden sm:block">
            <InstallAppButton variant="compact" />
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications)
                setShowMenu(false)
                if (!showNotifications) fetchNotifications()
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-300 transition-colors hover:bg-white/[0.07] hover:text-white"
              aria-label={`Notifications (${unreadCount} unread)`}
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-dark-950">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/[0.08] bg-dark-900/95 shadow-soft backdrop-blur-xl animate-slide-in-up">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                  <span className="text-sm font-semibold text-white">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs font-medium text-brand-300 transition-colors hover:text-brand-200"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-[65vh] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-dark-500">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </span>
                      <p className="mt-3 text-sm text-dark-400">No notifications yet</p>
                      <p className="mt-1 text-xs text-dark-600">Updates about your submissions will appear here.</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`border-b border-white/[0.05] px-4 py-3 last:border-0 transition-colors hover:bg-white/[0.025] ${
                          n.read ? 'opacity-60' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              n.type === 'error'
                                ? 'bg-red-500'
                                : n.type === 'warning'
                                  ? 'bg-amber-500'
                                  : n.type === 'success'
                                    ? 'bg-emerald-500'
                                    : 'bg-brand-500'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">{n.title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-dark-400">{n.message}</p>
                            <p className="mt-1 text-[10px] text-dark-600">
                              {new Date(n.sent_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowMenu(!showMenu)
                setShowNotifications(false)
              }}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-1 pr-2 transition-colors hover:bg-white/[0.07] sm:pr-3"
              aria-label="Account menu"
              aria-expanded={showMenu}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-cyan-400 text-sm font-semibold text-white">
                {user.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="hidden text-left lg:block">
                <p className="max-w-[9rem] truncate text-xs font-semibold text-white">
                  {user.full_name}
                </p>
                <p className="max-w-[9rem] truncate text-[10px] text-dark-500">{user.email}</p>
              </div>
              <svg
                className={`hidden h-3.5 w-3.5 text-dark-500 transition-transform sm:block ${showMenu ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-white/[0.08] bg-dark-900/95 shadow-soft backdrop-blur-xl animate-slide-in-up">
                <div className="border-b border-white/[0.06] px-4 py-3">
                  <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
                  <p className="truncate text-xs text-dark-500">{user.email}</p>
                  <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roleClass}`}>
                    {roleLabel}
                  </span>
                </div>
                <div className="p-1.5">
                  <Link
                    href={dashboardHref}
                    onClick={() => setShowMenu(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-dark-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Dashboard
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compact mobile navigation */}
      <div className="border-t border-white/[0.05] px-4 pb-2 pt-1 md:hidden">
        <div className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== '/results' && pathname?.startsWith(link.href))
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? 'bg-white/[0.07] text-white' : 'text-dark-400 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
          <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${roleClass}`}>
            {roleLabel}
          </span>
        </div>
      </div>
    </header>
  )
}
