'use client'

import { useState, useEffect } from 'react'

interface County {
  id: number
  name: string
  code: string
}

interface Constituency {
  id: number
  name: string
  code: string
  county_id: number
  county_name: string
}

interface Ward {
  id: number
  name: string
  code: string
  constituency_id: number
  constituency_name: string
  county_name: string
}

interface PollingStation {
  id: number
  name: string
  code: string
  ward_id: number
  ward_name: string
  constituency_name: string
  county_name: string
  registered_voters: number
}

interface LocationSelectorProps {
  onLocationChange?: (location: {
    countyId?: number
    constituencyId?: number
    wardId?: number
    pollingStationId?: number
  }) => void
  showPollingStations?: boolean
  required?: boolean
  initialValues?: {
    countyId?: number
    constituencyId?: number
    wardId?: number
    pollingStationId?: number
  }
}

export default function LocationSelector({
  onLocationChange,
  showPollingStations = false,
  required = false,
  initialValues,
}: LocationSelectorProps) {
  const [counties, setCounties] = useState<County[]>([])
  const [constituencies, setConstituencies] = useState<Constituency[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [pollingStations, setPollingStations] = useState<PollingStation[]>([])

  const [selectedCounty, setSelectedCounty] = useState<number | undefined>(initialValues?.countyId)
  const [selectedConstituency, setSelectedConstituency] = useState<number | undefined>(initialValues?.constituencyId)
  const [selectedWard, setSelectedWard] = useState<number | undefined>(initialValues?.wardId)
  const [selectedStation, setSelectedStation] = useState<number | undefined>(initialValues?.pollingStationId)

  const [loading, setLoading] = useState({ counties: false, constituencies: false, wards: false, stations: false })

  // Fetch counties on mount
  useEffect(() => {
    const fetchCounties = async () => {
      setLoading(prev => ({ ...prev, counties: true }))
      try {
        const response = await fetch('/api/locations/counties')
        if (response.ok) {
          const data = await response.json()
          setCounties(data.data)
        }
      } catch (error) {
        console.error('Failed to fetch counties:', error)
      } finally {
        setLoading(prev => ({ ...prev, counties: false }))
      }
    }
    fetchCounties()
  }, [])

  // Fetch constituencies when county changes
  useEffect(() => {
    if (!selectedCounty) {
      setConstituencies([])
      setSelectedConstituency(undefined)
      return
    }

    const fetchConstituencies = async () => {
      setLoading(prev => ({ ...prev, constituencies: true }))
      try {
        const response = await fetch(`/api/locations/constituencies?county_id=${selectedCounty}`)
        if (response.ok) {
          const data = await response.json()
          setConstituencies(data.data)
        }
      } catch (error) {
        console.error('Failed to fetch constituencies:', error)
      } finally {
        setLoading(prev => ({ ...prev, constituencies: false }))
      }
    }
    fetchConstituencies()
  }, [selectedCounty])

  // Fetch wards when constituency changes
  useEffect(() => {
    if (!selectedConstituency) {
      setWards([])
      setSelectedWard(undefined)
      return
    }

    const fetchWards = async () => {
      setLoading(prev => ({ ...prev, wards: true }))
      try {
        const response = await fetch(`/api/locations/wards?constituency_id=${selectedConstituency}`)
        if (response.ok) {
          const data = await response.json()
          setWards(data.data)
        }
      } catch (error) {
        console.error('Failed to fetch wards:', error)
      } finally {
        setLoading(prev => ({ ...prev, wards: false }))
      }
    }
    fetchWards()
  }, [selectedConstituency])

  // Fetch polling stations when ward changes
  useEffect(() => {
    if (!showPollingStations || !selectedWard) {
      setPollingStations([])
      setSelectedStation(undefined)
      return
    }

    const fetchStations = async () => {
      setLoading(prev => ({ ...prev, stations: true }))
      try {
        const response = await fetch(`/api/locations/polling-stations?ward_id=${selectedWard}`)
        if (response.ok) {
          const data = await response.json()
          setPollingStations(data.data)
        }
      } catch (error) {
        console.error('Failed to fetch polling stations:', error)
      } finally {
        setLoading(prev => ({ ...prev, stations: false }))
      }
    }
    fetchStations()
  }, [selectedWard, showPollingStations])

  // Notify parent of changes
  useEffect(() => {
    if (onLocationChange) {
      onLocationChange({
        countyId: selectedCounty,
        constituencyId: selectedConstituency,
        wardId: selectedWard,
        pollingStationId: selectedStation,
      })
    }
  }, [selectedCounty, selectedConstituency, selectedWard, selectedStation, onLocationChange])

  const handleCountyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value ? Number(e.target.value) : undefined
    setSelectedCounty(value)
    setSelectedConstituency(undefined)
    setSelectedWard(undefined)
    setSelectedStation(undefined)
  }

  const handleConstituencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value ? Number(e.target.value) : undefined
    setSelectedConstituency(value)
    setSelectedWard(undefined)
    setSelectedStation(undefined)
  }

  const handleWardChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value ? Number(e.target.value) : undefined
    setSelectedWard(value)
    setSelectedStation(undefined)
  }

  const handleStationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value ? Number(e.target.value) : undefined
    setSelectedStation(value)
  }

  const selectClassName = "w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"

  return (
    <div className="space-y-4">
      {/* County Selector */}
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">
          County {required && <span className="text-red-400">*</span>}
        </label>
        <select
          value={selectedCounty || ''}
          onChange={handleCountyChange}
          className={selectClassName}
          required={required}
          disabled={loading.counties}
        >
          <option value="">Select County</option>
          {counties.map(county => (
            <option key={county.id} value={county.id}>
              {county.name}
            </option>
          ))}
        </select>
      </div>

      {/* Constituency Selector */}
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">
          Constituency {required && <span className="text-red-400">*</span>}
        </label>
        <select
          value={selectedConstituency || ''}
          onChange={handleConstituencyChange}
          className={selectClassName}
          required={required}
          disabled={!selectedCounty || loading.constituencies}
        >
          <option value="">Select Constituency</option>
          {constituencies.map(constituency => (
            <option key={constituency.id} value={constituency.id}>
              {constituency.name}
            </option>
          ))}
        </select>
      </div>

      {/* Ward Selector */}
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">
          Ward {required && <span className="text-red-400">*</span>}
        </label>
        <select
          value={selectedWard || ''}
          onChange={handleWardChange}
          className={selectClassName}
          required={required}
          disabled={!selectedConstituency || loading.wards}
        >
          <option value="">Select Ward</option>
          {wards.map(ward => (
            <option key={ward.id} value={ward.id}>
              {ward.name}
            </option>
          ))}
        </select>
      </div>

      {/* Polling Station Selector (optional) */}
      {showPollingStations && (
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-2">
            Polling Station {required && <span className="text-red-400">*</span>}
          </label>
          <select
            value={selectedStation || ''}
            onChange={handleStationChange}
            className={selectClassName}
            required={required}
            disabled={!selectedWard || loading.stations}
          >
            <option value="">Select Polling Station</option>
            {pollingStations.map(station => (
              <option key={station.id} value={station.id}>
                {station.name} ({station.code}) - {station.registered_voters?.toLocaleString()} voters
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
