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

type SortKey = 'name' | 'code' | 'area' | 'registered_voters' | 'count'
type SortDirection = 'asc' | 'desc'

type ImportPhase = 'idle' | 'uploading' | 'processing'

/**
 * The wards are a short reference list, so the table loads all of them. The
 * polling stations run into the tens of thousands, so that table stays capped
 * and relies on the filters.
 */
const WARD_LIMIT = 5000
const STATION_LIMIT = 300

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
  const [stationTotal, setStationTotal] = useState(0)
  const [counties, setCounties] = useState<County[]>([])
  const [constituencies, setConstituencies] = useState<Constituency[]>([])
  const [wardOptions, setWardOptions] = useState<WardOption[]>([])

  const [countyId, setCountyId] = useState('')
  const [constituencyId, setConstituencyId] = useState('')
  const [wardId, setWardId] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [importType, setImportType] = useState('polling_stations')
  const [importMode, setImportMode] = useState<'update' | 'replace'>('update')
  const [importCountyId, setImportCountyId] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle')
  const [uploadProgress, setUploadProgress] = useState<{
    loaded: number
    total: number
  } | null>(null)

  const importing = importPhase !== 'idle'
  /** The station import reads a file; the ward repairs work on the database. */
  const needsFile = importType === 'polling_stations'
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

      const wardParams = new URLSearchParams(params)
      wardParams.set('limit', String(WARD_LIMIT))
      const stationParams = new URLSearchParams(params)
      stationParams.set('limit', String(STATION_LIMIT))

      const [wardResponse, stationResponse] = await Promise.all([
        fetch(`/api/admin/locations/wards?${wardParams.toString()}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        fetch(`/api/admin/locations/polling-stations?${stationParams.toString()}`, {
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
        setStationTotal(Number(body.total ?? body.count ?? 0))
      }
    } catch (err) {
      console.error('Failed to load the locations:', err)
      setError('Could not load the locations')
    } finally {
      setLoading(false)
    }
  }, [countyId, constituencyId, wardId, search])

  /**
   * The station table is paged: every press fetches the next slice for the
   * current filters. The wards are a short list and load in one go.
   */
  const loadMoreStations = useCallback(async () => {
    if (loading || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (countyId) params.set('county_id', countyId)
      if (constituencyId) params.set('constituency_id', constituencyId)
      if (wardId) params.set('ward_id', wardId)
      if (search.trim()) params.set('search', search.trim())
      params.set('limit', String(STATION_LIMIT))
      params.set('offset', String(stations.length))

      const response = await fetch(
        `/api/admin/locations/polling-stations?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not load more polling stations')

      setStations((previous) => {
        const seen = new Set(previous.map((station) => station.id))
        return [
          ...previous,
          ...((body.stations || []) as Station[]).filter((station) => !seen.has(station.id)),
        ]
      })
      setStationTotal(Number(body.total ?? body.count ?? 0))
    } catch (err) {
      console.error('Failed to load more polling stations:', err)
      setError('Could not load more polling stations')
    } finally {
      setLoadingMore(false)
    }
  }, [countyId, constituencyId, wardId, search, stations.length, loading, loadingMore])

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
    if (needsFile && !importFile) {
      setError('Choose a CSV file first')
      return
    }

    const replacing = importType === 'polling_stations' && importMode === 'replace'
    const importCounty = counties.find((c) => String(c.id) === importCountyId)

    if (replacing && !importCounty) {
      setError('Choose the county to replace')
      return
    }

    if (
      !dryRun &&
      replacing &&
      !window.confirm(
        `Replace the polling stations of ${importCounty?.name} County? Every existing station in ${importCounty?.name}, and the agents, volunteers, submissions and results attached to it, will be deleted before the file is written. Other counties are not touched, and rows of other counties in the file are ignored.`
      )
    ) {
      return
    }

    const uploadsFile = needsFile && importFile !== null
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
      form.append('mode', importMode)
      if (replacing && importCounty) form.append('county_id', String(importCounty.id))
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRecords = useMemo(() => {
    const records: Array<Ward | Station> = tab === 'stations' ? stations : wards

    const areaValue = (record: Ward | Station) =>
      (tab === 'stations'
        ? [
            (record as Station).county_name,
            (record as Station).constituency_name,
            (record as Station).ward_name,
          ]
        : [(record as Ward).county_name, (record as Ward).constituency_name]
      )
        .map((part) => part || '')
        .join('|')
        .toLowerCase()

    return [...records].sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (sortKey) {
        case 'code':
          aValue = a.code.toLowerCase()
          bValue = b.code.toLowerCase()
          break
        case 'area':
          aValue = areaValue(a)
          bValue = areaValue(b)
          break
        case 'registered_voters':
          aValue = Number(a.registered_voters || 0)
          bValue = Number(b.registered_voters || 0)
          break
        case 'count':
          aValue =
            tab === 'stations'
              ? Number((a as Station).submission_count || 0)
              : Number((a as Ward).station_count || 0)
          bValue =
            tab === 'stations'
              ? Number((b as Station).submission_count || 0)
              : Number((b as Ward).station_count || 0)
          break
        case 'name':
        default:
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [tab, wards, stations, sortKey, sortDirection])

  const renderSortHeader = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className={`inline-flex items-center gap-1.5 uppercase transition-colors ${
        sortKey === key ? 'text-white' : 'text-dark-300 hover:text-white'
      }`}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <svg
        className={`h-3 w-3 transition-transform ${
          sortKey === key ? 'opacity-100' : 'opacity-40'
        } ${sortKey === key && sortDirection === 'desc' ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
      </svg>
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/[0.07]">
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
        <div className="glass-effect rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Polling station import</h3>
            <p className="text-sm text-dark-300">
              Load the official IEBC polling station file. It must carry the
              eight columns County, Constituency, Ward, IEBC Code, Polling
              Station, Stream, Registration Centre and Registered Voters. A
              missing ward, constituency or county is created from the county
              down. A station is matched by code and stream, or by name, so a
              matched row can fill in the columns the file leaves out.
            </p>
          </div>

          <div
            className={
              importMode === 'replace'
                ? 'bg-red-500/10 border border-red-500/40 rounded-lg p-4'
                : 'bg-blue-500/10 border border-blue-500/40 rounded-lg p-4'
            }
          >
            <p
              className={
                importMode === 'replace' ? 'text-sm text-red-300' : 'text-sm text-blue-300'
              }
            >
              {importMode === 'replace'
                ? 'Replace mode: only the selected county is replaced. Its existing polling stations are removed, together with their agents, volunteers, submissions and results, and the rows of that county in the file are written. Rows and stations of other counties are left alone. Preview the file first to see how many stations would be deleted.'
                : 'Update mode: matching stations are updated in place, new rows are added, and stations not mentioned in the file are left alone. Agents, volunteers, submissions and results are kept.'}
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
                className="w-full px-4 py-3 bg-white/[0.025] border border-white/[0.07] rounded-lg text-white"
              >
                <option value="polling_stations">Polling stations (POLLING_STATIONS.csv)</option>
                <option value="prune_placeholders">Remove the placeholder wards</option>
                <option value="merge_duplicate_wards">Merge duplicate wards</option>
              </select>
            </div>

            {needsFile && (
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-2">CSV file</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] || null)
                    setImportResult(null)
                  }}
                  className="w-full px-4 py-2.5 bg-white/[0.025] border border-white/[0.07] rounded-lg text-white text-sm"
                />
              </div>
            )}
          </div>

          {needsFile && (
            <fieldset>
              <legend className="block text-sm font-medium text-dark-200 mb-2">
                How should existing data be handled?
              </legend>
              <div className="grid sm:grid-cols-2 gap-3">
                <label
                  className={`cursor-pointer rounded-lg border p-4 ${
                    importMode === 'update'
                      ? 'border-blue-500/60 bg-blue-500/10'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <input
                    type="radio"
                    name="location-import-mode"
                    value="update"
                    checked={importMode === 'update'}
                    onChange={() => {
                      setImportMode('update')
                      setImportResult(null)
                    }}
                    className="mr-2"
                  />
                  <span className="text-white font-medium">Update existing</span>
                  <span className="block mt-1 text-xs text-dark-300">
                    Update matching stations, add new ones, and keep records that
                    are not in the file.
                  </span>
                </label>
                <label
                  className={`cursor-pointer rounded-lg border p-4 ${
                    importMode === 'replace'
                      ? 'border-red-500/60 bg-red-500/10'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <input
                    type="radio"
                    name="location-import-mode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => {
                      setImportMode('replace')
                      setImportResult(null)
                    }}
                    className="mr-2"
                  />
                  <span className="text-white font-medium">Replace county</span>
                  <span className="block mt-1 text-xs text-dark-300">
                    Delete the existing stations of the selected county and their
                    attached data, then write that county&apos;s rows from the file.
                  </span>
                </label>
              </div>
            </fieldset>
          )}

          {importType === 'polling_stations' && importMode === 'replace' && (
            <div>
              <label className="block text-sm font-medium text-dark-200 mb-2">
                County to replace
              </label>
              <select
                value={importCountyId}
                onChange={(e) => {
                  setImportCountyId(e.target.value)
                  setImportResult(null)
                }}
                className="w-full sm:w-1/2 px-4 py-3 bg-white/[0.025] border border-white/[0.07] rounded-lg text-white"
              >
                <option value="">Select a county…</option>
                {counties.map((county) => (
                  <option key={county.id} value={county.id}>
                    {county.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {importType === 'merge_duplicate_wards' && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-sm text-yellow-300">
                Finds wards of the same constituency whose names only differ in
                case, punctuation, spacing or word order (for example &quot;Sang&apos;alo
                West&quot; and &quot;WEST SANG&apos;ALO&quot;, or
                &quot;Oldonyiro&quot; and &quot;OLDO/NYIRO&quot;). The official ward,
                the one with the numeric IEBC code, is kept: the polling stations,
                candidates and volunteers of the copies are moved to it and the
                copies are deleted. Preview first to see the pairs.
              </p>
            </div>
          )}

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
                className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]"
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
            <div className="bg-white/[0.025] border border-white/[0.07] rounded-lg p-4 text-sm">
              <p className="text-white font-medium mb-2">{importResult.message}</p>
              {importResult.dry_run && (
                <p className="text-dark-300 mb-2">Nothing was written yet.</p>
              )}
              {importResult.rows !== undefined && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {(
                    [
                      ['Rows read', importResult.total_rows],
                      ['To create', importResult.create ?? importResult.created ?? 0],
                      ['To update', importResult.update ?? importResult.updated ?? 0],
                      ['To delete', importResult.deleted ?? 0],
                      ['To skip', importResult.skip ?? importResult.skipped ?? 0],
                      ...(importResult.outside_county !== undefined
                        ? [['Other counties (ignored)', importResult.outside_county]]
                        : []),
                      ...(importResult.wards_to_merge !== undefined ||
                      importResult.wards_merged !== undefined
                        ? [
                            [
                              importResult.dry_run
                                ? 'Duplicate wards to merge'
                                : 'Duplicate wards merged',
                              importResult.wards_to_merge ??
                                importResult.wards_merged ??
                                0,
                            ],
                          ]
                        : []),
                      ['With errors', importResult.error_rows ?? importResult.errors?.length ?? 0],
                    ] as Array<[string, number]>
                  ).map(([label, value]) => (
                    <div key={label} className="bg-white/[0.03] rounded px-3 py-2">
                      <p className="text-xs text-dark-400">{label}</p>
                      <p className="text-white font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              )}
              {importResult.created !== undefined && (
                <p className="text-dark-300">
                  Deleted: {importResult.deleted ?? 0} · Created:{' '}
                  {importResult.created ?? 0} · Updated: {importResult.updated ?? 0} · Skipped:{' '}
                  {importResult.skipped}
                </p>
              )}
              {importResult.removed !== undefined && (
                <p className="text-dark-300">
                  Placeholder wards removed: {importResult.removed}
                  {importResult.kept?.length ? ` · kept ${importResult.kept.length}` : ''}
                </p>
              )}
              {(importResult.groups ?? importResult.merged_wards)?.length > 0 && (
                <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                  {(importResult.groups ?? importResult.merged_wards).map((group: any) => (
                    <p key={group.keeper.id} className="text-xs text-dark-300">
                      {group.removed
                        .map((ward: any) => `${ward.name} (${ward.code})`)
                        .join(', ')}{' '}
                      → {group.keeper.name} ({group.keeper.code})
                      {group.constituency_name ? ` · ${group.constituency_name}` : ''}
                      {group.county_name ? `, ${group.county_name}` : ''} ·{' '}
                      {group.stations_moved} station(s)
                    </p>
                  ))}
                </div>
              )}
              {(importResult.groups ? importResult.kept : importResult.wards_not_merged)
                ?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {(importResult.groups
                    ? importResult.kept
                    : importResult.wards_not_merged
                  ).map((entry: any, i: number) => (
                    <p key={i} className="text-xs text-yellow-300">
                      Not merged: {entry.name}: {entry.reason}
                    </p>
                  ))}
                </div>
              )}
              {importResult.rows?.length > 0 && (
                <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                  {importResult.rows
                    .filter((row: any) => row.issues?.length > 0)
                    .slice(0, 50)
                    .map((row: any) => (
                      <div key={row.row} className="border-l-2 border-white/10 pl-2">
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
          <div className="glass-effect rounded-2xl p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <select
                value={countyId}
                onChange={(e) => {
                  setCountyId(e.target.value)
                  setConstituencyId('')
                  setWardId('')
                }}
                className="px-3 py-2 bg-white/[0.025] border border-white/[0.07] rounded text-white text-sm"
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
                className="px-3 py-2 bg-white/[0.025] border border-white/[0.07] rounded text-white text-sm disabled:opacity-50"
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
                  className="px-3 py-2 bg-white/[0.025] border border-white/[0.07] rounded text-white text-sm disabled:opacity-50"
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
                className="px-3 py-2 bg-white/[0.025] border border-white/[0.07] rounded text-white text-sm"
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
          <div className="glass-effect rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/[0.03] border-b border-white/[0.07]">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      {renderSortHeader(tab === 'stations' ? 'Station' : 'Ward', 'name')}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      {renderSortHeader('Code', 'code')}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      {renderSortHeader('Area', 'area')}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      {renderSortHeader('Voters', 'registered_voters')}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-dark-300 uppercase">
                      {renderSortHeader(tab === 'stations' ? 'Submissions' : 'Stations', 'count')}
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-dark-300 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-dark-400">
                        Loading...
                      </td>
                    </tr>
                  ) : sortedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-dark-400">
                        Nothing found for these filters.
                      </td>
                    </tr>
                  ) : (
                    sortedRecords.map(
                      (record) => (
                        <tr key={record.id} className="hover:bg-white/[0.025]">
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

            {tab === 'stations' && stationTotal > 0 && (
              <div className="flex flex-col gap-3 border-t border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-dark-300">
                  Showing {stations.length.toLocaleString()} of{' '}
                  {stationTotal.toLocaleString()} polling stations
                </p>
                {stations.length < stationTotal && (
                  <button
                    type="button"
                    onClick={loadMoreStations}
                    disabled={loadingMore || loading}
                    className="btn-secondary text-sm py-2"
                  >
                    {loadingMore ? 'Loading...' : `Load ${STATION_LIMIT} more`}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
