import { sameGeographyName } from '@/lib/locationAdmin'

/**
 * Resolves the electoral area of a ballot candidate import row from the
 * county, constituency and ward *names* in the CSV.
 *
 * Names are matched with sameGeographyName, so case, punctuation and word
 * order differences ("Murang'a" / "MURANGA", "Sang'alo West" / "WEST
 * SANG'ALO") still match. Ward names repeat across the country, and some
 * constituency names may too, so the parent columns narrow the search: an MCA
 * row whose ward name exists in two constituencies must name the
 * constituency (or county) as well.
 *
 * The older *_id columns are still accepted when the matching name column is
 * empty, so files made with the previous template keep working.
 */

export interface CountyRef {
  id: number
  name: string
}

export interface ConstituencyRef {
  id: number
  name: string
  county_id: number | null
}

export interface WardRef {
  id: number
  name: string
  constituency_id: number | null
  county_id: number | null
}

export interface GeographyLookup {
  counties: CountyRef[]
  constituencies: ConstituencyRef[]
  wards: WardRef[]
}

export interface ImportLocationInput {
  county?: string | null
  constituency?: string | null
  ward?: string | null
  county_id?: string | null
  constituency_id?: string | null
  ward_id?: string | null
}

export interface ResolvedLocation {
  county_id: number | null
  constituency_id: number | null
  ward_id: number | null
}

export type ResolveResult =
  | { ok: true; location: ResolvedLocation }
  | { ok: false; error: string }

const COUNTY_POSITIONS = ['governor', 'senator', 'women_rep']

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function parseId(value: string | null | undefined): number | null {
  const text = clean(value)
  if (!text) return null
  const id = Number(text)
  return Number.isInteger(id) && id > 0 ? id : NaN
}

function describe(items: Array<{ name: string }>): string {
  return items.map((item) => item.name).join(', ')
}

function findCounty(lookup: GeographyLookup, input: ImportLocationInput): ResolveResult & { county?: CountyRef | null } {
  const name = clean(input.county)
  if (name) {
    const county = lookup.counties.find((c) => sameGeographyName(c.name, name))
    if (!county) return { ok: false, error: `County '${name}' not found` }
    return { ok: true, location: emptyLocation(), county }
  }

  const id = parseId(input.county_id)
  if (id === null) return { ok: true, location: emptyLocation(), county: null }
  const county = Number.isNaN(id) ? undefined : lookup.counties.find((c) => c.id === id)
  if (!county) return { ok: false, error: `County ID '${clean(input.county_id)}' not found` }
  return { ok: true, location: emptyLocation(), county }
}

function findConstituency(
  lookup: GeographyLookup,
  input: ImportLocationInput,
  county: CountyRef | null
): ResolveResult & { constituency?: ConstituencyRef | null } {
  const name = clean(input.constituency)
  if (name) {
    const matches = lookup.constituencies.filter(
      (c) => sameGeographyName(c.name, name) && (!county || c.county_id === county.id)
    )
    if (matches.length === 0) {
      return {
        ok: false,
        error: county
          ? `Constituency '${name}' not found in ${county.name} county`
          : `Constituency '${name}' not found`,
      }
    }
    if (matches.length > 1) {
      return {
        ok: false,
        error: `Constituency '${name}' exists in more than one county; add the county column to choose one`,
      }
    }
    return { ok: true, location: emptyLocation(), constituency: matches[0] }
  }

  const id = parseId(input.constituency_id)
  if (id === null) return { ok: true, location: emptyLocation(), constituency: null }
  const constituency = Number.isNaN(id)
    ? undefined
    : lookup.constituencies.find((c) => c.id === id)
  if (!constituency) {
    return { ok: false, error: `Constituency ID '${clean(input.constituency_id)}' not found` }
  }
  return { ok: true, location: emptyLocation(), constituency }
}

function emptyLocation(): ResolvedLocation {
  return { county_id: null, constituency_id: null, ward_id: null }
}

/** Limits a lookup to one part of the country, such as a candidate's area. */
export interface AreaLimit {
  county_id?: number | null
  constituency_id?: number | null
  ward_id?: number | null
}

export type WardResult = { ok: true; ward: WardRef } | { ok: false; error: string }

/**
 * Resolve a ward from the county, constituency and ward columns.
 *
 * `within` restricts the search to an area, so a candidate importing agents
 * only matches wards inside their own electoral area. That also tells apart
 * two wards with the same name, and lets a ward-level candidate leave the ward
 * column empty.
 */
export function resolveWard(
  input: ImportLocationInput,
  lookup: GeographyLookup,
  within: AreaLimit = {}
): WardResult {
  const countyResult = findCounty(lookup, input)
  if (!countyResult.ok) return countyResult
  const county = countyResult.county ?? null

  const constituencyResult = findConstituency(lookup, input, county)
  if (!constituencyResult.ok) return constituencyResult
  const constituency = constituencyResult.constituency ?? null

  if (constituency && county && constituency.county_id !== county.id) {
    return {
      ok: false,
      error: `Constituency '${constituency.name}' is not in ${county.name} county`,
    }
  }

  const inArea = (w: WardRef) =>
    (!within.ward_id || w.id === within.ward_id) &&
    (!within.constituency_id || w.constituency_id === within.constituency_id) &&
    (!within.county_id || w.county_id === within.county_id)

  const wardName = clean(input.ward)

  if (!wardName) {
    const id = parseId(input.ward_id)
    if (id === null) {
      // A candidate whose whole area is a single ward does not need to name it.
      const only = within.ward_id ? lookup.wards.find((w) => w.id === within.ward_id) : undefined
      if (only) return { ok: true, ward: only }
      return { ok: false, error: 'a ward is required' }
    }
    const ward = Number.isNaN(id) ? undefined : lookup.wards.find((w) => w.id === id)
    if (!ward) return { ok: false, error: `Ward ID '${clean(input.ward_id)}' not found` }
    if (!inArea(ward)) return { ok: false, error: `Ward '${ward.name}' is outside your electoral area` }
    return { ok: true, ward }
  }

  const named = lookup.wards.filter(
    (w) =>
      sameGeographyName(w.name, wardName) &&
      (!constituency || w.constituency_id === constituency.id) &&
      (!county || w.county_id === county.id)
  )
  const matches = named.filter(inArea)

  if (matches.length === 0) {
    if (named.length > 0) {
      return { ok: false, error: `Ward '${wardName}' is outside your electoral area` }
    }
    const where = constituency
      ? ` in ${constituency.name} constituency`
      : county
        ? ` in ${county.name} county`
        : ''
    return { ok: false, error: `Ward '${wardName}' not found${where}` }
  }

  if (matches.length > 1) {
    const parents = matches
      .map((w) => lookup.constituencies.find((c) => c.id === w.constituency_id))
      .filter((c): c is ConstituencyRef => Boolean(c))
    return {
      ok: false,
      error:
        `Ward '${wardName}' exists in more than one place` +
        (parents.length ? ` (${describe(parents)})` : '') +
        '; add the constituency column to choose one',
    }
  }

  return { ok: true, ward: matches[0] }
}

/**
 * Resolve the location for one row. Only the level the position competes at
 * is returned, matching how ballot candidates are stored.
 */
export function resolveCandidateLocation(
  position: string,
  input: ImportLocationInput,
  lookup: GeographyLookup
): ResolveResult {
  if (position === 'president') {
    return { ok: true, location: emptyLocation() }
  }

  if (position === 'mca') {
    const result = resolveWard(input, lookup)
    if (!result.ok) {
      return { ok: false, error: result.error === 'a ward is required' ? 'mca requires a ward' : result.error }
    }
    return { ok: true, location: { ...emptyLocation(), ward_id: result.ward.id } }
  }

  const countyResult = findCounty(lookup, input)
  if (!countyResult.ok) return countyResult
  const county = countyResult.county ?? null

  if (COUNTY_POSITIONS.includes(position)) {
    if (!county) return { ok: false, error: `${position} requires a county` }
    return { ok: true, location: { ...emptyLocation(), county_id: county.id } }
  }

  if (position !== 'mp') {
    return { ok: false, error: `Unknown position '${position}'` }
  }

  const constituencyResult = findConstituency(lookup, input, county)
  if (!constituencyResult.ok) return constituencyResult
  const constituency = constituencyResult.constituency ?? null

  if (constituency && county && constituency.county_id !== county.id) {
    return {
      ok: false,
      error: `Constituency '${constituency.name}' is not in ${county.name} county`,
    }
  }

  if (!constituency) return { ok: false, error: 'mp requires a constituency' }
  return { ok: true, location: { ...emptyLocation(), constituency_id: constituency.id } }
}
