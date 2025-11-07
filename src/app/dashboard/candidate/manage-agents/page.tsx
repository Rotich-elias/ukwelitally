'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import LocationSelector from '@/components/LocationSelector'

interface Agent {
  agent_id: number
  user_id: number
  email: string
  phone: string
  full_name: string
  active: boolean
  is_primary: boolean
  polling_station_id?: number
  station_name?: string
  station_code?: string
  ward_name?: string
  constituency_name?: string
  county_name?: string
  created_at: string
}

export default function ManageAgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    full_name: '',
    id_number: '',
    password: '',
    polling_station_id: undefined as number | undefined,
    is_primary: true,
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
    if (userData.role !== 'candidate') {
      router.push('/login')
      return
    }

    fetchAgents()
  }, [router])

  const fetchAgents = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/candidates/agents', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setAgents(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/candidates/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create agent')
      }

      setSuccess(`Agent created successfully! Email: ${formData.email}, Password: ${formData.password}`)
      setFormData({
        email: '',
        phone: '',
        full_name: '',
        id_number: '',
        password: '',
        polling_station_id: undefined,
        is_primary: true,
      })
      fetchAgents()

      // Keep modal open to show credentials
    } catch (err: any) {
      setError(err.message || 'Failed to create agent')
    }
  }

  const generatePassword = () => {
    return 'Agent' + Math.floor(Math.random() * 9000 + 1000)
  }

  const handleLocationChange = (location: any) => {
    setFormData({ ...formData, polling_station_id: location.pollingStationId })
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Manage Agents</h1>
            <p className="text-dark-300">Create and manage your polling station agents</p>
          </div>
          <button
            onClick={() => {
              setShowCreateModal(true)
              setError('')
              setSuccess('')
            }}
            className="btn-primary"
          >
            + Create Agent
          </button>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="glass-effect rounded-xl p-6">
            <p className="text-dark-400 text-sm mb-2">Total Agents</p>
            <p className="text-3xl font-bold text-white">{agents.length}</p>
          </div>
          <div className="glass-effect rounded-xl p-6">
            <p className="text-dark-400 text-sm mb-2">Assigned to Stations</p>
            <p className="text-3xl font-bold text-white">
              {agents.filter(a => a.polling_station_id).length}
            </p>
          </div>
          <div className="glass-effect rounded-xl p-6">
            <p className="text-dark-400 text-sm mb-2">Active</p>
            <p className="text-3xl font-bold text-white">
              {agents.filter(a => a.active).length}
            </p>
          </div>
        </div>

        {/* Agents Table */}
        <div className="glass-effect rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-800/50 border-b border-dark-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Contact</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Polling Station</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-dark-400">
                      Loading...
                    </td>
                  </tr>
                ) : agents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-dark-400">
                      No agents yet. Create your first agent to get started.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.agent_id} className="hover:bg-dark-800/30 transition-colors">
                      <td className="px-6 py-4 text-white font-medium">{agent.full_name}</td>
                      <td className="px-6 py-4 text-dark-300 text-sm">
                        <div>{agent.email}</div>
                        <div className="text-xs text-dark-400">{agent.phone}</div>
                      </td>
                      <td className="px-6 py-4 text-dark-300 text-sm">
                        {agent.station_name ? (
                          <div>
                            <div>{agent.station_name}</div>
                            <div className="text-xs text-dark-400">
                              {agent.ward_name}, {agent.constituency_name}
                            </div>
                          </div>
                        ) : (
                          <span className="text-dark-500 italic">Not assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          agent.is_primary
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {agent.is_primary ? 'Primary' : 'Backup'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          agent.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {agent.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Create New Agent</h2>
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

              <form onSubmit={handleCreateAgent} className="space-y-4">
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
                    <label className="block text-sm font-medium text-dark-200 mb-2">Password *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="flex-1 px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                        placeholder="Agent1234"
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

                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">Agent Type</label>
                    <select
                      value={formData.is_primary ? 'primary' : 'backup'}
                      onChange={(e) => setFormData({ ...formData, is_primary: e.target.value === 'primary' })}
                      className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                    >
                      <option value="primary">Primary Agent</option>
                      <option value="backup">Backup Agent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Assign Polling Station (Optional)</h3>
                  <LocationSelector
                    onLocationChange={handleLocationChange}
                    showPollingStations={true}
                    required={false}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    Create Agent
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
