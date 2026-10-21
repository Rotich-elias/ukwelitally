'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Searchable polling station picker.
 *
 * The candidate's own race decides the scope: a member of county assembly
 * sees the stations of their ward, a member of parliament the stations of
 * their constituency, a county level candidate the stations of their county
 * and a presidential candidate every station in the country. The scope is
 * applied on the server, so the list can never show a station the candidate
 * is not allowed to assign.
 */

interface Station {
  id: number
  name: string
  code: string
  registered_voters: number
  ward_name: string
  constituency_name: string
  county_name: string
}

interface Scope {
  position: string
  level: 'ward' | 'constituency' | 'county' | 'national'
  label: string
  national: boolean
}

interface PollingStationPickerProps {
  value?: number | null
  onChange: (pollingStationId: number | null, station: Station | null) => void
  /** Small hint shown under the field. */
  hint?: string
}

const LEVEL_HINT: Record<string, string> = {
  ward: 'Polling stations in your ward',
  constituency: 'Polling stations in your constituency',
  county: 'Polling stations in your county',
  national: 'Polling stations across the country',
}

export default function PollingStationPicker({
  value,
  onChange,
  hint,
}: PollingStationPickerProps) {
  const [stations, setStations] = useState<Station[]>([])
  const [scope, setScope] = useState<Scope | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Station | null>(null)
  const [filters, setFilters] = useState({ county_id: '', constituency_id: '', ward_id: '' })
  const [countyOptions, setCountyOptions] = useState<Array<{ id: number; name: string }>>([])
  const [constituencyOptions, setConstituencyOptions] = useState<
    Array<{ id: number; name: string; county_id: number }>
  >([])
  const [wardOptions, setWardOptions] = useState<Array<{ id: number; name: string; constituency_id: number }>>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadStations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (filters.county_id) params.set('county_id', filters.county_id)
      if (filters.constituency_id) params.set('constituency_id', filters.constituency_id)
      if (filters.ward_id) params.set('ward_id', filters.ward_id)
      params.set('limit', '200')

      const response = await fetch(`/api/candidates/stations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || 'Could not load the polling stations')
        return
      }
      const data = await response.json()
      setStations(data.stations || [])
      setScope(data.scope || null)
    } catch (err) {
      console.error('Failed to load the polling stations:', err)
      setError('Could not load the polling stations')
    } finally {
      setLoading(false)
    }
  }, [search, filters.county_id, filters.constituency_id, filters.ward_id])

  // The search is debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(loadStations, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [loadStations])

  // A presidential candidate filters a long list by county, constituency
  // and ward.
  useEffect(() => {
    if (!scope?.national) return
    const token = localStorage.getItem('token')
    if (!token) return

    fetch('/api/locations/counties', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((data) => setCountyOptions(data.data || []))
      .catch(() => setCountyOptions([]))
  }, [scope?.national])

  useEffect(() => {
    if (!scope?.national || !filters.county_id) {
      setConstituencyOptions([])
      return
    }
    const token = localStorage.getItem('token')
    if (!token) return

    fetch(`/api/locations/constituencies?county_id=${filters.county_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((data) => setConstituencyOptions(data.data || []))
      .catch(() => setConstituencyOptions([]))
  }, [scope?.national, filters.county_id])

  useEffect(() => {
    if (!scope?.national || !filters.constituency_id) {
      setWardOptions([])
      return
    }
    const token = localStorage.getItem('token')
    if (!token) return

    fetch(`/api/locations/wards?constituency_id=${filters.constituency_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((data) => setWardOptions(data.data || []))
      .catch(() => setWardOptions([]))
  }, [scope?.national, filters.constituency_id])

  const scopeHint = useMemo(() => {
    if (hint) return hint
    if (!scope) return 'Loading your polling stations...'
    return LEVEL_HINT[scope.level] || 'Polling stations in your electoral area'
  }, [hint, scope])

  const handleSelect = (station: Station) => {
    setSelected(station)
    onChange(station.id, station)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-dark-200">
          Polling Station
        </label>
        {scope && (
          <span className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
            {scope.label}
          </span>
        )}
      </div>

      <p className="text-xs text-dark-400">{scopeHint}</p>

      {scope?.national && (
        <div className="grid sm:grid-cols-3 gap-2">
          <select
            value={filters.county_id}
            onChange={(e) =>
              setFilters({
                county_id: e.target.value,
                constituency_id: '',
                ward_id: '',
              })
            }
            className="px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
          >
            <option value="">All counties</option>
            {countyOptions.map((county) => (
              <option key={county.id} value={county.id}>
                {county.name}
              </option>
            ))}
          </select>
          <select
            value={filters.constituency_id}
            onChange={(e) =>
              setFilters({ ...filters, constituency_id: e.target.value, ward_id: '' })
            }
            disabled={!filters.county_id}
            className="px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm disabled:opacity-50"
          >
            <option value="">All constituencies</option>
            {constituencyOptions.map((constituency) => (
              <option key={constituency.id} value={constituency.id}>
                {constituency.name}
              </option>
            ))}
          </select>
          <select
            value={filters.ward_id}
            onChange={(e) => setFilters({ ...filters, ward_id: e.target.value })}
            disabled={!filters.constituency_id}
            className="px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm disabled:opacity-50"
          >
            <option value="">All wards</option>
            {wardOptions.map((ward) => (
              <option key={ward.id} value={ward.id}>
                {ward.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by station name or code"
        className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500"
      />

      {selected && (
        <div className="flex items-center justify-between gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{selected.name}</p>
            <p className="text-xs text-dark-300 truncate">
              {selected.code} · {selected.ward_name} · {selected.constituency_name} ·{' '}
              {selected.county_name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected(null)
              onChange(null, null)
            }}
            className="text-xs text-blue-300 hover:text-blue-200 flex-shrink-0"
          >
            Change
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!selected && (
        <div className="border border-dark-700 rounded-lg overflow-hidden">
          {loading ? (
            <div className="px-4 py-6 text-center">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              <p className="text-xs text-dark-400 mt-2">Loading polling stations...</p>
            </div>
          ) : stations.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-dark-300">No polling stations found</p>
              <p className="text-xs text-dark-500 mt-1">
                {scope?.national
                  ? 'Try a different search or filter.'
                  : 'There are no polling stations in your electoral area yet.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-dark-700 max-h-64 overflow-y-auto">
              {stations.map((station) => (
                <li key={station.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(station)}
                    className="w-full text-left px-4 py-3 hover:bg-dark-800/60 transition-colors"
                  >
                    <p className="text-sm text-white truncate">{station.name}</p>
                    <p className="text-xs text-dark-400 truncate">
                      {station.code} · {station.ward_name} · {station.constituency_name} ·{' '}
                      {station.county_name}
                      {station.registered_voters
                        ? ` · ${Number(station.registered_voters).toLocaleString()} voters`
                        : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {value && !selected && (
        <p className="text-xs text-dark-500">A polling station is selected (id {value}).</p>
      )}
    </div>
  )
}
