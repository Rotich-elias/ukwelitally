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
  position?: string
  payment_status?: string
  payment_amount?: number
  payment_date?: string
}

interface UserDetails extends User {
  id_number: string
  updated_at: string
  profile?: {
    candidate_id?: number
    party_name?: string
    position?: string
    county_name?: string
    constituency_name?: string
    ward_name?: string
    agent_id?: number
    candidate_name?: string
    polling_station_name?: string
    polling_station_code?: string
  }
}

export default function AdminDashboard() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null)
  const [paymentFormData, setPaymentFormData] = useState({
    expected_payment_amount: '',
    payment_amount: '',
    payment_method: 'M-Pesa',
    payment_reference: '',
    payment_notes: '',
  })
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [totalPaid, setTotalPaid] = useState(0)
  const [expectedAmount, setExpectedAmount] = useState(0)
  const [filterRole, setFilterRole] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'users' | 'ballot_candidates'>('users')
  const [ballotCandidates, setBallotCandidates] = useState<any[]>([])
  const [loadingBallot, setLoadingBallot] = useState(false)
  const [showBallotModal, setShowBallotModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingBallot, setEditingBallot] = useState<any | null>(null)
  const [ballotFormData, setBallotFormData] = useState({
    full_name: '',
    position: 'president',
    party_name: '',
    party_abbreviation: '',
  })
  const [ballotLocationData, setBallotLocationData] = useState({
    county_id: undefined as number | undefined,
    constituency_id: undefined as number | undefined,
    ward_id: undefined as number | undefined,
  })
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null)
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
  const [userError, setUserError] = useState('')
  const [userSuccess, setUserSuccess] = useState('')
  const [ballotError, setBallotError] = useState('')
  const [ballotSuccess, setBallotSuccess] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [paymentSuccess, setPaymentSuccess] = useState('')

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

    if (viewMode === 'ballot_candidates') {
      fetchBallotCandidates()
    }
  }, [router, filterRole, viewMode])

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

  const fetchBallotCandidates = async () => {
    setLoadingBallot(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/ballot-candidates', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setBallotCandidates(data.candidates || [])
      }
    } catch (error) {
      console.error('Failed to fetch ballot candidates:', error)
    } finally {
      setLoadingBallot(false)
    }
  }

  const handleCreateBallotCandidate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBallotError('')
    setBallotSuccess('')

    try {
      const token = localStorage.getItem('token')

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('full_name', ballotFormData.full_name)
      formData.append('position', ballotFormData.position)
      if (ballotFormData.party_name) formData.append('party_name', ballotFormData.party_name)
      if (ballotFormData.party_abbreviation) formData.append('party_abbreviation', ballotFormData.party_abbreviation)

      // Add location IDs based on position requirements
      if (ballotLocationData.county_id) formData.append('county_id', ballotLocationData.county_id.toString())
      if (ballotLocationData.constituency_id) formData.append('constituency_id', ballotLocationData.constituency_id.toString())
      if (ballotLocationData.ward_id) formData.append('ward_id', ballotLocationData.ward_id.toString())

      // Add profile photo if selected
      if (profilePhotoFile) {
        formData.append('profile_photo', profilePhotoFile)
      }

      // If editing, add candidate_id
      if (editingBallot) {
        formData.append('candidate_id', editingBallot.id.toString())
      }

      const response = await fetch('/api/ballot-candidates', {
        method: editingBallot ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save ballot candidate')
      }

      setBallotSuccess(editingBallot ? 'Ballot candidate updated successfully!' : 'Ballot candidate created successfully!')
      setBallotFormData({
        full_name: '',
        position: 'president',
        party_name: '',
        party_abbreviation: '',
      })
      setBallotLocationData({
        county_id: undefined,
        constituency_id: undefined,
        ward_id: undefined,
      })
      setProfilePhotoFile(null)
      setEditingBallot(null)
      setShowBallotModal(false)
      fetchBallotCandidates()
    } catch (err: any) {
      setBallotError(err.message || 'Failed to save ballot candidate')
    }
  }

  const handleDeleteBallotCandidate = async (candidateId: number) => {
    if (!confirm('Are you sure you want to delete this ballot candidate?')) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/ballot-candidates?candidate_id=${candidateId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete ballot candidate')
      }

      setSuccess('Ballot candidate deleted successfully')
      fetchBallotCandidates()
    } catch (err: any) {
      setError(err.message || 'Failed to delete ballot candidate')
    }
  }

  const handleImportCSV = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const fileInput = document.getElementById('csv-file') as HTMLInputElement
    const file = fileInput?.files?.[0]

    if (!file) {
      setError('Please select a CSV file')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/ballot-candidates/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Import failed')
      }

      setSuccess(`Import successful! Imported: ${data.imported}, Skipped: ${data.skipped}`)
      setShowImportModal(false)
      fetchBallotCandidates()
    } catch (err: any) {
      setError(err.message || 'Failed to import candidates')
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError('')
    setUserSuccess('')

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

      setUserSuccess(`User created successfully! Email: ${formData.email}, Password: ${formData.password}`)
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
      setUserError(err.message || 'Failed to create user')
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

  const handleViewUser = async (userId: number) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/admin/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setSelectedUser(data.data)
        setShowViewModal(true)
      }
    } catch (error) {
      console.error('Failed to fetch user details:', error)
    }
  }

  const handleEditUser = async (userId: number) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/admin/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setSelectedUser(data.data)
        setShowEditModal(true)
      }
    } catch (error) {
      console.error('Failed to fetch user details:', error)
    }
  }

  const handleSaveEdit = async () => {
    if (!selectedUser) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: selectedUser.id,
          email: selectedUser.email,
          phone: selectedUser.phone,
          full_name: selectedUser.full_name,
          active: selectedUser.active,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user')
      }

      setSuccess('User updated successfully')
      setShowEditModal(false)
      fetchUsers()
    } catch (err: any) {
      setError(err.message || 'Failed to update user')
    }
  }

  const handleDeleteUser = (user: User) => {
    setSelectedUser(user as UserDetails)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!selectedUser) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/admin/users?user_id=${selectedUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user')
      }

      setSuccess('User deleted successfully')
      setShowDeleteModal(false)
      setSelectedUser(null)
      fetchUsers()
    } catch (err: any) {
      setError(err.message || 'Failed to delete user')
    }
  }

  const getRequiredLocation = () => {
    switch (formData.position) {
      case 'president':
        return null
      case 'governor':
      case 'senator':
      case 'women_rep':
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
            <p className="text-dark-300">Manage system users and ballot candidates</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/dashboard/admin/review-submissions')}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Review Submissions
            </button>
            {viewMode === 'users' ? (
              <button
                onClick={() => {
                  setShowCreateModal(true)
                  setUserError('')
                  setUserSuccess('')
                }}
                className="btn-primary"
              >
                + Create User
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                >
                  Import CSV
                </button>
                <button
                  onClick={() => {
                    setShowBallotModal(true)
                    setEditingBallot(null)
                    setProfilePhotoFile(null)
                    setBallotLocationData({
                      county_id: undefined,
                      constituency_id: undefined,
                      ward_id: undefined,
                    })
                    setBallotError('')
                    setBallotSuccess('')
                  }}
                  className="btn-primary"
                >
                  + Add Ballot Candidate
                </button>
              </>
            )}
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="mb-6 flex gap-2 border-b border-dark-700">
          <button
            onClick={() => setViewMode('users')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              viewMode === 'users'
                ? 'text-blue-400'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            System Users
            {viewMode === 'users' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
            )}
          </button>
          <button
            onClick={() => setViewMode('ballot_candidates')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              viewMode === 'ballot_candidates'
                ? 'text-blue-400'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            Ballot Candidates
            {viewMode === 'ballot_candidates' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
            )}
          </button>
        </div>

        {/* Filter - Only for System Users */}
        {viewMode === 'users' && (
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
        )}

        {/* Content - System Users or Ballot Candidates */}
        {viewMode === 'users' ? (
          <div className="glass-effect rounded-xl overflow-hidden">
            {/* Info Box */}
            <div className="bg-blue-500/10 border-b border-blue-500/30 p-4 mx-6 mt-6 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-300">
                  <p className="font-medium mb-1">System Users vs Ballot Candidates</p>
                  <p className="text-blue-400/80">
                    <strong>System Users</strong> are accounts created here with login credentials (candidates, agents, observers).
                    <strong className="ml-1">Ballot Candidates</strong> are electoral data imported from IEBC for results tracking only.
                    Payment tracking is only available for system user candidates.
                  </p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-dark-800/50 border-b border-dark-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Phone</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Role</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Position</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Payment</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Created</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-dark-400">
                        Loading...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-dark-400">
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
                        {user.role === 'candidate' && user.profile_id && user.position ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-500/20 text-indigo-400 uppercase">
                            {user.position === 'women_rep' ? 'Women Rep' : user.position}
                          </span>
                        ) : (
                          <span className="text-dark-500 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {user.role === 'candidate' && user.profile_id ? (
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.payment_status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                              user.payment_status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                              user.payment_status === 'waived' ? 'bg-blue-500/20 text-blue-400' :
                              user.payment_status === 'refunded' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {user.payment_status || 'pending'}
                            </span>
                            <button
                              onClick={async () => {
                                setSelectedUser(user as any)
                                setPaymentError('')
                                setPaymentSuccess('')
                                setShowPaymentModal(true)

                                // Fetch payment history
                                try {
                                  const token = localStorage.getItem('token')
                                  const response = await fetch(`/api/admin/users/${user.id}/payment`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                  })
                                  const data = await response.json()
                                  if (response.ok) {
                                    setPaymentHistory(data.payment_history || [])
                                    setTotalPaid(data.total_paid || 0)
                                    setExpectedAmount(data.expected_amount || 0)
                                    setPaymentFormData({
                                      expected_payment_amount: data.expected_amount || '',
                                      payment_amount: '',
                                      payment_method: 'M-Pesa',
                                      payment_reference: '',
                                      payment_notes: '',
                                    })
                                  }
                                } catch (err) {
                                  console.error('Failed to fetch payment history:', err)
                                }
                              }}
                              className="p-1 hover:bg-blue-500/20 text-blue-400 rounded transition-colors"
                              title="Manage Payment"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <span className="text-dark-500 text-xs">-</span>
                        )}
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
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewUser(user.id)}
                            className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleEditUser(user.id)}
                            className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors"
                            title="Edit User"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                            title="Delete User"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        ) : (
          // Ballot Candidates View
          <div className="glass-effect rounded-xl overflow-hidden">
            {ballotSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 mb-4 mx-6 mt-6 rounded-lg text-sm">
                {ballotSuccess}
              </div>
            )}
            {ballotError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 mb-4 mx-6 mt-6 rounded-lg text-sm">
                {ballotError}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-dark-800/50 border-b border-dark-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Position</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Party</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Location</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Added</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {loadingBallot ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-dark-400">
                        Loading ballot candidates...
                      </td>
                    </tr>
                  ) : ballotCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-dark-400">
                        No ballot candidates found. Click &quot;Add Ballot Candidate&quot; or &quot;Import CSV&quot; to add candidates.
                      </td>
                    </tr>
                  ) : (
                    ballotCandidates.map((candidate) => (
                      <tr key={candidate.id} className="hover:bg-dark-800/30 transition-colors">
                        <td className="px-6 py-4 text-white font-medium">{candidate.candidate_name}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 uppercase">
                            {candidate.position}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-dark-300">
                          {candidate.party_name || 'Independent'}
                          {candidate.party_abbreviation && ` (${candidate.party_abbreviation})`}
                        </td>
                        <td className="px-6 py-4 text-dark-300 text-sm">
                          {candidate.ward_name && `${candidate.ward_name}, `}
                          {candidate.constituency_name && `${candidate.constituency_name}, `}
                          {candidate.county_name || 'National'}
                        </td>
                        <td className="px-6 py-4 text-dark-300 text-sm">
                          {new Date(candidate.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingBallot(candidate)
                                setBallotFormData({
                                  full_name: candidate.candidate_name,
                                  position: candidate.position,
                                  party_name: candidate.party_name || '',
                                  party_abbreviation: candidate.party_abbreviation || '',
                                })
                                setBallotLocationData({
                                  county_id: candidate.county_id || undefined,
                                  constituency_id: candidate.constituency_id || undefined,
                                  ward_id: candidate.ward_id || undefined,
                                })
                                setProfilePhotoFile(null)
                                setBallotError('')
                                setBallotSuccess('')
                                setShowBallotModal(true)
                              }}
                              className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors"
                              title="Edit Candidate"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteBallotCandidate(candidate.id)}
                              className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                              title="Delete Candidate"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Ballot Candidate Modal */}
      {showBallotModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">
                  {editingBallot ? 'Edit Ballot Candidate' : 'Add Ballot Candidate'}
                </h2>
                <button
                  onClick={() => {
                    setShowBallotModal(false)
                    setEditingBallot(null)
                  }}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreateBallotCandidate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={ballotFormData.full_name}
                    onChange={(e) => setBallotFormData({ ...ballotFormData, full_name: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Position *</label>
                  <select
                    required
                    value={ballotFormData.position}
                    onChange={(e) => setBallotFormData({ ...ballotFormData, position: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                  >
                    <option value="president">President</option>
                    <option value="governor">Governor</option>
                    <option value="senator">Senator</option>
                    <option value="women_rep">Women Representative</option>
                    <option value="mp">MP</option>
                    <option value="mca">MCA</option>
                  </select>
                </div>

                {/* Location Selector - show based on position */}
                {ballotFormData.position !== 'president' && (
                  <div className="border border-dark-700 rounded-lg p-4 bg-dark-900/30">
                    <h3 className="text-sm font-medium text-dark-200 mb-3">
                      Electoral Area *
                    </h3>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
                      <p className="text-xs text-yellow-400">
                        {ballotFormData.position === 'mca' && '⚠️ MCA candidates must select ward'}
                        {ballotFormData.position === 'mp' && '⚠️ MP candidates must select constituency (ward not required)'}
                        {(ballotFormData.position === 'governor' || ballotFormData.position === 'senator' || ballotFormData.position === 'women_rep') && '⚠️ Must select county only'}
                      </p>
                    </div>
                    <LocationSelector
                      initialValues={{
                        countyId: ballotLocationData.county_id,
                        constituencyId: ballotLocationData.constituency_id,
                        wardId: ballotLocationData.ward_id,
                      }}
                      onLocationChange={(location) => {
                        setBallotLocationData({
                          county_id: location.countyId,
                          constituency_id: location.constituencyId,
                          ward_id: location.wardId,
                        })
                      }}
                      required={true}
                      showPollingStations={false}
                      showCounty={true}
                      showConstituency={ballotFormData.position === 'mp' || ballotFormData.position === 'mca'}
                      showWard={ballotFormData.position === 'mca'}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Party Name</label>
                  <input
                    type="text"
                    value={ballotFormData.party_name}
                    onChange={(e) => setBallotFormData({ ...ballotFormData, party_name: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                    placeholder="Independent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Party Abbreviation</label>
                  <input
                    type="text"
                    value={ballotFormData.party_abbreviation}
                    onChange={(e) => setBallotFormData({ ...ballotFormData, party_abbreviation: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                    placeholder="IND"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Profile Photo</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={(e) => setProfilePhotoFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
                  />
                  <p className="mt-1 text-xs text-dark-400">
                    Optional: Upload candidate&apos;s profile photo (max 5MB, JPEG/PNG/WebP)
                  </p>
                  {profilePhotoFile && (
                    <p className="mt-1 text-xs text-emerald-400">
                      Selected: {profilePhotoFile.name}
                    </p>
                  )}
                  {editingBallot?.profile_photo && !profilePhotoFile && (
                    <p className="mt-1 text-xs text-blue-400">
                      Current photo will be kept if no new file is selected
                    </p>
                  )}
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-sm text-blue-400">
                    <strong>Note:</strong> Ballot candidates are individuals vying in elections who do not have system accounts. They will appear in election results alongside system users.
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    {editingBallot ? 'Update Candidate' : 'Add Candidate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBallotModal(false)
                      setEditingBallot(null)
                    }}
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

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Import Ballot Candidates from CSV</h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-2">CSV Format Requirements:</h3>
                <ul className="text-sm text-blue-300 space-y-1">
                  <li>• <strong>Required columns:</strong> full_name, position</li>
                  <li>• <strong>Optional columns:</strong> party_name, party_abbreviation, county_id, constituency_id, ward_id</li>
                  <li>• <strong>Valid positions:</strong> president, governor, senator, mp, mca</li>
                  <li>• First row must be the header row</li>
                </ul>
                <div className="mt-3 p-2 bg-dark-900/50 rounded font-mono text-xs text-dark-300">
                  Example:<br/>
                  full_name,position,party_name,party_abbreviation<br/>
                  John Doe,president,Democratic Party,DP<br/>
                  Jane Smith,governor,Republican Party,RP
                </div>
              </div>

              <form onSubmit={handleImportCSV} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">CSV File *</label>
                  <input
                    type="file"
                    id="csv-file"
                    accept=".csv"
                    required
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    Import Candidates
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
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

              {userSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {userSuccess}
                  <div className="mt-2 p-2 bg-dark-900/50 rounded font-mono text-xs">
                    <strong>Save these credentials:</strong><br/>
                    Email: {formData.email}<br/>
                    Password: {formData.password}
                  </div>
                  <button
                    onClick={() => {
                      setShowCreateModal(false)
                      setUserSuccess('')
                    }}
                    className="mt-3 w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}

              {userError && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {userError}
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
                          <option value="women_rep">Women Representative (County)</option>
                          <option value="mp">MP (Constituency)</option>
                          <option value="mca">MCA (Ward)</option>
                        </select>
                        <p className="mt-1 text-xs text-dark-400">
                          {formData.position === 'president' && 'National position - no location restriction'}
                          {(formData.position === 'governor' || formData.position === 'senator' || formData.position === 'women_rep') && 'Must select county'}
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
                        {(formData.position === 'governor' || formData.position === 'senator' || formData.position === 'women_rep') && ' Select the specific county they are contesting.'}
                      </p>
                    </div>
                    <LocationSelector
                      onLocationChange={handleLocationChange}
                      showPollingStations={false}
                      showCounty={true}
                      showConstituency={formData.position === 'mp' || formData.position === 'mca'}
                      showWard={formData.position === 'mca'}
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

      {/* View User Details Modal */}
      {showViewModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">User Details</h2>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-1">Full Name</label>
                    <p className="text-white font-medium">{selectedUser.full_name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-1">Role</label>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      selectedUser.role === 'candidate' ? 'bg-purple-500/20 text-purple-400' :
                      selectedUser.role === 'agent' ? 'bg-blue-500/20 text-blue-400' :
                      selectedUser.role === 'observer' ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {selectedUser.role}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-1">Email</label>
                    <p className="text-white">{selectedUser.email}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-1">Phone</label>
                    <p className="text-white">{selectedUser.phone}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-1">ID Number</label>
                    <p className="text-white">{selectedUser.id_number}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-1">Status</label>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      selectedUser.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {selectedUser.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-1">Created</label>
                    <p className="text-white">{new Date(selectedUser.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-1">Last Updated</label>
                    <p className="text-white">{new Date(selectedUser.updated_at).toLocaleString()}</p>
                  </div>
                </div>

                {selectedUser.profile && selectedUser.role === 'candidate' && (
                  <div className="border-t border-dark-700 pt-4 mt-4">
                    <h3 className="text-lg font-semibold text-white mb-3">Candidate Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-dark-400 mb-1">Party</label>
                        <p className="text-white">{selectedUser.profile.party_name}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-dark-400 mb-1">Position</label>
                        <p className="text-white uppercase">{selectedUser.profile.position}</p>
                      </div>
                    </div>
                    {selectedUser.profile.ward_name && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-dark-400 mb-1">Electoral Area</label>
                        <p className="text-white">
                          {selectedUser.profile.ward_name}, {selectedUser.profile.constituency_name}, {selectedUser.profile.county_name}
                        </p>
                      </div>
                    )}
                    {selectedUser.profile.constituency_name && !selectedUser.profile.ward_name && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-dark-400 mb-1">Electoral Area</label>
                        <p className="text-white">
                          {selectedUser.profile.constituency_name}, {selectedUser.profile.county_name}
                        </p>
                      </div>
                    )}
                    {selectedUser.profile.county_name && !selectedUser.profile.constituency_name && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-dark-400 mb-1">Electoral Area</label>
                        <p className="text-white">{selectedUser.profile.county_name}</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedUser.profile && selectedUser.role === 'agent' && (
                  <div className="border-t border-dark-700 pt-4 mt-4">
                    <h3 className="text-lg font-semibold text-white mb-3">Agent Information</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-dark-400 mb-1">Candidate</label>
                        <p className="text-white">{selectedUser.profile.candidate_name || 'Not assigned'}</p>
                      </div>
                      {selectedUser.profile.polling_station_name && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-dark-400 mb-1">Polling Station</label>
                            <p className="text-white">{selectedUser.profile.polling_station_name}</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-dark-400 mb-1">Station Code</label>
                            <p className="text-white">{selectedUser.profile.polling_station_code}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mt-6 pt-4 border-t border-dark-700">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="flex-1 btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Edit User</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={selectedUser.full_name}
                    onChange={(e) => setSelectedUser({ ...selectedUser, full_name: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Email</label>
                  <input
                    type="email"
                    value={selectedUser.email}
                    onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={selectedUser.phone}
                    onChange={(e) => setSelectedUser({ ...selectedUser, phone: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">Status</label>
                  <select
                    value={selectedUser.active ? 'active' : 'inactive'}
                    onChange={(e) => setSelectedUser({ ...selectedUser, active: e.target.value === 'active' })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-sm text-yellow-400">
                    Note: Role and ID number cannot be changed. To modify candidate/agent profile details, please delete and recreate the user.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 mt-6 pt-4 border-t border-dark-700">
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 btn-primary"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-6 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Delete User</h3>
                  <p className="text-sm text-dark-300">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                <p className="text-white mb-2">
                  Are you sure you want to delete <strong>{selectedUser.full_name}</strong>?
                </p>
                <ul className="text-sm text-dark-300 space-y-1">
                  <li>• Role: {selectedUser.role}</li>
                  <li>• Email: {selectedUser.email}</li>
                  <li>• All associated data will be permanently deleted</li>
                </ul>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-medium transition-colors"
                >
                  Delete User
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setSelectedUser(null)
                  }}
                  className="px-6 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Management Modal */}
      {showPaymentModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Manage Payment</h3>
                    <p className="text-sm text-dark-300">{selectedUser.full_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowPaymentModal(false)
                    setPaymentFormData({
                      payment_status: 'pending',
                      payment_amount: '',
                      payment_method: 'M-Pesa',
                      payment_reference: '',
                      payment_notes: '',
                    })
                  }}
                  className="text-dark-300 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Payment Summary */}
              <div className="bg-dark-800/50 rounded-lg p-4 mb-6 border border-dark-700">
                <h4 className="text-sm font-medium text-dark-300 mb-3">Payment Summary</h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-dark-400 mb-1">Expected Amount</p>
                    <p className="text-white font-semibold">KSh {expectedAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-400 mb-1">Total Paid</p>
                    <p className="text-emerald-400 font-semibold">KSh {totalPaid.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-400 mb-1">Balance</p>
                    <p className={`font-semibold ${totalPaid >= expectedAmount ? 'text-emerald-400' : 'text-yellow-400'}`}>
                      KSh {Math.max(0, expectedAmount - totalPaid).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                {expectedAmount > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-dark-400">Progress</span>
                      <span className="text-white">{Math.min(100, Math.round((totalPaid / expectedAmount) * 100))}%</span>
                    </div>
                    <div className="w-full bg-dark-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${totalPaid >= expectedAmount ? 'bg-emerald-500' : 'bg-yellow-500'}`}
                        style={{ width: `${Math.min(100, (totalPaid / expectedAmount) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Status Badge */}
                <div className="mt-3">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    selectedUser.payment_status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                    selectedUser.payment_status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                    selectedUser.payment_status === 'waived' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {selectedUser.payment_status || 'pending'}
                  </span>
                </div>
              </div>

              {/* Error/Success Messages */}
              {paymentError && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {paymentError}
                </div>
              )}

              {paymentSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {paymentSuccess}
                  <button
                    onClick={() => {
                      setShowPaymentModal(false)
                      setPaymentSuccess('')
                      setPaymentFormData({
                        payment_status: 'pending',
                        payment_amount: '',
                        payment_method: 'M-Pesa',
                        payment_reference: '',
                        payment_notes: '',
                      })
                    }}
                    className="mt-3 w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* Set Expected Amount */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-blue-300 mb-2">Set Expected Payment Amount</h4>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={paymentFormData.expected_payment_amount}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, expected_payment_amount: e.target.value })}
                    className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="Expected amount (KSh)"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!paymentFormData.expected_payment_amount) return
                      try {
                        const token = localStorage.getItem('token')
                        const response = await fetch(`/api/admin/users/${selectedUser.id}/payment`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({
                            expected_payment_amount: parseFloat(paymentFormData.expected_payment_amount),
                          }),
                        })
                        const data = await response.json()
                        if (response.ok) {
                          setExpectedAmount(parseFloat(paymentFormData.expected_payment_amount))
                          setPaymentSuccess('Expected amount updated!')
                          fetchUsers()
                        } else {
                          throw new Error(data.error)
                        }
                      } catch (err) {
                        setPaymentError(err instanceof Error ? err.message : 'Failed to update')
                      }
                    }}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors whitespace-nowrap"
                  >
                    Set Amount
                  </button>
                </div>
              </div>

              {/* Add Payment Form */}
              <form onSubmit={async (e) => {
                e.preventDefault()
                setPaymentError('')
                setPaymentSuccess('')
                try {
                  const token = localStorage.getItem('token')
                  const response = await fetch(`/api/admin/users/${selectedUser.id}/payment`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      payment_amount: paymentFormData.payment_amount ? parseFloat(paymentFormData.payment_amount) : null,
                      payment_method: paymentFormData.payment_method,
                      payment_reference: paymentFormData.payment_reference,
                      payment_notes: paymentFormData.payment_notes,
                    }),
                  })

                  const data = await response.json()

                  if (!response.ok) {
                    throw new Error(data.error || 'Failed to add payment')
                  }

                  setPaymentSuccess('Payment added successfully!')
                  setTotalPaid(data.total_paid)
                  setPaymentHistory(data.payment_history || [])
                  setPaymentFormData({
                    ...paymentFormData,
                    payment_amount: '',
                    payment_reference: '',
                    payment_notes: '',
                  })
                  fetchUsers()
                } catch (err) {
                  setPaymentError(err instanceof Error ? err.message : 'Failed to add payment')
                }
              }}>
                <div className="space-y-4">
                  <h4 className="font-medium text-white">Add Payment</h4>

                  {/* Payment Amount */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Amount (KSh)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={paymentFormData.payment_amount}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_amount: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      placeholder="Enter amount"
                    />
                  </div>

                  {/* Payment Method */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Payment Method
                    </label>
                    <select
                      value={paymentFormData.payment_method}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_method: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="M-Pesa">M-Pesa</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cash">Cash</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Payment Reference */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Payment Reference
                    </label>
                    <input
                      type="text"
                      value={paymentFormData.payment_reference}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_reference: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      placeholder="M-Pesa code, transaction ID, etc."
                    />
                  </div>

                  {/* Payment Notes */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={paymentFormData.payment_notes}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_notes: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      rows={3}
                      placeholder="Additional notes about this payment..."
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-medium transition-colors mt-4"
                >
                  Add Payment
                </button>
              </form>

              {/* Payment History */}
              <div className="mt-6 pt-6 border-t border-dark-700">
                <h4 className="text-sm font-medium text-dark-300 mb-3">Payment History ({paymentHistory.length})</h4>
                {paymentHistory.length === 0 ? (
                  <p className="text-dark-400 text-sm text-center py-4">No payments recorded yet</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {paymentHistory.map((payment: any) => (
                      <div key={payment.id} className="bg-dark-800/50 rounded-lg p-4 border border-dark-700">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-emerald-400 font-semibold text-lg">KSh {parseFloat(payment.amount).toLocaleString()}</p>
                            <p className="text-xs text-dark-400 mt-1">{new Date(payment.payment_date).toLocaleString()}</p>
                          </div>
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                            {payment.payment_method || 'N/A'}
                          </span>
                        </div>
                        {payment.payment_reference && (
                          <p className="text-sm text-dark-300 mt-2">
                            <span className="text-dark-400">Ref:</span> {payment.payment_reference}
                          </p>
                        )}
                        {payment.notes && (
                          <p className="text-sm text-dark-300 mt-1">
                            <span className="text-dark-400">Notes:</span> {payment.notes}
                          </p>
                        )}
                        {payment.recorded_by_name && (
                          <p className="text-xs text-dark-500 mt-2">
                            Recorded by: {payment.recorded_by_name}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
