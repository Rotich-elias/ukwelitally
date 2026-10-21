import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { auditRequestContext } from '@/lib/audit'
import {
  importWardsFromCsv,
  importPollingStationsFromCsv,
  previewWardsImport,
  previewPollingStationsImport,
  prunePlaceholderWards,
  findPlaceholderWards,
} from '@/lib/locationAdmin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/locations/import
 *
 * Bulk maintenance of the electoral geography.
 *
 * Form fields:
 *   type        wards | polling_stations | prune_placeholders
 *   file        the CSV file (wards and polling_stations)
 *   dry_run     true to report what would change without writing anything
 *
 * The official IEBC files work as they are:
 *
 *   WARDS.csv            ward_name, constituency_name, county_name, registered_voters
 *   POLLING_STATIONS.csv station_name, station_code, ward_name, constituency_name,
 *                        county_name, latitude, longitude, registered_voters
 *
 * A ward is matched by its code, or by its name inside its constituency, so
 * re-running an import updates the existing rows instead of duplicating them.
 *
 * The dry run reads the file with the same planner the import writes with, so
 * the preview reports the rows that would be created, the rows that would be
 * updated and the rows that would be skipped, with the reason of each one.
 * It only reads: nothing is written.
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

    if (type !== 'wards' && type !== 'polling_stations') {
      return NextResponse.json(
        { error: 'type must be wards, polling_stations or prune_placeholders' },
        { status: 400 }
      )
    }

    const file = form.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'A CSV file is required' }, { status: 400 })
    }

    const text = await file.text()

    if (dryRun) {
      // The preview reads the file with the planner the import writes with.
      // It only reads from the database, nothing is written.
      const preview =
        type === 'wards'
          ? await previewWardsImport(text)
          : await previewPollingStationsImport(text)

      return NextResponse.json({
        success: true,
        dry_run: true,
        message: `${preview.total_rows} row(s) read: ${preview.create} to create, ${preview.update} to update, ${preview.skip} to skip${
          preview.error_rows ? `, ${preview.error_rows} with errors` : ''
        }. Nothing was written.`,
        ...preview,
      })
    }

    const summary =
      type === 'wards'
        ? await importWardsFromCsv(text, actor)
        : await importPollingStationsFromCsv(text, actor)

    return NextResponse.json({
      success: true,
      message: `Import finished: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
      total_rows: summary.created + summary.updated + summary.skipped,
      ...summary,
    })
  } catch (error) {
    console.error('Error importing locations:', error)
    return NextResponse.json({ error: 'Failed to import the locations' }, { status: 500 })
  }
}

export const POST = withAuth(handlePost as any)
