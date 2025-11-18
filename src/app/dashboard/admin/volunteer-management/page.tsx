'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'

interface Volunteer {
  id: number
  full_name: string
  email: string
  phone: string
  id_number: string
  county_id?: number
  constituency_id?: number
  ward_id?: number
  polling_station_id?: number
  status: 'pending' | 'approved' | 'rejected' | 'assigned'
  notes?: string
  created_at: string
  updated_at: string
  county_name?: string
  constituency_name?: string
  ward_name?: string
  polling_station_name?: string
  polling_station_code?: string
}

export default function VolunteerManagement() {
  const router = useRouter()
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedVolunteer, setSelectedVolunteer] = useState<Volunteer | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedVolunteers, setSelectedVolunteers] = useState<number[]>([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [showBulkNotesModal, setShowBulkNotesModal] = useState(false)
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'reject' | 'delete' | null>(null)
  const [bulkNotes, setBulkNotes] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [volunteerToDelete, setVolunteerToDelete] = useState<Volunteer | null>(null)

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

    fetchVolunteers()
  }, [router, filterStatus])

  const fetchVolunteers = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const url = filterStatus === 'all'
        ? '/api/admin/volunteers'
        : `/api/admin/volunteers?status=${filterStatus}`

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setVolunteers(data.volunteers || [])
      }
    } catch (error) {
      console.error('Failed to fetch volunteers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusUpdate = async (volunteerId: number, status: string, notes?: string) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/admin/volunteers/${volunteerId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status, notes }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update status')
      }

      setSuccess(`Volunteer ${status} successfully`)
      fetchVolunteers()
    } catch (err: any) {
      setError(err.message || 'Failed to update status')
    }
  }

  const filteredVolunteers = volunteers.filter(volunteer =>
    volunteer.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    volunteer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    volunteer.phone.includes(searchTerm) ||
    volunteer.id_number.includes(searchTerm)
  )

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-500/20 text-yellow-400', label: 'Pending' },
      approved: { color: 'bg-blue-500/20 text-blue-400', label: 'Approved' },
      rejected: { color: 'bg-red-500/20 text-red-400', label: 'Rejected' },
      assigned: { color: 'bg-green-500/20 text-green-400', label: 'Assigned' },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const getLocationText = (volunteer: Volunteer) => {
    if (volunteer.polling_station_name) {
      return `${volunteer.polling_station_name} (${volunteer.polling_station_code})`
    }
    if (volunteer.ward_name) {
      return volunteer.ward_name
    }
    if (volunteer.constituency_name) {
      return volunteer.constituency_name
    }
    if (volunteer.county_name) {
      return volunteer.county_name
    }
    return 'Not specified'
  }

  const handleSelectVolunteer = (volunteerId: number) => {
    setSelectedVolunteers(prev =>
      prev.includes(volunteerId)
        ? prev.filter(id => id !== volunteerId)
        : [...prev, volunteerId]
    )
  }

  const handleSelectAll = () => {
    if (selectedVolunteers.length === filteredVolunteers.length) {
      setSelectedVolunteers([])
    } else {
      setSelectedVolunteers(filteredVolunteers.map(v => v.id))
    }
  }

  const handleBulkAction = async (action: 'approve' | 'reject' | 'delete') => {
    if (selectedVolunteers.length === 0) return
    
    if (action === 'delete') {
      setBulkActionType('delete')
      setShowBulkNotesModal(true)
    } else {
      setBulkActionType(action)
      setShowBulkNotesModal(true)
    }
  }

  const handleDeleteVolunteer = (volunteer: Volunteer) => {
    setVolunteerToDelete(volunteer)
    setShowDeleteModal(true)
  }

  const confirmBulkAction = async () => {
    if (!bulkActionType || selectedVolunteers.length === 0) return

    setBulkActionLoading(true)
    try {
      const token = localStorage.getItem('token')
      
      if (bulkActionType === 'delete') {
        const response = await fetch('/api/admin/volunteers/bulk-delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            volunteer_ids: selectedVolunteers
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to perform bulk delete')
        }

        setSuccess(`Successfully deleted ${selectedVolunteers.length} volunteer(s)`)
      } else {
        const response = await fetch('/api/admin/volunteers/bulk-update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            volunteer_ids: selectedVolunteers,
            status: bulkActionType === 'approve' ? 'approved' : 'rejected',
            notes: bulkNotes
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to perform bulk action')
        }

        setSuccess(`Successfully ${bulkActionType}d ${selectedVolunteers.length} volunteer(s)`)
      }

      setSelectedVolunteers([])
      setBulkNotes('')
      setShowBulkNotesModal(false)
      setBulkActionType(null)
      fetchVolunteers()
    } catch (err: any) {
      setError(err.message || 'Failed to perform bulk action')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const confirmDeleteVolunteer = async () => {
    if (!volunteerToDelete) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/admin/volunteers/${volunteerToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete volunteer')
      }

      setSuccess(`Volunteer "${volunteerToDelete.full_name}" deleted successfully`)
      setShowDeleteModal(false)
      setVolunteerToDelete(null)
      fetchVolunteers()
    } catch (err: any) {
      setError(err.message || 'Failed to delete volunteer')
    }
  }

  const clearSelection = () => {
    setSelectedVolunteers([])
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Presidential Results Volunteers</h1>
          <p className="text-dark-300">Manage volunteer registrations specifically for presidential election results monitoring</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="glass-effect rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-300 text-sm">Total Volunteers</p>
                <p className="text-2xl font-bold text-white">{volunteers.length}</p>
              </div>
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="glass-effect rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-300 text-sm">Pending Review</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {volunteers.filter(v => v.status === 'pending').length}
                </p>
              </div>
              <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="glass-effect rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-300 text-sm">Approved</p>
                <p className="text-2xl font-bold text-blue-400">
                  {volunteers.filter(v => v.status === 'approved').length}
                </p>
              </div>
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-4">
            {success}
          </div>
        )}

        {/* Filters and Search */}
        <div className="glass-effect rounded-xl p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search volunteers by name, email, phone, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              {['all', 'pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterStatus === status
                      ? 'bg-blue-500 text-white'
                      : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
  
        {/* Bulk Actions Bar */}
        {selectedVolunteers.length > 0 && (
          <div className="glass-effect rounded-xl p-4 mb-6 border-2 border-blue-500/50">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-medium">{selectedVolunteers.length} volunteer(s) selected</p>
                  <p className="text-dark-300 text-sm">Choose an action to perform on all selected volunteers</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={clearSelection}
                  className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Clear Selection
                </button>
                <button
                  onClick={() => handleBulkAction('approve')}
                  disabled={bulkActionLoading}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkActionLoading ? 'Processing...' : 'Approve Selected'}
                </button>
                <button
                  onClick={() => handleBulkAction('reject')}
                  disabled={bulkActionLoading}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkActionLoading ? 'Processing...' : 'Reject Selected'}
                </button>
                <button
                  onClick={() => handleBulkAction('delete')}
                  disabled={bulkActionLoading}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkActionLoading ? 'Processing...' : 'Delete Selected'}
                </button>
              </div>
            </div>
          </div>
        )}
  
        {/* Volunteers Table */}
        <div className="glass-effect rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-800/50 border-b border-dark-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedVolunteers.length > 0 && selectedVolunteers.length === filteredVolunteers.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-blue-600 bg-dark-700 border-dark-600 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      Volunteer
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Contact</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Location</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Registered</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-dark-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-dark-400">
                      Loading volunteers...
                    </td>
                  </tr>
                ) : filteredVolunteers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-dark-400">
                      No volunteers found
                    </td>
                  </tr>
                ) : (
                  filteredVolunteers.map((volunteer) => (
                    <tr key={volunteer.id} className="hover:bg-dark-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedVolunteers.includes(volunteer.id)}
                            onChange={() => handleSelectVolunteer(volunteer.id)}
                            className="w-4 h-4 text-blue-600 bg-dark-700 border-dark-600 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <div>
                            <p className="text-white font-medium">{volunteer.full_name}</p>
                            <p className="text-dark-400 text-sm">ID: {volunteer.id_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-dark-300">{volunteer.email}</p>
                          <p className="text-dark-400 text-sm">{volunteer.phone}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-dark-300 text-sm">{getLocationText(volunteer)}</p>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(volunteer.status)}
                      </td>
                      <td className="px-6 py-4 text-dark-300 text-sm">
                        {new Date(volunteer.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {/* View Details */}
                          <button
                            onClick={() => {
                              setSelectedVolunteer(volunteer)
                              setShowDetailsModal(true)
                            }}
                            className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>

                          {/* Quick Actions */}
                          {volunteer.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleStatusUpdate(volunteer.id, 'approved')}
                                className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors"
                                title="Approve"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(volunteer.id, 'rejected')}
                                className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                                title="Reject"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </>
                          )}

                          {/* Delete Action - Available for all volunteers except assigned ones */}
                          {volunteer.status !== 'assigned' && (
                            <button
                              onClick={() => handleDeleteVolunteer(volunteer)}
                              className="p-2 hover:bg-orange-500/20 text-orange-400 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Volunteer Details Modal */}
      {showDetailsModal && selectedVolunteer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Volunteer Details</h2>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Personal Information */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Personal Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-400 mb-1">Full Name</label>
                      <p className="text-white">{selectedVolunteer.full_name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-400 mb-1">ID Number</label>
                      <p className="text-white">{selectedVolunteer.id_number}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-400 mb-1">Email</label>
                      <p className="text-white">{selectedVolunteer.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-400 mb-1">Phone</label>
                      <p className="text-white">{selectedVolunteer.phone}</p>
                    </div>
                  </div>
                </div>

                {/* Location Preference */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Location Preference</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedVolunteer.county_name && (
                      <div>
                        <label className="block text-sm font-medium text-dark-400 mb-1">County</label>
                        <p className="text-white">{selectedVolunteer.county_name}</p>
                      </div>
                    )}
                    {selectedVolunteer.constituency_name && (
                      <div>
                        <label className="block text-sm font-medium text-dark-400 mb-1">Constituency</label>
                        <p className="text-white">{selectedVolunteer.constituency_name}</p>
                      </div>
                    )}
                    {selectedVolunteer.ward_name && (
                      <div>
                        <label className="block text-sm font-medium text-dark-400 mb-1">Ward</label>
                        <p className="text-white">{selectedVolunteer.ward_name}</p>
                      </div>
                    )}
                    {selectedVolunteer.polling_station_name && (
                      <div>
                        <label className="block text-sm font-medium text-dark-400 mb-1">Polling Station</label>
                        <p className="text-white">
                          {selectedVolunteer.polling_station_name} ({selectedVolunteer.polling_station_code})
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status & Timeline */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Status & Timeline</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-400 mb-1">Status</label>
                      {getStatusBadge(selectedVolunteer.status)}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-400 mb-1">Registered</label>
                      <p className="text-white">{new Date(selectedVolunteer.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-400 mb-1">Last Updated</label>
                      <p className="text-white">{new Date(selectedVolunteer.updated_at).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {selectedVolunteer.notes && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Notes</h3>
                    <div className="bg-dark-800/50 rounded-lg p-4">
                      <p className="text-dark-300">{selectedVolunteer.notes}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mt-6 pt-4 border-t border-dark-700">
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="flex-1 btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Notes Modal */}
      {showBulkNotesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">
                  {bulkActionType === 'approve' ? 'Approve Volunteers' :
                   bulkActionType === 'reject' ? 'Reject Volunteers' : 'Delete Volunteers'}
                </h2>
                <button
                  onClick={() => {
                    setShowBulkNotesModal(false)
                    setBulkActionType(null)
                    setBulkNotes('')
                  }}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-white mb-2">
                    You are about to {bulkActionType} {selectedVolunteers.length} volunteer(s).
                    This action cannot be undone.
                  </p>
                  <p className="text-dark-300 text-sm mb-4">
                    {bulkActionType === 'approve'
                      ? 'Approved volunteers will receive observer accounts and be assigned to their preferred polling stations.'
                      : bulkActionType === 'reject'
                      ? 'Rejected volunteers will be removed from the pending list.'
                      : 'Deleted volunteers will be permanently removed from the system. This action cannot be undone.'
                    }
                  </p>
                </div>

                {bulkActionType !== 'delete' && (
                  <div>
                    <label className="block text-sm font-medium text-dark-400 mb-2">
                      Optional Notes (will be added to all selected volunteers)
                    </label>
                    <textarea
                      value={bulkNotes}
                      onChange={(e) => setBulkNotes(e.target.value)}
                      placeholder="Add any notes about this bulk action..."
                      rows={4}
                      className="w-full px-4 py-2 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-4 mt-6 pt-4 border-t border-dark-700">
                <button
                  onClick={() => {
                    setShowBulkNotesModal(false)
                    setBulkActionType(null)
                    setBulkNotes('')
                  }}
                  className="flex-1 btn-secondary"
                  disabled={bulkActionLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkAction}
                  disabled={bulkActionLoading}
                  className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                    bulkActionType === 'approve'
                      ? 'bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50'
                      : bulkActionType === 'reject'
                      ? 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/50'
                      : 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50'
                  } disabled:cursor-not-allowed`}
                >
                  {bulkActionLoading ? 'Processing...' :
                   `Confirm ${bulkActionType === 'approve' ? 'Approve' :
                           bulkActionType === 'reject' ? 'Reject' : 'Delete'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Individual Delete Confirmation Modal */}
      {showDeleteModal && volunteerToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Delete Volunteer</h2>
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setVolunteerToDelete(null)
                  }}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-white mb-2">
                    Are you sure you want to delete volunteer <strong>{volunteerToDelete.full_name}</strong>?
                  </p>
                  <p className="text-dark-300 text-sm">
                    This action cannot be undone. The volunteer will be permanently removed from the system.
                  </p>
                </div>

                <div className="bg-dark-800/50 rounded-lg p-4">
                  <p className="text-dark-300 text-sm">
                    <strong>Email:</strong> {volunteerToDelete.email}<br />
                    <strong>Phone:</strong> {volunteerToDelete.phone}<br />
                    <strong>ID Number:</strong> {volunteerToDelete.id_number}<br />
                    <strong>Status:</strong> {volunteerToDelete.status}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 mt-6 pt-4 border-t border-dark-700">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setVolunteerToDelete(null)
                  }}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteVolunteer}
                  className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}