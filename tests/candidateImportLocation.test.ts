import { describe, it, expect, vi } from 'vitest'

// locationAdmin imports the database module; the resolver never queries it.
vi.mock('@/lib/db', () => ({ query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }))

import {
  resolveCandidateLocation,
  type GeographyLookup,
} from '@/lib/candidateImportLocation'

const lookup: GeographyLookup = {
  counties: [
    { id: 47, name: 'Nairobi' },
    { id: 21, name: "Murang'a" },
    { id: 1, name: 'Mombasa' },
  ],
  constituencies: [
    { id: 290, name: 'Westlands', county_id: 47 },
    { id: 291, name: 'Kibra', county_id: 47 },
    { id: 1, name: 'Changamwe', county_id: 1 },
    { id: 120, name: 'Kiharu', county_id: 21 },
  ],
  wards: [
    { id: 1400, name: 'Parklands/Highridge', constituency_id: 290, county_id: 47 },
    { id: 1401, name: 'Kitisuru', constituency_id: 290, county_id: 47 },
    // The same ward name in two constituencies.
    { id: 1410, name: 'Township', constituency_id: 291, county_id: 47 },
    { id: 5, name: 'Township', constituency_id: 1, county_id: 1 },
  ],
}

describe('resolveCandidateLocation', () => {
  it('needs no location for president', () => {
    const result = resolveCandidateLocation('president', {}, lookup)
    expect(result).toEqual({
      ok: true,
      location: { county_id: null, constituency_id: null, ward_id: null },
    })
  })

  it('resolves a county by name, ignoring case and punctuation', () => {
    const result = resolveCandidateLocation('governor', { county: 'MURANGA' }, lookup)
    expect(result).toEqual({
      ok: true,
      location: { county_id: 21, constituency_id: null, ward_id: null },
    })
  })

  it('requires a county for county-level seats', () => {
    for (const position of ['governor', 'senator', 'women_rep']) {
      const result = resolveCandidateLocation(position, {}, lookup)
      expect(result.ok).toBe(false)
    }
  })

  it('reports an unknown county', () => {
    const result = resolveCandidateLocation('senator', { county: 'Atlantis' }, lookup)
    expect(result).toEqual({ ok: false, error: "County 'Atlantis' not found" })
  })

  it('resolves an MP constituency with or without the county', () => {
    expect(resolveCandidateLocation('mp', { constituency: 'westlands' }, lookup)).toEqual({
      ok: true,
      location: { county_id: null, constituency_id: 290, ward_id: null },
    })
    expect(
      resolveCandidateLocation('mp', { county: 'Nairobi', constituency: 'Westlands' }, lookup)
    ).toMatchObject({ ok: true, location: { constituency_id: 290 } })
  })

  it('rejects a constituency that is not in the named county', () => {
    const result = resolveCandidateLocation(
      'mp',
      { county: 'Mombasa', constituency: 'Westlands' },
      lookup
    )
    expect(result.ok).toBe(false)
  })

  it('resolves an MCA ward, matching slash and case variations', () => {
    const result = resolveCandidateLocation(
      'mca',
      { constituency: 'Westlands', ward: 'PARKLANDS / HIGHRIDGE' },
      lookup
    )
    expect(result).toEqual({
      ok: true,
      location: { county_id: null, constituency_id: null, ward_id: 1400 },
    })
  })

  it('asks for the constituency when a ward name is ambiguous', () => {
    const ambiguous = resolveCandidateLocation('mca', { ward: 'Township' }, lookup)
    expect(ambiguous.ok).toBe(false)
    if (!ambiguous.ok) expect(ambiguous.error).toContain('add the constituency column')

    expect(
      resolveCandidateLocation('mca', { constituency: 'Changamwe', ward: 'Township' }, lookup)
    ).toMatchObject({ ok: true, location: { ward_id: 5 } })
    expect(
      resolveCandidateLocation('mca', { county: 'Nairobi', ward: 'Township' }, lookup)
    ).toMatchObject({ ok: true, location: { ward_id: 1410 } })
  })

  it('still accepts the old id columns', () => {
    expect(resolveCandidateLocation('governor', { county_id: '47' }, lookup)).toMatchObject({
      ok: true,
      location: { county_id: 47 },
    })
    expect(resolveCandidateLocation('mp', { constituency_id: '290' }, lookup)).toMatchObject({
      ok: true,
      location: { constituency_id: 290 },
    })
    expect(resolveCandidateLocation('mca', { ward_id: '1401' }, lookup)).toMatchObject({
      ok: true,
      location: { ward_id: 1401 },
    })
    expect(resolveCandidateLocation('mca', { ward_id: '9999' }, lookup).ok).toBe(false)
  })
})
