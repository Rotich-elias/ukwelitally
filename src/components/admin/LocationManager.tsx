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

type ImportPhase = 'idle' | 'uploading' | 'processing'

/** A byte count as a short size for the progress line, e.g. "1.2 MB". */
function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / 1024 ** exponent
  return `${exponent === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${
    units[exponent]
  }`
}

/**
 * Upload a CSV and report how much of it has been sent.
 *
 * `fetch` cannot report the progress of the request body, but the import
 * screen shows an upload percentage, so the request is made with XHR. The
 * route answers with JSON, so the body is parsed here and the error message
 * of the route is surfaced when the request fails.
 */
function uploadImport(
  form: FormData,
  token: string,
  onProgress: (loaded: number, total: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/locations/import')
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.timeout = 15 * 60 * 1000

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total)
    }

    xhr.onload = () => {
      let body: any = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = null
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body)
        return
      }

      reject(new Error(body?.error || `The import failed (HTTP ${xhr.status})`))
    }

    xhr.onerror = () =>
      reject(new Error('Could not reach the server. Check your connection and try again.'))
    xhr.ontimeout = () => reject(new Error('The import timed out'))
    xhr.onabort = () => reject(new Error('The import was cancelled'))

    xhr.send(form)
  })
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

  const [importType, setImportType] = useState('wards')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle')
  const [uploadProgress, setUploadProgress] = useState<{
    loaded: number
    total: number
  } | null>(null)

  const importing = importPhase !== 'idle'
  const uploadPercent =
    uploadProgress && uploadProgress.total > 0
      ? Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))
      : 0

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

  const runImport = async (dryRun: boolean) => {
    if (importType !== 'prune_placeholders' && !importFile) {
      setError('Choose a CSV file first')
      return
    }

    const uploadsFile = importType !== 'prune_placeholders' && importFile !== null
    setImportPhase(uploadsFile ? 'uploading' : 'processing')
    setUploadProgress(
      uploadsFile && importFile ? { loaded: 0, total: importFile.size } : null
    )
    setError(null)
    setNotice(null)
    try {
      const form = new FormData()
      form.append('type', importType)
      form.append('dry_run', dryRun ? 'true' : 'false')
      if (uploadsFile && importFile) form.append('file', importFile)

      const body = await uploadImport(form, token(), (loaded, total) => {
        setUploadProgress({ loaded, total })
        // The bytes are on the server; the rest is the database work.
        if (total > 0 && loaded >= total) setImportPhase('processing')
      })

      setImportResult(body)
      if (!dryRun) {
        setNotice(body?.message || 'Import finished')
        await loadLocations()
      }
    } catch (err: any) {
      setError(err.message || 'The import failed')
    } finally {
      setImportPhase('idle')
      setUploadProgress(null)
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
              Load an official IEBC file to create or update wards and polling
              stations. New wards/polling stations are created when they do not
              exist and sufficient details are provided. Existing records are
              matched by code or by name and updated. A ward&apos;s code is never
              changed by the import. Only the columns the file carries are
              written.
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

          {importing && (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-dark-300">
                  {importPhase === 'uploading'
                    ? `Uploading ${importFile?.name || 'CSV'}…`
                    : 'Upload complete. Processing the rows…'}
                </span>
                {importPhase === 'uploading' &&
                  uploadProgress &&
                  uploadProgress.total > 0 && (
                    <span className="text-dark-400 font-medium tabular-nums">
                      {uploadPercent}% · {formatBytes(uploadProgress.loaded)} of{' '}
                      {formatBytes(uploadProgress.total)}
                    </span>
                  )}
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-dark-800"
                role="progressbar"
                aria-label="CSV upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  importPhase === 'uploading' ? uploadPercent : undefined
                }
              >
                <div
                  className={`h-full rounded-full bg-blue-500 ${
                    importPhase === 'processing'
                      ? 'w-full animate-pulse'
                      : 'transition-all duration-300'
                  }`}
                  style={
                    importPhase === 'uploading'
                      ? { width: `${uploadPercent}%` }
                      : undefined
                  }
                />
              </div>
            </div>
          )}

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
              {importResult.updated !== undefined && (
                <p className="text-dark-300">
                  Updated: {importResult.updated} · Skipped: {importResult.skipped}
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
                onClick={() => setTab('import')}
                className="btn-primary text-sm py-2"
              >
                Update via CSV import
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
                          <td className="px-5 py-3 text-right">
                            <span className="text-xs text-dark-500">via CSV import</span>
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
    </div>
  )
}
