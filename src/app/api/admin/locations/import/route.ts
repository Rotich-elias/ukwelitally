import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { auditRequestContext } from '@/lib/audit'
import {
  importPollingStationsFromCsv,
  previewPollingStationsImport,
  prunePlaceholderWards,
  findPlaceholderWards,
  missingStationHeaders,
  LocationError,
} from '@/lib/locationAdmin'

export const dynamic = 'force-dynamic'
// A national file is planned and written in bulk, but still needs more than
// the platform's default function duration. 60s is accepted on every Vercel
// plan (the larger limits are plan specific).
export const maxDuration = 60

/** The header of the official IEBC polling-station file. */
const REQUIRED_HEADER =
  'County, Constituency, Ward, IEBC Code, Polling Station, Stream, Registration Centre, Registered Voters'

/**
 * POST /api/admin/locations/import
 *
 * Bulk maintenance of the electoral geography.
 *
 * Form fields:
 *   type        polling_stations | prune_placeholders
 *   file        the CSV file (polling_stations)
 *   mode        update | replace (polling_stations, defaults to update)
 *   county_id   the county a replacement is limited to (required for replace)
 *   dry_run     true to report what would change without writing anything
 *
 * The polling-station file must carry the eight official IEBC columns:
 *
 *   County, Constituency, Ward, IEBC Code, Polling Station, Stream,
 *   Registration Centre, Registered Voters
 *
 * A station is matched by its IEBC code and its stream, then by its name
 * inside its ward, so the values a row leaves out can be taken from the record
 * that already exists. In `update` mode the matched station is updated in
 * place, so its agents, volunteers, submissions and results are kept; rows
 * that do not match create new stations. In `replace` mode the polling
 * stations of the chosen county, together with the agents, volunteers and
 * submissions attached to them, are deleted before the rows of that county are
 * written. Rows of other counties are ignored, and the stations of other
 * counties are left untouched. A
 * station the platform does not have is created, and so is a missing ward,
 * constituency or county: the import creates the hierarchy from the county down
 * before it writes the station. A level that already exists is matched by name
 * and keeps its code.
 *
 * The dry run reads the file with the same planner the import writes with, so
 * the preview reports the rows that would be created, updated or skipped, with
 * the reason of each one, and how many existing stations a replacement would
 * delete. It only reads: nothing is written.
 */
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 })
    }

    const form = await req.formData()
    const type = String(form.get('type') || '')
    const dryRun = String(form.get('dry_run') || 'false') === 'true'
    const requestedMode = String(form.get('mode') || 'update').toLowerCase()
    if (requestedMode !== 'update' && requestedMode !== 'replace') {
      return NextResponse.json(
        { error: 'mode must be update or replace' },
        { status: 400 }
      )
    }
    const mode = requestedMode as 'update' | 'replace'
    const countyRaw = String(form.get('county_id') || '').trim()
    const countyId = countyRaw ? Number(countyRaw) : undefined
    if (mode === 'replace' && (countyId === undefined || !Number.isInteger(countyId))) {
      return NextResponse.json(
        { error: 'Choose the county to replace. A replacement is limited to one county.' },
        { status: 400 }
      )
    }
    const { ipAddress } = auditRequestContext(req)
    const actor = { userId: user.userId, ipAddress }

    if (type === 'prune_placeholders') {
      if (dryRun) {
        const candidates = await findPlaceholderWards()
        const preview = await prunePlaceholderWards(actor, true)
        return NextResponse.json({
          success: true,
          dry_run: true,
          message: `${candidates.length} placeholder ward(s) found`,
          ...preview,
        })
      }

      const result = await prunePlaceholderWards(actor, false)
      return NextResponse.json({
        success: true,
        message: `${result.removed} placeholder ward(s) removed`,
        ...result,
      })
    }

    if (type !== 'polling_stations') {
      return NextResponse.json(
        { error: 'type must be polling_stations or prune_placeholders' },
        { status: 400 }
      )
    }

    const file = form.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'A CSV file is required' }, { status: 400 })
    }

    const text = await file.text()

    const missing = missingStationHeaders(text)
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `The polling station file is missing the column(s) ${missing.join(
            ', '
          )}. The file must have the columns: ${REQUIRED_HEADER}`,
          missing_columns: missing,
          required_columns: REQUIRED_HEADER,
        },
        { status: 400 }
      )
    }

    if (dryRun) {
      // The preview reads the file with the planner the import writes with.
      // It only reads from the database, nothing is written.
      const preview = await previewPollingStationsImport(text, mode, countyId)

      return NextResponse.json({
        success: true,
        dry_run: true,
        mode,
        message: `${preview.total_rows} row(s) read: ${preview.create ?? 0} to create, ${
          preview.update ?? 0
        } to update, ${preview.skip} to skip${
          preview.error_rows ? ` (${preview.error_rows} with errors)` : ''
        }${
          preview.county_name
            ? `; ${preview.deleted ?? 0} existing station(s) in ${preview.county_name} will be deleted${
                preview.outside_county
                  ? ` and ${preview.outside_county} row(s) of other counties will be ignored`
                  : ''
              }`
            : ''
        }. Nothing was written.`,
        ...preview,
      })
    }

    // The import writes the polling stations in one transaction and rolls the
    // parent voter totals up once, just before it commits.
    const summary = await importPollingStationsFromCsv(text, actor, mode, countyId)

    return NextResponse.json({
      success: true,
      mode,
      message: `Import finished${
        summary.county_name ? ` for ${summary.county_name}` : ''
      }: ${summary.deleted ?? 0} station(s) deleted, ${
        summary.created
      } created, ${summary.updated} updated, ${summary.skipped} skipped${
        summary.outside_county
          ? `, ${summary.outside_county} row(s) of other counties ignored`
          : ''
      }`,
      total_rows: summary.created + summary.updated + summary.skipped,
      ...summary,
    })
  } catch (error) {
    console.error('Error importing locations:', error)

    if (error instanceof LocationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Failed to import the locations' }, { status: 500 })
  }
}

export const POST = withAuth(handlePost as any)
