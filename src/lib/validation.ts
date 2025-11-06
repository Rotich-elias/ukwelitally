import { z } from 'zod'
import { UserRole, Position, SubmissionType } from '@/types/database'

// User registration schema
export const registerUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^(\+254|0)(7|1)\d{8}$/, 'Invalid Kenyan phone number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  full_name: z.string().min(2, 'Full name is required'),
  role: z.enum(['candidate', 'agent', 'observer', 'admin']),
  id_number: z.string().regex(/^\d{7,8}$/, 'Invalid ID number'),
})

// Login schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

// Create submission schema
export const createSubmissionSchema = z.object({
  polling_station_id: z.number().int().positive(),
  candidate_id: z.number().int().positive(),
  submission_type: z.enum(['primary', 'backup', 'public']),
  submitted_lat: z.number().min(-90).max(90).optional(),
  submitted_lng: z.number().min(-180).max(180).optional(),
  form_captured_at: z.string().datetime().optional(),
  device_id: z.string().optional(),
  device_type: z.string().optional(),
})

// Create result schema
export const createResultSchema = z.object({
  submission_id: z.number().int().positive(),
  position: z.enum(['president', 'governor', 'senator', 'mp', 'mca']),
  registered_voters: z.number().int().min(0),
  total_votes_cast: z.number().int().min(0),
  valid_votes: z.number().int().min(0),
  rejected_votes: z.number().int().min(0),
  candidate_votes: z.array(
    z.object({
      candidate_name: z.string().min(1),
      party_name: z.string().optional(),
      votes: z.number().int().min(0),
    })
  ),
  manually_verified: z.boolean(),
})

// GPS coordinates schema
export const gpsCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

// Validation errors interface
export interface ValidationErrors {
  [key: string]: string[]
}

// Calculate distance between two GPS coordinates (Haversine formula)
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3 // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

// Verify location is within acceptable radius of polling station
export function verifyLocation(
  submittedLat: number,
  submittedLng: number,
  stationLat: number,
  stationLng: number,
  maxRadius: number = 500 // meters
): { verified: boolean; distance: number } {
  const distance = calculateDistance(
    submittedLat,
    submittedLng,
    stationLat,
    stationLng
  )

  return {
    verified: distance <= maxRadius,
    distance: Math.round(distance),
  }
}

// Validate vote counts make mathematical sense
export function validateVoteCounts(data: {
  registered_voters: number
  total_votes_cast: number
  valid_votes: number
  rejected_votes: number
  candidate_votes: Array<{ votes: number }>
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Total votes cast should not exceed registered voters
  if (data.total_votes_cast > data.registered_voters) {
    errors.push(
      `Total votes cast (${data.total_votes_cast}) exceeds registered voters (${data.registered_voters})`
    )
  }

  // Valid + rejected should equal total cast
  const sumValidRejected = data.valid_votes + data.rejected_votes
  if (sumValidRejected !== data.total_votes_cast) {
    errors.push(
      `Valid votes (${data.valid_votes}) + Rejected votes (${data.rejected_votes}) = ${sumValidRejected} does not equal Total votes cast (${data.total_votes_cast})`
    )
  }

  // Sum of candidate votes should equal valid votes
  const sumCandidateVotes = data.candidate_votes.reduce(
    (sum, cv) => sum + cv.votes,
    0
  )
  if (sumCandidateVotes !== data.valid_votes) {
    errors.push(
      `Sum of candidate votes (${sumCandidateVotes}) does not equal valid votes (${data.valid_votes})`
    )
  }

  // All vote counts should be non-negative
  if (data.registered_voters < 0) errors.push('Registered voters cannot be negative')
  if (data.total_votes_cast < 0) errors.push('Total votes cast cannot be negative')
  if (data.valid_votes < 0) errors.push('Valid votes cannot be negative')
  if (data.rejected_votes < 0) errors.push('Rejected votes cannot be negative')

  data.candidate_votes.forEach((cv, index) => {
    if (cv.votes < 0) {
      errors.push(`Candidate ${index + 1} votes cannot be negative`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}

// Calculate confidence score for a submission
export function calculateConfidenceScore(params: {
  locationVerified: boolean
  distance: number
  photoCount: number
  hasAllRequiredPhotos: boolean
  mathValid: boolean
  submittedWithinHours: number
  historicalMatch: boolean
}): number {
  let score = 0

  // GPS accuracy (20%)
  if (params.locationVerified) {
    if (params.distance <= 100) score += 20
    else if (params.distance <= 300) score += 15
    else if (params.distance <= 500) score += 10
  }

  // Photo quality (30%)
  if (params.hasAllRequiredPhotos) {
    score += 20
  }
  if (params.photoCount >= 3) {
    score += 10
  } else if (params.photoCount >= 2) {
    score += 5
  }

  // Math validation (20%)
  if (params.mathValid) {
    score += 20
  }

  // Timely submission (15%)
  if (params.submittedWithinHours <= 2) {
    score += 15
  } else if (params.submittedWithinHours <= 6) {
    score += 10
  } else if (params.submittedWithinHours <= 12) {
    score += 5
  }

  // Historical pattern match (15%)
  if (params.historicalMatch) {
    score += 15
  }

  return Math.min(100, Math.max(0, score))
}

// Detect statistical anomalies
export function detectAnomalies(data: {
  total_votes_cast: number
  registered_voters: number
  valid_votes: number
  rejected_votes: number
  candidate_votes: Array<{ votes: number }>
}): { hasAnomalies: boolean; flags: string[] } {
  const flags: string[] = []

  // Unusually high turnout (> 95%)
  const turnout = (data.total_votes_cast / data.registered_voters) * 100
  if (turnout > 95) {
    flags.push(`Unusually high turnout: ${turnout.toFixed(1)}%`)
  }

  // Unusually high rejection rate (> 10%)
  const rejectionRate = (data.rejected_votes / data.total_votes_cast) * 100
  if (rejectionRate > 10) {
    flags.push(`High rejection rate: ${rejectionRate.toFixed(1)}%`)
  }

  // One candidate has > 90% of votes
  const maxVotes = Math.max(...data.candidate_votes.map((cv) => cv.votes))
  const maxPercentage = (maxVotes / data.valid_votes) * 100
  if (maxPercentage > 90) {
    flags.push(`One candidate has ${maxPercentage.toFixed(1)}% of votes`)
  }

  // Very low turnout (< 20%)
  if (turnout < 20) {
    flags.push(`Unusually low turnout: ${turnout.toFixed(1)}%`)
  }

  return {
    hasAnomalies: flags.length > 0,
    flags,
  }
}

// Calculate variance between two result sets
export function calculateVariance(
  result1: { candidate_votes: Array<{ candidate_name: string; votes: number }> },
  result2: { candidate_votes: Array<{ candidate_name: string; votes: number }> }
): { percentage: number; details: Array<{ candidate: string; diff: number }> } {
  const details: Array<{ candidate: string; diff: number }> = []
  let totalDiff = 0
  let totalVotes = 0

  // Compare each candidate's votes
  result1.candidate_votes.forEach((cv1) => {
    const cv2 = result2.candidate_votes.find(
      (c) => c.candidate_name === cv1.candidate_name
    )
    if (cv2) {
      const diff = Math.abs(cv1.votes - cv2.votes)
      details.push({ candidate: cv1.candidate_name, diff })
      totalDiff += diff
      totalVotes += cv1.votes
    }
  })

  const percentage = totalVotes > 0 ? (totalDiff / totalVotes) * 100 : 0

  return { percentage, details }
}
