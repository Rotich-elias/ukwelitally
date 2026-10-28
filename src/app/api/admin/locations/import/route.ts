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
 *   dry_run     true to report what would change without writing anything
 *
 * The polling-station file must carry the eight official IEBC columns:
 *
 *   County, Constituency, Ward, IEBC Code, Polling Station, Stream,
 *   Registration Centre, Registered Voters
 *
 * A station is matched by its IEBC code and its stream, then by its name
 * inside its ward, so the values a row leaves out can be taken from the record
 * that already exists. The file is then a replacement: every existing polling
 * station, together with the agents, volunteers and submissions attached to
 * it, is deleted before the rows of the file are written. A station the
 * platform does not have is created, and so is a missing ward, constituency or
 * county: the import creates the hierarchy from the county down before it
 * writes the station. A level that already exists is matched by name and keeps
 * its code.
 *
 * The dry run reads the file with the same planner the import writes with, so
 * the preview reports the rows that would be created and the rows that would
 * be skipped, with the reason of each one, and how many existing stations the
 * import would delete. It only reads: nothing is written.
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
      const preview = await previewPollingStationsImport(text)

      return NextResponse.json({
        success: true,
        dry_run: true,
        message: `${preview.total_rows} row(s) read: ${preview.create ?? 0} to create, ${
          preview.skip
        } to skip${
          preview.error_rows ? ` (${preview.error_rows} with errors)` : ''
        }; ${preview.deleted ?? 0} existing station(s) will be deleted. Nothing was written.`,
        ...preview,
      })
    }

    // The import replaces the polling stations in one transaction and rolls
    // the parent voter totals up once, just before it commits.
    const summary = await importPollingStationsFromCsv(text, actor)

    return NextResponse.json({
      success: true,
      message: `Import finished: ${summary.deleted ?? 0} station(s) deleted, ${
        summary.created
      } created, ${summary.skipped} skipped`,
      total_rows: summary.created + summary.skipped,
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
