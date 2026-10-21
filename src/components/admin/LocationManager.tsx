'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Administration of the electoral geography.
 *
 * The wards and the polling stations are reference data the platform
 * administrator maintains. This screen lists them, lets a ward or a station
 * be edited, and loads an official IEBC file in bulk.
 */

interface Ward {
  id: number
  code: string
  name: string
  constituency_id: number
  county_id: number
  registered_voters: number
  constituency_name?: string
  county_name?: string
  station_count?: number
}

interface Station {
  id: number
  code: string
  name: string
  ward_id: number
  constituency_id: number
  county_id: number
  latitude: number | null
  longitude: number | null
  registered_voters: number
  location_radius: number
  ward_name?: string
  constituency_name?: string
  county_name?: string
  submission_count?: number
}

interface County {
  id: number
  name: string
}
interface Constituency {
  id: number
  name: string
  county_id: number
}
interface WardOption {
  id: number
  name: string
  constituency_id: number
}

type Tab = 'wards' | 'stations' | 'import'

const EMPTY_FORM = {
  code: '',
  name: '',
  constituency_id: '',
  ward_id: '',
  latitude: '',
  longitude: '',
  registered_voters: '',
  location_radius: '500',
}

export default function LocationManager() {
  const [tab, setTab] = useState<Tab>('wards')
  const [wards, setWards] = useState<Ward[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [counties, setCounties] = useState<County[]>([])
  const [constituencies, setConstituencies] = useState<Constituency[]>([])
  const [wardOptions, setWardOptions] = useState<WardOption[]>([])

  const [countyId, setCountyId] = useState('')
  const [constituencyId, setConstituencyId] = useState('')
  const [wardId, setWardId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editing, setEditing] = useState<Ward | Station | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const [importType, setImportType] = useState('wards')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [importing, setImporting] = useState(false)

  const token = () => localStorage.getItem('token') || ''

  const loadLocations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (countyId) params.set('county_id', countyId)
      if (constituencyId) params.set('constituency_id', constituencyId)
      if (wardId) params.set('ward_id', wardId)
      if (search.trim()) params.set('search', search.trim())
      params.set('limit', '300')

      const [wardResponse, stationResponse] = await Promise.all([
        fetch(`/api/admin/locations/wards?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        fetch(`/api/admin/locations/polling-stations?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
      ])

      if (wardResponse.ok) {
        const body = await wardResponse.json()
        setWards(body.wards || [])
      } else {
        const body = await wardResponse.json().catch(() => ({}))
        setError(body.error || 'Could not load the wards')
      }

      if (stationResponse.ok) {
        const body = await stationResponse.json()
        setStations(body.stations || [])
      }
    } catch (err) {
      console.error('Failed to load the locations:', err)
      setError('Could not load the locations')
    } finally {
      setLoading(false)
    }
  }, [countyId, constituencyId, wardId, search])

  useEffect(() => {
    const t = token()
    if (!t) return
    fetch('/api/locations/counties', { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setCounties(d.data || []))
      .catch(() => setCounties([]))
  }, [])

  useEffect(() => {
    const t = token()
    if (!t || !countyId) {
      setConstituencies([])
      return
    }
    fetch(`/api/locations/constituencies?county_id=${countyId}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setConstituencies(d.data || []))
      .catch(() => setConstituencies([]))
  }, [countyId])

  useEffect(() => {
    const t = token()
    if (!t || !constituencyId) {
      setWardOptions([])
      return
    }
    fetch(`/api/locations/wards?constituency_id=${constituencyId}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setWardOptions(d.data || []))
      .catch(() => setWardOptions([]))
  }, [constituencyId])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  const openCreate = (kind: 'ward' | 'station') => {
    setEditing({ id: 0 } as any)
    setForm({
      ...EMPTY_FORM,
      constituency_id: constituencyId || '',
      ward_id: wardId || '',
    })
    setError(null)
    setNotice(null)
  }

  const openEdit = (record: Ward | Station) => {
    setEditing(record)
    setForm({
      code: record.code,
      name: record.name,
      constituency_id: String((record as Ward).constituency_id ?? ''),
      ward_id: String((record as Station).ward_id ?? ''),
      latitude: (record as Station).latitude?.toString() ?? '',
      longitude: (record as Station).longitude?.toString() ?? '',
      registered_voters: String(record.registered_voters ?? 0),
      location_radius: String((record as Station).location_radius ?? 500),
    })
    setError(null)
    setNotice(null)
  }

  const isStation = (record: Ward | Station) => 'ward_id' in record

  const save = async () => {
    if (!editing) return
    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const station = isStation(editing)
      const url = station
        ? `/api/admin/locations/polling-stations/${editing.id || ''}`.replace(/\/$/, '')
        : `/api/admin/locations/wards/${editing.id || ''}`.replace(/\/$/, '')

      const payload = station
        ? {
            code: form.code,
            name: form.name,
            ward_id: parseInt(form.ward_id),
            latitude: form.latitude === '' ? null : parseFloat(form.latitude),
            longitude: form.longitude === '' ? null : parseFloat(form.longitude),
            registered_voters: parseInt(form.registered_voters || '0'),
            location_radius: parseInt(form.location_radius || '500'),
          }
        : {
            code: form.code,
            name: form.name,
            constituency_id: parseInt(form.constituency_id),
            registered_voters: parseInt(form.registered_voters || '0'),
          }

      const response = await fetch(url, {
        method: editing.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(payload),
      })

      const body = await response.json()
      if (!response.ok) {
        throw new Error(body.error || 'Could not save the record')
      }

      setNotice(body.message || 'Saved')
      setEditing(null)
      await loadLocations()
    } catch (err: any) {
      setError(err.message || 'Could not save the record')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (record: Ward | Station) => {
    const station = isStation(record)
    const label = station ? 'polling station' : 'ward'
    if (!window.confirm(`Delete this ${label}?`)) return

    setError(null)
    setNotice(null)
    try {
      const url = station
        ? `/api/admin/locations/polling-stations/${record.id}`
        : `/api/admin/locations/wards/${record.id}`

      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(body.error || 'Could not delete the record')
      }
      setNotice(body.message || 'Deleted')
      await loadLocations()
    } catch (err: any) {
      setError(err.message || 'Could not delete the record')
    }
  }

  const runImport = async (dryRun: boolean) => {
    if (importType !== 'prune_placeholders' && !importFile) {
      setError('Choose a CSV file first')
      return
    }

    setImporting(true)
    setError(null)
    setNotice(null)
    try {
      const form = new FormData()
      form.append('type', importType)
      form.append('dry_run', dryRun ? 'true' : 'false')
      if (importFile) form.append('file', importFile)

      const response = await fetch('/api/admin/locations/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: form,
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(body.error || 'The import failed')
      }

      setImportResult(body)
      if (!dryRun) {
        setNotice(body.message || 'Import finished')
        await loadLocations()
      }
    } catch (err: any) {
      setError(err.message || 'The import failed')
    } finally {
      setImporting(false)
    }
  }

  const filteredConstituencies = useMemo(
    () =>
      countyId
        ? constituencies.filter((c) => String(c.county_id) === countyId)
        : constituencies,
    [constituencies, countyId]
  )

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-dark-700">
        {(
          [
            ['wards', 'Wards'],
            ['stations', 'Polling Stations'],
            ['import', 'Import'],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-5 py-3 font-medium transition-colors relative ${
              tab === value
                ? 'text-blue-400'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {label}
            {tab === value && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm">
          {notice}
        </div>
      )}

      {tab === 'import' ? (
        <div className="glass-effect rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Bulk import</h3>
            <p className="text-sm text-dark-300">
              Load the official IEBC files. A ward is matched by its code, or by
              its name inside its constituency, and a polling station by its
              code, so running the import again updates the existing records
              instead of duplicating them.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-200 mb-2">
                What to import
              </label>
              <select
                value={importType}
                onChange={(e) => {
                  setImportType(e.target.value)
                  setImportResult(null)
                }}
                className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white"
              >
                <option value="wards">Wards (WARDS.csv)</option>
                <option value="polling_stations">Polling stations (POLLING_STATIONS.csv)</option>
                <option value="prune_placeholders">Remove the placeholder wards</option>
              </select>
            </div>

            {importType !== 'prune_placeholders' && (
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-2">CSV file</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] || null)
                    setImportResult(null)
                  }}
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700 rounded-lg text-white text-sm"
                />
              </div>
            )}
          </div>

          {importType === 'prune_placeholders' && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-sm text-yellow-300">
                This removes the wards the geography seeder generated
                (&quot;Constituency Ward 1&quot;, &quot;Ward 2&quot; …) once the real
                IEBC wards have been imported. A placeholder ward that still has
                polling stations or an agent attached to it is kept.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => runImport(true)}
              disabled={importing}
              className="btn-secondary text-sm py-2 disabled:opacity-50"
            >
              {importing ? 'Working...' : 'Preview'}
            </button>
            <button
              onClick={() => runImport(false)}
              disabled={importing}
              className="btn-primary text-sm py-2 disabled:opacity-50"
            >
              {importing ? 'Working...' : 'Run import'}
            </button>
          </div>

          {importResult && (
            <div className="bg-dark-900/50 border border-dark-700 rounded-lg p-4 text-sm">
              <p className="text-white font-medium mb-2">{importResult.message}</p>
              {importResult.dry_run && (
                <p className="text-dark-300 mb-2">Nothing was written yet.</p>
              )}
              {importResult.rows !== undefined && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {(
                    [
                      ['Rows read', importResult.total_rows],
                      ['To create', importResult.create],
                      ['To update', importResult.update],
                      ['To skip', importResult.skip],
                      ['With errors', importResult.error_rows],
                    ] as Array<[string, number]>
                  ).map(([label, value]) => (
                    <div key={label} className="bg-dark-800/50 rounded px-3 py-2">
                      <p className="text-xs text-dark-400">{label}</p>
                      <p className="text-white font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              )}
              {importResult.created !== undefined && (
                <p className="text-dark-300">
                  Created: {importResult.created} · Updated: {importResult.updated} · Skipped:{' '}
                  {importResult.skipped}
                </p>
              )}
              {importResult.removed !== undefined && (
                <p className="text-dark-300">
                  Placeholder wards removed: {importResult.removed}
                  {importResult.kept?.length ? ` · kept ${importResult.kept.length}` : ''}
                </p>
              )}
              {importResult.rows?.length > 0 && (
                <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                  {importResult.rows
                    .filter((row: any) => row.issues?.length > 0)
                    .slice(0, 50)
                    .map((row: any) => (
                      <div key={row.row} className="border-l-2 border-dark-600 pl-2">
                        <p className="text-xs text-dark-400">
                          Row {row.row}
                          {row.code ? ` · ${row.code}` : ''}
                          {row.name ? ` · ${row.name}` : ''}
                          {` · ${row.action}`}
                        </p>
                        {row.issues.map((issue: any, i: number) => (
                          <p
                            key={i}
                            className={`text-xs ${
                              issue.severity === 'error' ? 'text-red-300' : 'text-yellow-300'
                            }`}
                          >
                            {issue.message}
                          </p>
                        ))}
                      </div>
                    ))}
                </div>
              )}
              {importResult.errors?.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {importResult.errors.slice(0, 50).map((e: any, i: number) => (
                    <p key={i} className="text-red-300 text-xs">
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="glass-effect rounded-xl p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <select
                value={countyId}
                onChange={(e) => {
                  setCountyId(e.target.value)
                  setConstituencyId('')
                  setWardId('')
                }}
                className="px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
              >
                <option value="">All counties</option>
                {counties.map((county) => (
                  <option key={county.id} value={county.id}>
                    {county.name}
                  </option>
                ))}
              </select>

              <select
                value={constituencyId}
                onChange={(e) => {
                  setConstituencyId(e.target.value)
                  setWardId('')
                }}
                disabled={!countyId}
                className="px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm disabled:opacity-50"
              >
                <option value="">All constituencies</option>
                {filteredConstituencies.map((constituency) => (
                  <option key={constituency.id} value={constituency.id}>
                    {constituency.name}
                  </option>
                ))}
              </select>

              {tab === 'stations' && (
                <select
                  value={wardId}
                  onChange={(e) => setWardId(e.target.value)}
                  disabled={!constituencyId}
                  className="px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm disabled:opacity-50"
                >
                  <option value="">All wards</option>
                  {wardOptions.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {ward.name}
                    </option>
                  ))}
                </select>
              )}

              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or code"
                className="px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
              />

              <button
                onClick={() => {
                  const isStation = tab === 'stations'
                  if (isStation) openCreate('station')
                  else openCreate('ward')
                }}
                className="btn-primary text-sm py-2"
              >
                + Add {tab === 'stations' ? 'polling station' : 'ward'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="glass-effect rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-dark-800/50 border-b border-dark-700">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      {tab === 'stations' ? 'Station' : 'Ward'}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      Code
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      Area
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      Voters
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      {tab === 'stations' ? 'Submissions' : 'Stations'}
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-dark-300 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-dark-400">
                        Loading...
                      </td>
                    </tr>
                  ) : (tab === 'stations' ? stations : wards).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-dark-400">
                        Nothing found for these filters.
                      </td>
                    </tr>
                  ) : (
                    (tab === 'stations' ? (stations as Station[]) : (wards as Ward[])).map(
                      (record) => (
                        <tr key={record.id} className="hover:bg-dark-800/40">
                          <td className="px-5 py-3 text-sm text-white">{record.name}</td>
                          <td className="px-5 py-3 text-sm font-mono text-dark-300">
                            {record.code}
                          </td>
                          <td className="px-5 py-3 text-sm text-dark-300">
                            {tab === 'stations'
                              ? `${(record as Station).ward_name} · ${(record as Station).constituency_name}`
                              : `${(record as Ward).constituency_name} · ${(record as Ward).county_name}`}
                          </td>
                          <td className="px-5 py-3 text-sm text-dark-300">
                            {Number(record.registered_voters || 0).toLocaleString()}
                          </td>
                          <td className="px-5 py-3 text-sm text-dark-300">
                            {tab === 'stations'
                              ? Number((record as Station).submission_count || 0)
                              : Number((record as Ward).station_count || 0)}
                          </td>
                          <td className="px-5 py-3 text-right space-x-2">
                            <button
                              onClick={() => openEdit(record)}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => remove(record)}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-effect rounded-xl max-w-lg w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                {editing.id
                  ? `Edit ${isStation(editing) ? 'polling station' : 'ward'}`
                  : `Add ${isStation(editing) ? 'polling station' : 'ward'}`}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Code</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                  />
                </div>

                {isStation(editing) ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-dark-200 mb-1">
                        Ward
                      </label>
                      <select
                        value={form.ward_id}
                        onChange={(e) => setForm({ ...form, ward_id: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                      >
                        <option value="">Select a ward</option>
                        {wardOptions.map((ward) => (
                          <option key={ward.id} value={ward.id}>
                            {ward.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-dark-500 mt-1">
                        Pick a county and a constituency first to fill the list.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-dark-200 mb-1">
                          Latitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={form.latitude}
                          onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                          className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-dark-200 mb-1">
                          Longitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={form.longitude}
                          onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                          className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-dark-200 mb-1">
                          Radius (m)
                        </label>
                        <input
                          type="number"
                          value={form.location_radius}
                          onChange={(e) =>
                            setForm({ ...form, location_radius: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">
                      Constituency
                    </label>
                    <select
                      value={form.constituency_id}
                      onChange={(e) => setForm({ ...form, constituency_id: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                    >
                      <option value="">Select a constituency</option>
                      {filteredConstituencies.map((constituency) => (
                        <option key={constituency.id} value={constituency.id}>
                          {constituency.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-dark-500 mt-1">
                      The county follows the constituency.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">
                    Registered voters
                  </label>
                  <input
                    type="number"
                    value={form.registered_voters}
                    onChange={(e) => setForm({ ...form, registered_voters: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-dark-700">
                <button onClick={save} disabled={saving} className="flex-1 btn-primary text-sm py-2">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-5 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
