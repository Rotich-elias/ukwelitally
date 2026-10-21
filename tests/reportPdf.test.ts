import { describe, it, expect } from 'vitest'
import {
  buildElectionReportPdf,
  buildReportFileName,
  positionLabel,
  type ElectionReportData,
} from '@/lib/reportPdf'

const data: ElectionReportData = {
  profile: {
    full_name: 'Grace Wanjiku Kariuki',
    party_name: 'ODM',
    position: 'women_rep',
    electoral_area: 'Nairobi County 047',
  },
  summary: {
    total_votes_cast: 51230,
    registered_voters: 88400,
    rejected_votes: 612,
    turnout_percentage: 58.6,
    total_stations: 32,
    stations_reported: 30,
    reporting_percentage: 93.8,
  },
  results: [
    { candidate_name: 'Grace Wanjiku Kariuki', party_name: 'ODM', total_votes: 21000, percentage: 41.2 },
    { candidate_name: 'Jane Muthoni Kariuki', party_name: 'UDA', total_votes: 18000, percentage: 35.3 },
  ],
}

describe('positionLabel', () => {
  it('uses the readable label for known positions', () => {
    expect(positionLabel('mp')).toBe('Member of Parliament')
    expect(positionLabel('women_rep')).toBe('Women Representative')
    expect(positionLabel('mca')).toBe('Member of County Assembly')
  })

  it('falls back to a readable form for unknown positions', () => {
    expect(positionLabel('member_of_parliament')).toBe('Member of Parliament')
    expect(positionLabel('governor')).toBe('Governor')
  })
})

describe('buildReportFileName', () => {
  it('produces a pdf file name without spaces', () => {
    const name = buildReportFileName(data.profile)

    expect(name).toMatch(/^Election_Report_.*\.pdf$/)
    expect(name).not.toMatch(/\s/)
  })
})

describe('buildElectionReportPdf', () => {
  it('renders a pdf document with a page for the report', async () => {
    const doc = await buildElectionReportPdf(data)
    const output = Buffer.from(doc.output('arraybuffer'))

    expect(output.subarray(0, 5).toString()).toBe('%PDF-')
    expect(output.length).toBeGreaterThan(1000)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('still produces a report when there are no results yet', async () => {
    const doc = await buildElectionReportPdf({ ...data, results: [] })
    const output = Buffer.from(doc.output('arraybuffer'))

    expect(output.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
