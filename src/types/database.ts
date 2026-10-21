// TypeScript types matching the database schema

export type UserRole = 'candidate' | 'agent' | 'observer' | 'admin'
export type Position = 'president' | 'governor' | 'senator' | 'women_rep' | 'mp' | 'mca'
export type SubmissionType = 'primary' | 'backup' | 'public'
export type SubmissionStatus = 'pending' | 'verified' | 'flagged' | 'rejected'
/** Who produced a submission. Observers never produce a primary result. */
export type SubmissionOrigin = 'agent' | 'observer' | 'admin'
/** Review state of an observer submission. */
export type ReviewStatus = 'pending_review' | 'approved_fallback' | 'rejected_fallback'
/** Which kind of result is selected for a station and position. */
export type SelectedResultSource = 'agent_primary' | 'observer_fallback'
/** Purchased access of a candidate, independent of the login account. */
export type CandidateAccessStatus = 'active' | 'suspended' | 'revoked'
/** State of a candidate controlled reporting window. */
export type SubmissionWindowStatus = 'closed' | 'open' | 'scheduled'
/** State of a reporting window once the server clock is applied. */
export type ReportingWindowState = 'closed' | 'open' | 'scheduled' | 'expired'
export type PhotoType = 'full_form' | 'closeup' | 'signature' | 'stamp' | 'serial_number' | 'other'
export type DiscrepancyType = 'agent_vs_backup' | 'vs_iebc' | 'statistical_anomaly' | 'location_mismatch'
export type DiscrepancyStatus = 'open' | 'investigating' | 'resolved' | 'confirmed_error'
export type NotificationType = 'info' | 'warning' | 'error' | 'success'
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded' | 'waived'

export interface User {
  id: number
  email: string
  phone: string
  password_hash: string
  full_name: string
  role: UserRole
  id_number: string
  verified: boolean
  active: boolean
  created_at: Date
  updated_at: Date
}

export interface Candidate {
  id: number
  // Nullable since migration 003: ballot candidates have no user account.
  user_id: number | null
  position: Position
  party_name: string | null
  party_abbreviation: string | null
  constituency_id: number | null
  county_id: number | null
  ward_id: number | null
  // Ballot candidate name. Set for non-system candidates.
  full_name: string | null
  // True when the candidate owns/uses a system account.
  is_system_user: boolean | null
  // True for internal observer placeholder candidates. Never a ballot entry.
  is_placeholder: boolean
  // e.g. 'CAND-2026-00001'. Not unique: see migration 015.
  candidate_number: string | null
  // Ballot candidates can be archived instead of deleted.
  archived: boolean
  profile_photo: string | null
  // Purchased access entitlement. Independent of users.active and of the
  // candidate controlled reporting window.
  access_status: CandidateAccessStatus
  payment_status: PaymentStatus | null
  // Total paid so far (kept in sync by the payment endpoint).
  payment_amount: number | null
  // Full/expected payment amount for this candidate.
  expected_payment_amount: number | null
  payment_date: Date | null
  payment_reference: string | null
  payment_notes: string | null
  created_at: Date | null
  updated_at: Date | null
}

export interface Agent {
  id: number
  user_id: number
  candidate_id: number
  polling_station_id: number | null
  is_primary: boolean
  device_id: string | null
  last_location_lat: number | null
  last_location_lng: number | null
  last_seen_at: Date | null
  created_at: Date
}

export interface County {
  id: number
  name: string
  code: string
  registered_voters: number
  created_at: Date
}

export interface Constituency {
  id: number
  county_id: number
  name: string
  code: string
  registered_voters: number
  created_at: Date
}

export interface Ward {
  id: number
  constituency_id: number
  county_id: number
  name: string
  code: string
  registered_voters: number
  created_at: Date
}

export interface PollingStation {
  id: number
  ward_id: number
  constituency_id: number
  county_id: number
  name: string
  code: string
  registered_voters: number
  latitude: number | null
  longitude: number | null
  location_radius: number
  created_at: Date
}

export interface Submission {
  id: number
  polling_station_id: number
  user_id: number
  candidate_id: number
  submission_type: SubmissionType
  status: SubmissionStatus
  // Who produced the submission.
  submission_origin: SubmissionOrigin
  // Review state of an observer submission.
  review_status: ReviewStatus | null
  review_reason: string | null
  reviewed_by: number | null
  reviewed_at: Date | null
  // The candidate whose reporting window authorised this submission.
  scope_candidate_id: number | null
  // Versioned corrections. The original submission is kept, never replaced.
  supersedes_submission_id: number | null
  superseded_by_submission_id: number | null
  revision_number: number
  revision_reason: string | null
  submitted_lat: number | null
  submitted_lng: number | null
  location_verified: boolean
  form_captured_at: Date | null
  submitted_at: Date
  verified_at: Date | null
  device_id: string | null
  device_type: string | null
  ip_address: string | null
  confidence_score: number
  has_discrepancy: boolean
  flagged_reason: string | null
  created_at: Date
  updated_at: Date
}

export interface SubmissionWindow {
  id: number
  candidate_id: number
  position: Position | null
  status: SubmissionWindowStatus
  opens_at: Date | null
  closes_at: Date | null
  opened_by: number | null
  opened_at: Date | null
  closed_by: number | null
  closed_at: Date | null
  schedule_cancelled_at: Date | null
  schedule_cancelled_by: number | null
  created_at: Date
  updated_at: Date
}

export interface SelectedResult {
  id: number
  polling_station_id: number
  position: Position
  submission_id: number
  source: SelectedResultSource
  approved_by: number | null
  approved_at: Date | null
  created_at: Date
}

export interface SubmissionPhoto {
  id: number
  submission_id: number
  photo_type: PhotoType
  file_path: string
  file_size: number | null
  mime_type: string | null
  width: number | null
  height: number | null
  exif_data: Record<string, any> | null
  hash: string | null
  created_at: Date
}

export interface Result {
  id: number
  submission_id: number
  polling_station_id: number
  position: Position
  registered_voters: number
  total_votes_cast: number
  valid_votes: number
  rejected_votes: number
  is_valid: boolean
  validation_errors: Record<string, any> | null
  ocr_confidence: number
  manually_verified: boolean
  created_at: Date
  updated_at: Date
}

export interface CandidateVote {
  id: number
  result_id: number
  candidate_name: string
  party_name: string | null
  votes: number
  created_at: Date
}

export interface AuditLog {
  id: number
  user_id: number | null
  action: string
  entity_type: string
  entity_id: number | null
  // Ids affected by a bulk operation, stored as a JSON array.
  entity_ids: number[] | null
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  ip_address: string | null
  user_agent: string | null
  created_at: Date
}

export interface Discrepancy {
  id: number
  polling_station_id: number
  position: Position
  primary_submission_id: number | null
  backup_submission_id: number | null
  discrepancy_type: DiscrepancyType
  variance_percentage: number | null
  details: Record<string, any> | null
  status: DiscrepancyStatus
  resolved_by: number | null
  resolved_at: Date | null
  resolution_notes: string | null
  created_at: Date
}

export interface IEBCResult {
  id: number
  polling_station_id: number
  position: Position
  candidate_name: string
  votes: number
  published_at: Date | null
  source_url: string | null
  created_at: Date
}

export interface Notification {
  id: number
  user_id: number
  title: string
  message: string
  type: NotificationType
  related_entity_type: string | null
  related_entity_id: number | null
  read: boolean
  sent_at: Date
}

// DTO types for API requests/responses

export interface RegisterUserDTO {
  email: string
  phone: string
  password: string
  full_name: string
  role: UserRole
  id_number: string
}

export interface LoginDTO {
  email: string
  password: string
}

export interface CreateSubmissionDTO {
  polling_station_id: number
  candidate_id: number
  submission_type: SubmissionType
  submitted_lat?: number
  submitted_lng?: number
  form_captured_at?: Date
  device_id?: string
  device_type?: string
}

export interface CreateResultDTO {
  submission_id: number
  position: Position
  registered_voters: number
  total_votes_cast: number
  valid_votes: number
  rejected_votes: number
  candidate_votes: Array<{
    candidate_name: string
    party_name?: string
    votes: number
  }>
  manually_verified: boolean
}

export interface PollingStationResultsDTO {
  polling_station: PollingStation
  ward: Ward
  constituency: Constituency
  county: County
  submissions: Array<{
    submission: Submission
    results: Array<{
      result: Result
      votes: CandidateVote[]
    }>
    photos: SubmissionPhoto[]
  }>
}

// Aggregated result types

export interface AggregatedResult {
  position: Position
  level: 'station' | 'ward' | 'constituency' | 'county' | 'national'
  location_id: number
  location_name: string
  candidate_votes: Array<{
    candidate_name: string
    party_name: string | null
    total_votes: number
    percentage: number
  }>
  total_registered_voters: number
  total_votes_cast: number
  total_valid_votes: number
  total_rejected_votes: number
  turnout_percentage: number
  stations_reporting: number
  total_stations: number
}

// Auth types

export interface AuthUser {
  id: number
  email: string
  phone: string
  full_name: string
  role: UserRole
  verified: boolean
}

export interface JWTPayload {
  userId: number
  email: string
  role: UserRole
}
