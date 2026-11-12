/**
 * Resolves the polling station of an agent import row from names instead of
 * database IDs.
 *
 * The IEBC list has one row per stream, so neither a station name nor its
 * IEBC code is unique on its own: a station with three streams appears three
 * times. A station is therefore found by
 *
 *   - its IEBC code, or its name inside the row's ward, and then
 *   - its stream, which may be left out only when the station has one.
 */

export interface StationRef {
  id: number
  name: string
  code: string
  stream: string | null
  ward_id: number | null
}

export interface StationInput {
  polling_station?: string | null
  polling_station_code?: string | null
  stream?: string | null
}

export type StationResult = { ok: true; station: StationRef } | { ok: false; error: string }

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/**
 * Station names are compared on case and spacing only. Unlike ward names,
 * punctuation is kept, so two different stations whose names differ only by
 * punctuation are not merged.
 */
export function stationNameKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function stationCodeKey(value: string): string {
  return value.trim().toUpperCase()
}

/** "01", "1" and "Stream 1" are the same stream. */
export function streamKey(value: string | null | undefined): string {
  const text = clean(value).toUpperCase().replace(/^STREAM\s*/, '')
  if (/^\d+$/.test(text)) return String(Number(text))
  return text
}

/**
 * Find the station of one row.
 *
 * @param wardId The ward resolved from the row's location columns, or null
 *   when the row identifies the station by its code alone.
 * @param stations The candidate stations: at least every station in the ward
 *   and every station with the row's code.
 */
export function resolveStation(
  input: StationInput,
  wardId: number | null,
  stations: StationRef[]
): StationResult {
  const code = clean(input.polling_station_code)
  const name = clean(input.polling_station)

  let matches: StationRef[]
  let label: string

  if (code) {
    const key = stationCodeKey(code)
    matches = stations.filter(
      (s) => stationCodeKey(s.code) === key && (wardId === null || s.ward_id === wardId)
    )
    label = `Polling station code '${code}'`
    if (matches.length === 0) {
      return {
        ok: false,
        error: wardId === null ? `${label} not found` : `${label} not found in the ward given`,
      }
    }
  } else if (name) {
    if (wardId === null) {
      return { ok: false, error: `Polling station '${name}' needs its ward` }
    }
    const key = stationNameKey(name)
    matches = stations.filter((s) => s.ward_id === wardId && stationNameKey(s.name) === key)
    label = `Polling station '${name}'`
    if (matches.length === 0) {
      return { ok: false, error: `${label} not found in the ward given` }
    }
  } else {
    return { ok: false, error: 'Missing polling_station (or polling_station_code)' }
  }

  const stream = clean(input.stream)
  if (stream) {
    const key = streamKey(stream)
    const inStream = matches.filter((s) => streamKey(s.stream) === key)
    if (inStream.length === 1) return { ok: true, station: inStream[0] }
    if (inStream.length === 0) {
      const available = matches.map((s) => s.stream).filter(Boolean)
      return {
        ok: false,
        error:
          `${label} has no stream '${stream}'` +
          (available.length ? ` (streams: ${available.join(', ')})` : ' (it has no streams)'),
      }
    }
    matches = inStream
  }

  if (matches.length > 1) {
    const streams = matches.map((s) => s.stream).filter(Boolean)
    return {
      ok: false,
      error: streams.length
        ? `${label} has streams ${streams.join(', ')}; add the stream column to choose one`
        : `${label} matches more than one station; add the county, constituency and ward columns`,
    }
  }

  return { ok: true, station: matches[0] }
}
