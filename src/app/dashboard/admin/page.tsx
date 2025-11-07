'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import LocationSelector from '@/components/LocationSelector'

interface User {
  id: number
  email: string
  phone: string
  full_name: string
  role: string
  verified: boolean
  active: boolean
  created_at: string
  profile_id?: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterRole, setFilterRole] = useState<string>('all')
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    full_name: '',
    id_number: '',
    role: 'candidate',
    password: '',
    party_name: '',
    position: 'president',
    county_id: undefined as number | undefined,
    constituency_id: undefined as number | undefined,
    ward_id: undefined as number | undefined,
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')

    if (!token || !user) {
      router.push('/login')
      return
    }

    const userData = JSON.parse(user)
    if (userData.role !== 'admin') {
      router.push('/login')
      return
    }

    fetchUsers()
  }, [router, filterRole])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const url = filterRole === 'all'
        ? '/api/admin/users'
        : `/api/admin/users?role=${filterRole}`

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUsers(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setSuccess(`User created successfully! Email: ${formData.email}, Password: ${formData.password}`)
      setFormData({
        email: '',
        phone: '',
        full_name: '',
        id_number: '',
        role: 'candidate',
        password: '',
        party_name: '',
        position: 'president',
        county_id: undefined,
        constituency_id: undefined,
        ward_id: undefined,
      })
      fetchUsers()

      // Keep modal open to show success message with credentials
    } catch (err: any) {
      setError(err.message || 'Failed to create user')
    }
  }

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let password = 'Pass' + Math.floor(Math.random() * 9000 + 1000)
    return password
  }

  const handleLocationChange = (location: any) => {
    setFormData({
      ...formData,
      county_id: location.countyId,
      constituency_id: location.constituencyId,
      ward_id: location.wardId,
    })
  }

  const getRequiredLocation = () => {
    switch (formData.position) {
      case 'president':
        return null
      case 'governor':
      case 'senator':
        return 'county'
      case 'mp':
        return 'constituency'
      case 'mca':
        return 'ward'
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
            <p className="text-dark-300">Manage candidates, agents, and observers</p>
          </div>
          <button
            onClick={() => {
              setShowCreateModal(true)
              setError('')
              setSuccess('')
            }}
            className="btn-primary"
          >
            + Create User
          </button>
        </div>

        {/* Filter */}
        <div className="mb-6 flex gap-2">
          {['all', 'candidate', 'agent', 'observer'].map((role) => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterRole === role
                  ? 'bg-blue-500 text-white'
                  : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
              }`}
            >
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </button>
          ))}
        </div>

        {/* Users Table */}
        <div className="glass-effect rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-800/50 border-b border-dark-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Phone</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-dark-400">
                      Loading...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-dark-400">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-dark-800/30 transition-colors">
                      <td className="px-6 py-4 text-white font-medium">{user.full_name}</td>
                      <td className="px-6 py-4 text-dark-300">{user.email}</td>
                      <td className="px-6 py-4 text-dark-300">{user.phone}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'candidate' ? 'bg-purple-500/20 text-purple-400' :
                          user.role === 'agent' ? 'bg-blue-500/20 text-blue-400' :
                          user.role === 'observer' ? 'bg-green-500/20 text-green-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {user.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-dark-300 text-sm">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Create New User</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {success}
                  <div className="mt-2 p-2 bg-dark-900/50 rounded font-mono text-xs">
                    <strong>Save these credentials:</strong><br/>
                    Email: {formData.email}<br/>
                    Password: {formData.password}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">Email *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                      placeholder="john@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">Phone *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                      placeholder="+254712345678"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">ID Number *</label>
                    <input
                      type="text"
                      required
                      pattern="\d{7,8}"
                      value={formData.id_number}
                      onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                      placeholder="12345678"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">Role *</label>
                    <select
                      required
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                    >
                      <option value="candidate">Candidate</option>
                      <option value="agent">Agent</option>
                      <option value="observer">Observer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">Password *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="flex-1 px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                        placeholder="Password123"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, password: generatePassword() })}
                        className="px-4 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm"
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  {formData.role === 'candidate' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-dark-200 mb-2">Party Name</label>
                        <input
                          type="text"
                          value={formData.party_name}
                          onChange={(e) => setFormData({ ...formData, party_name: e.target.value })}
                          className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                          placeholder="Independent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-dark-200 mb-2">Position *</label>
                        <select
                          value={formData.position}
                          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                          className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                        >
                          <option value="president">President (National)</option>
                          <option value="governor">Governor (County)</option>
                          <option value="senator">Senator (County)</option>
                          <option value="mp">MP (Constituency)</option>
                          <option value="mca">MCA (Ward)</option>
                        </select>
                        <p className="mt-1 text-xs text-dark-400">
                          {formData.position === 'president' && 'National position - no location restriction'}
                          {(formData.position === 'governor' || formData.position === 'senator') && 'Must select county'}
                          {formData.position === 'mp' && 'Must select constituency'}
                          {formData.position === 'mca' && 'Must select ward'}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Location Selector for Candidates */}
                {formData.role === 'candidate' && formData.position !== 'president' && (
                  <div className="border-t border-dark-700 pt-4 mt-4">
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Electoral Area *
                      <span className="text-sm text-dark-400 font-normal ml-2">
                        (Where they are vying)
                      </span>
                    </h3>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
                      <p className="text-sm text-yellow-400">
                        ⚠️ <strong>Important:</strong> This restricts the candidate to only see data from their electoral area.
                        {formData.position === 'mca' && ' Select the specific ward they are contesting.'}
                        {formData.position === 'mp' && ' Select the specific constituency they are contesting.'}
                        {(formData.position === 'governor' || formData.position === 'senator') && ' Select the specific county they are contesting.'}
                      </p>
                    </div>
                    <LocationSelector
                      onLocationChange={handleLocationChange}
                      showPollingStations={false}
                      required={true}
                    />
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    Create User
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-6 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
