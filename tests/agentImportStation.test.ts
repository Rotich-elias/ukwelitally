import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }))

import { resolveStation, streamKey, type StationRef } from '@/lib/agentImportStation'
import { resolveWard, type GeographyLookup } from '@/lib/candidateImportLocation'

const stations: StationRef[] = [
  // One station split into two streams.
  { id: 10, name: 'Westlands Primary School', code: '047001', stream: '1', ward_id: 1400 },
  { id: 11, name: 'Westlands Primary School', code: '047001', stream: '2', ward_id: 1400 },
  // A station with a single stream.
  { id: 12, name: 'Kitisuru Social Hall', code: '047002', stream: null, ward_id: 1401 },
  // Same station name in another ward.
  { id: 13, name: 'Westlands Primary School', code: '099001', stream: null, ward_id: 5 },
]

describe('resolveStation', () => {
  it('matches by name inside the ward, ignoring case and spacing', () => {
    expect(
      resolveStation({ polling_station: '  kitisuru   social hall ' }, 1401, stations)
    ).toMatchObject({ ok: true, station: { id: 12 } })
  })

  it('uses the ward to tell apart stations with the same name', () => {
    expect(
      resolveStation({ polling_station: 'Westlands Primary School' }, 5, stations)
    ).toMatchObject({ ok: true, station: { id: 13 } })
  })

  it('picks the stream', () => {
    expect(
      resolveStation({ polling_station: 'Westlands Primary School', stream: '02' }, 1400, stations)
    ).toMatchObject({ ok: true, station: { id: 11 } })
  })

  it('asks for the stream when the station has several', () => {
    const result = resolveStation({ polling_station: 'Westlands Primary School' }, 1400, stations)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('add the stream column')
  })

  it('reports a stream that does not exist', () => {
    const result = resolveStation(
      { polling_station: 'Westlands Primary School', stream: '7' },
      1400,
      stations
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('streams: 1, 2')
  })

  it('needs a ward when matching by name', () => {
    expect(resolveStation({ polling_station: 'Kitisuru Social Hall' }, null, stations).ok).toBe(
      false
    )
  })

  it('matches by IEBC code and stream without a ward', () => {
    expect(
      resolveStation({ polling_station_code: '047001', stream: '1' }, null, stations)
    ).toMatchObject({ ok: true, station: { id: 10 } })
    expect(resolveStation({ polling_station_code: '047002' }, null, stations)).toMatchObject({
      ok: true,
      station: { id: 12 },
    })
    expect(resolveStation({ polling_station_code: '123456' }, null, stations).ok).toBe(false)
  })

  it('reads "Stream 1", "01" and "1" as the same stream', () => {
    expect(streamKey('Stream 1')).toBe('1')
    expect(streamKey('01')).toBe('1')
    expect(streamKey(null)).toBe('')
  })
})

describe('resolveWard with an area limit', () => {
  const lookup: GeographyLookup = {
    counties: [
      { id: 47, name: 'Nairobi' },
      { id: 1, name: 'Mombasa' },
    ],
    constituencies: [
      { id: 291, name: 'Kibra', county_id: 47 },
      { id: 1, name: 'Changamwe', county_id: 1 },
    ],
    wards: [
      { id: 1410, name: 'Township', constituency_id: 291, county_id: 47 },
      { id: 5, name: 'Township', constituency_id: 1, county_id: 1 },
    ],
  }

  it('uses the area to tell apart wards with the same name', () => {
    expect(resolveWard({ ward: 'Township' }, lookup, { county_id: 1 })).toMatchObject({
      ok: true,
      ward: { id: 5 },
    })
  })

  it('rejects a ward outside the area', () => {
    const result = resolveWard({ constituency: 'Kibra', ward: 'Township' }, lookup, {
      county_id: 1,
    })
    expect(result).toEqual({ ok: false, error: "Ward 'Township' is outside your electoral area" })
  })

  it("defaults to a ward-level candidate's own ward", () => {
    expect(resolveWard({}, lookup, { ward_id: 1410 })).toMatchObject({
      ok: true,
      ward: { id: 1410 },
    })
  })
})
