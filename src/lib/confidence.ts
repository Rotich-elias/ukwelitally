import {
  query,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from '@/lib/db'
import { detectAnomalies, verifyLocation } from '@/lib/validation'

/**
 * Explainable submission confidence.
 *
 * The original score was calculated before the result figures existed and used
 * fixed assumptions ("math is valid", "submitted within one hour"), so almost
 * every submission landed on the same number. The score below is derived from
 * evidence that is actually persisted: GPS distance, the photo types that were
 * stored, the OCR result when OCR is configured, the arithmetic validation of
 * the attached result, timeliness and anomaly flags.
 *
 * Each component keeps its weight and the evidence behind it, so an
 * administrator can see why a submission scored what it did instead of trusting
 * a single opaque number.
 */

export const CONFIDENCE_VERSION = 1

export const CONFIDENCE_WEIGHTS = {
  gps: 25,
  photos: 25,
  ocr: 15,
  arithmetic: 20,
  timeliness: 15,
} as const

/** A Form 34A photo is the one piece of evidence every submission must carry. */
export const REQUIRED_PHOTO_TYPES = ['full_form'] as const

export interface ConfidenceInput {
  locationVerified: boolean
  distanceMeters: number | null
  locationRadiusMeters: number | null
  photoTypes: string[]
  /** OCR confidence (0-100) for every photo that was read. */
  ocrConfidences: number[]
  /** False when the OCR engine is not configured or did not run. */
  ocrAvailable: boolean
  /** null means the result figures have not been entered yet. */
  mathValid: boolean | null
  submittedAt: Date | string
  formCapturedAt: Date | string | null
  hasAnomalies: boolean
}

export interface ConfidenceComponent {
  key: string
  label: string
  weight: number
  ratio: number
  points: number
  available: boolean
  detail: string
}

export interface ConfidenceBreakdown {
  version: number
  score: number
  available_weight: number
  penalty: number
  components: ConfidenceComponent[]
  calculated_at: string
}

export interface ConfidenceResult {
  score: number
  breakdown: ConfidenceBreakdown
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function hoursBetween(from: Date | null, to: Date): number {
  if (!from) return 0
  const diff = to.getTime() - from.getTime()
  if (!Number.isFinite(diff) || diff < 0) return 0
  return diff / (60 * 60 * 1000)
}

function gpsRatio(input: ConfidenceInput): { ratio: number; detail: string } {
  if (!input.locationVerified) {
    return { ratio: 0, detail: 'The submission was not verified against the polling station location.' }
  }

  if (input.distanceMeters === null || !Number.isFinite(input.distanceMeters)) {
    return { ratio: 0.75, detail: 'The location was verified, but the distance was not recorded.' }
  }

  const radius =
    input.locationRadiusMeters && input.locationRadiusMeters > 0
      ? input.locationRadiusMeters
      : 500
  const distance = input.distanceMeters

  let ratio: number
  if (distance <= radius * 0.2) ratio = 1
  else if (distance <= radius * 0.5) ratio = 0.9
  else if (distance <= radius) ratio = 0.75
  else if (distance <= radius * 2) ratio = 0.35
  else ratio = 0.1

  return {
    ratio,
    detail: `${Math.round(distance)} m from the polling station (allowed radius ${Math.round(radius)} m).`,
  }
}

function photoRatio(photoTypes: string[]): { ratio: number; detail: string } {
  const present = new Set(photoTypes)
  const requiredMatched = REQUIRED_PHOTO_TYPES.filter((type) => present.has(type)).length
  const requiredRatio = requiredMatched / REQUIRED_PHOTO_TYPES.length

  // 40% for the required form photo, 35% for having a useful number of photos
  // and 25% for covering the different evidence types the field app offers.
  const countRatio = clamp(photoTypes.length / 3)
  const varietyRatio = clamp(present.size / 5)
  const ratio = 0.4 * requiredRatio + 0.35 * countRatio + 0.25 * varietyRatio

  const missing = REQUIRED_PHOTO_TYPES.filter((type) => !present.has(type))
  const detail = missing.length
    ? `Missing required photo type: ${missing.join(', ')}.`
    : `${photoTypes.length} photo${photoTypes.length === 1 ? '' : 's'} across ${present.size} evidence type${present.size === 1 ? '' : 's'}.`

  return { ratio, detail }
}

function arithmeticRatio(mathValid: boolean | null): { ratio: number; detail: string; available: boolean } {
  if (mathValid === null) {
    return {
      ratio: 0,
      detail: 'The result figures have not been entered yet, so arithmetic cannot be verified.',
      available: false,
    }
  }
  return mathValid
    ? { ratio: 1, detail: 'Vote totals add up and pass validation.', available: true }
    : { ratio: 0, detail: 'The vote totals do not add up or failed validation.', available: true }
}

function timelinessRatio(input: ConfidenceInput): { ratio: number; detail: string } {
  const submittedAt = toDate(input.submittedAt) ?? new Date()
  const capturedAt = toDate(input.formCapturedAt)
  const hours = hoursBetween(capturedAt, submittedAt)

  if (!capturedAt) {
    return {
      ratio: 0.85,
      detail: 'The form capture time was not recorded; the submission time is used instead.',
    }
  }

  let ratio: number
  if (hours <= 2) ratio = 1
  else if (hours <= 6) ratio = 0.85
  else if (hours <= 12) ratio = 0.65
  else if (hours <= 24) ratio = 0.4
  else if (hours <= 48) ratio = 0.2
  else ratio = 0

  return {
    ratio,
    detail: `Submitted ${hours < 1 ? 'within the hour' : `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`} after the form was captured.`,
  }
}

function ocrRatio(input: ConfidenceInput): { ratio: number; detail: string } {
  if (!input.ocrAvailable || input.ocrConfidences.length === 0) {
    return {
      ratio: 0,
      detail: 'OCR is not configured or has not read the form photo yet.',
    }
  }

  const average =
    input.ocrConfidences.reduce((sum, value) => sum + clamp(value, 0, 100), 0) /
    input.ocrConfidences.length

  return {
    ratio: clamp(average / 100),
    detail: `OCR read ${input.ocrConfidences.length} photo${input.ocrConfidences.length === 1 ? '' : 's'} with an average confidence of ${Math.round(average)}%.`,
  }
}

/**
 * Pure confidence calculation. Kept free of database access so the scoring
 * rules can be unit tested and changed without touching the routes.
 */
export function computeConfidenceScore(input: ConfidenceInput): ConfidenceResult {
  const gps = gpsRatio(input)
  const photos = photoRatio(input.photoTypes)
  const arithmetic = arithmeticRatio(input.mathValid)
  const timeliness = timelinessRatio(input)
  const ocr = ocrRatio(input)

  const components: ConfidenceComponent[] = [
    {
      key: 'gps',
      label: 'GPS verification',
      weight: CONFIDENCE_WEIGHTS.gps,
      ratio: gps.ratio,
      points: 0,
      available: true,
      detail: gps.detail,
    },
    {
      key: 'photos',
      label: 'Photo evidence',
      weight: CONFIDENCE_WEIGHTS.photos,
      ratio: photos.ratio,
      points: 0,
      available: true,
      detail: photos.detail,
    },
    {
      key: 'ocr',
      label: 'OCR readability',
      weight: CONFIDENCE_WEIGHTS.ocr,
      ratio: ocr.ratio,
      points: 0,
      available: input.ocrAvailable && input.ocrConfidences.length > 0,
      detail: ocr.detail,
    },
    {
      key: 'arithmetic',
      label: 'Arithmetic validation',
      weight: CONFIDENCE_WEIGHTS.arithmetic,
      ratio: arithmetic.ratio,
      points: 0,
      available: arithmetic.available,
      detail: arithmetic.detail,
    },
    {
      key: 'timeliness',
      label: 'Submission timeliness',
      weight: CONFIDENCE_WEIGHTS.timeliness,
      ratio: timeliness.ratio,
      points: 0,
      available: true,
      detail: timeliness.detail,
    },
  ]

  // Only evidence that is available is scored. A submission made before the
  // result figures exist is judged on GPS, photos and timeliness; the moment
  // the result is entered the arithmetic component becomes part of the score.
  const availableWeight = components
    .filter((component) => component.available)
    .reduce((sum, component) => sum + component.weight, 0)

  let raw = 0
  for (const component of components) {
    if (!component.available || availableWeight === 0) {
      component.points = 0
      continue
    }
    raw += component.weight * component.ratio
    component.points = Math.round((component.weight * component.ratio * 100) / availableWeight)
  }

  const penalty = input.hasAnomalies ? 15 : 0
  const score = Math.round(
    Math.min(100, Math.max(0, (availableWeight > 0 ? (raw * 100) / availableWeight : 0) - penalty))
  )

  return {
    score,
    breakdown: {
      version: CONFIDENCE_VERSION,
      score,
      available_weight: availableWeight,
      penalty,
      components,
      calculated_at: new Date().toISOString(),
    },
  }
}

/* ------------------------------------------------------------------ database */

type Queryable = Pick<PoolClient, 'query'>

function run<T extends QueryResultRow>(
  client: Queryable | undefined,
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  if (client) return client.query<T>(text, params)
  return query<T>(text, params)
}

async function runOne<T extends QueryResultRow>(
  client: Queryable | undefined,
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await run<T>(client, text, params)
  return result.rows[0] || null
}

interface SubmissionEvidenceRow {
  id: number
  polling_station_id: number
  location_verified: boolean | null
  submitted_lat: number | null
  submitted_lng: number | null
  submitted_at: string | Date
  form_captured_at: string | Date | null
  has_discrepancy: boolean | null
}

interface StationRow {
  latitude: number | null
  longitude: number | null
  location_radius: number | null
}

interface PhotoRow {
  photo_type: string
  ocr_confidence: number | null
  ocr_processed_at: string | Date | null
}

interface ResultRow {
  id: number
  is_valid: boolean | null
  registered_voters: number
  total_votes_cast: number
  valid_votes: number
  rejected_votes: number
}

/**
 * Reconstruct the persisted evidence for one submission and write a fresh
 * score and breakdown. A transaction client can be supplied so the score is
 * updated in the same transaction as the result or review decision that
 * changed the evidence.
 */
export async function recalculateSubmissionConfidence(
  submissionId: number,
  client?: PoolClient
): Promise<ConfidenceResult | null> {
  const submission = await runOne<SubmissionEvidenceRow>(
    client,
    `SELECT id, polling_station_id, location_verified, submitted_lat, submitted_lng,
            submitted_at, form_captured_at, has_discrepancy
       FROM submissions
      WHERE id = $1`,
    [submissionId]
  )

  if (!submission) return null

  const station = await runOne<StationRow>(
    client,
    'SELECT latitude, longitude, location_radius FROM polling_stations WHERE id = $1',
    [submission.polling_station_id]
  )

  const photos = await run<PhotoRow>(
    client,
    `SELECT photo_type, ocr_confidence, ocr_processed_at
       FROM submission_photos
      WHERE submission_id = $1`,
    [submissionId]
  )

  const photoRows = photos.rows
  const ocrRows = photoRows.filter((photo) => photo.ocr_processed_at !== null)

  // Distance is derived from the stored coordinates rather than trusting the
  // boolean alone: a location can be verified while sitting at the edge of the
  // allowed radius, which is weaker evidence than being at the station.
  let locationVerified = submission.location_verified === true
  let distanceMeters: number | null = null

  if (
    station?.latitude !== null &&
    station?.latitude !== undefined &&
    station?.longitude !== null &&
    station?.longitude !== undefined &&
    submission.submitted_lat !== null &&
    submission.submitted_lng !== null
  ) {
    const verification = verifyLocation(
      Number(submission.submitted_lat),
      Number(submission.submitted_lng),
      Number(station.latitude),
      Number(station.longitude),
      station.location_radius ?? 500
    )
    locationVerified = locationVerified || verification.verified
    distanceMeters = verification.distance
  }

  // The most recent result attached to the submission carries the arithmetic
  // decision. No result yet means the score is provisional, not wrong.
  const resultRow = await runOne<ResultRow>(
    client,
    `SELECT id, is_valid, registered_voters, total_votes_cast, valid_votes, rejected_votes
       FROM results
      WHERE submission_id = $1
      ORDER BY id DESC
      LIMIT 1`,
    [submissionId]
  )

  let mathValid: boolean | null = null
  let hasAnomalies = submission.has_discrepancy === true

  if (resultRow) {
    mathValid = resultRow.is_valid === true

    const voteRows = await run<{ votes: number }>(
      client,
      'SELECT votes FROM candidate_votes WHERE result_id = $1',
      [resultRow.id]
    )

    if (voteRows.rows.length > 0) {
      const anomaly = detectAnomalies({
        total_votes_cast: Number(resultRow.total_votes_cast),
        registered_voters: Number(resultRow.registered_voters),
        valid_votes: Number(resultRow.valid_votes),
        rejected_votes: Number(resultRow.rejected_votes),
        candidate_votes: voteRows.rows.map((row) => ({ votes: Number(row.votes) })),
      })
      hasAnomalies = hasAnomalies || anomaly.hasAnomalies
    }
  }

  const computed = computeConfidenceScore({
    locationVerified,
    distanceMeters,
    locationRadiusMeters: station?.location_radius ?? null,
    photoTypes: photoRows.map((photo) => photo.photo_type),
    ocrConfidences: ocrRows
      .map((photo) => photo.ocr_confidence)
      .filter((value): value is number => typeof value === 'number'),
    ocrAvailable: ocrRows.length > 0,
    mathValid,
    submittedAt: submission.submitted_at,
    formCapturedAt: submission.form_captured_at,
    hasAnomalies,
  })

  await run(
    client,
    `UPDATE submissions
        SET confidence_score = $1,
            confidence_breakdown = $2,
            confidence_updated_at = NOW()
      WHERE id = $3`,
    [computed.score, JSON.stringify(computed.breakdown), submissionId]
  )

  return computed
}
