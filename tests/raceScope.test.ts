import { describe, expect, it } from 'vitest'
import {
  buildRaceScope,
  normalizeRacePosition,
  positionLabel,
} from '@/lib/raceScope'

/**
 * The race scope behind the dashboard result snippet.
 *
 * An agent belongs to the race of the candidate they are assigned to, and an
 * observer belongs to the race they selected at their station. The area is
 * always the race's area, never the whole country unless the race is
 * presidential.
 */

describe('positionLabel', () => {
  it('names the races in the interface wording', () => {
    expect(positionLabel('president')).toBe('Presidential')
    expect(positionLabel('governor')).toBe('Governor')
    expect(positionLabel('senator')).toBe('Senator')
    expect(positionLabel('women_rep')).toBe('Women Representative')
    expect(positionLabel('mp')).toBe('Member of Parliament')
    expect(positionLabel('mca')).toBe('Member of County Assembly')
  })
})

describe('normalizeRacePosition', () => {
  it('accepts known races and rejects anything else', () => {
    expect(normalizeRacePosition('mp')).toBe('mp')
    expect(normalizeRacePosition('women_rep')).toBe('women_rep')
    expect(normalizeRacePosition('mayor')).toBeNull()
    expect(normalizeRacePosition('')).toBeNull()
    expect(normalizeRacePosition(null)).toBeNull()
  })
})

describe('buildRaceScope', () => {
  it('scopes a member of county assembly to their ward', () => {
    const scope = buildRaceScope({
      position: 'mca',
      county_id: 1,
      constituency_id: 2,
      ward_id: 5,
      county_name: 'County One',
      constituency_name: 'Constituency Two',
      ward_name: 'Ward Five',
    })

    expect(scope).toMatchObject({
      position: 'mca',
      position_label: 'Member of County Assembly',
      level: 'ward',
      area_name: 'Ward Five',
      county_id: 1,
      constituency_id: 2,
      ward_id: 5,
      candidate_name: null,
    })
  })

  it('scopes a member of parliament to their constituency', () => {
    const scope = buildRaceScope({
      position: 'mp',
      county_id: 1,
      constituency_id: 2,
      ward_id: null,
      constituency_name: 'Constituency Two',
    })

    expect(scope.level).toBe('constituency')
    expect(scope.area_name).toBe('Constituency Two')
    expect(scope.ward_id).toBeNull()
  })

  it('scopes county races to the county', () => {
    for (const position of ['governor', 'senator', 'women_rep']) {
      const scope = buildRaceScope({
        position,
        county_id: 1,
        county_name: 'County One',
      })

      expect(scope.level).toBe('county')
      expect(scope.area_name).toBe('County One')
    }
  })

  it('scopes a presidential race nationally', () => {
    const scope = buildRaceScope({
      position: 'president',
      county_id: 1,
      constituency_id: 2,
      ward_id: 5,
      ward_name: 'Ward Five',
    })

    expect(scope.level).toBe('national')
    expect(scope.area_name).toBe('National')
  })

  it('keeps the candidate name for an agent snippet', () => {
    const scope = buildRaceScope({
      position: 'mp',
      constituency_id: 2,
      constituency_name: 'Constituency Two',
      candidate_name: '  Jane Wanjiku  ',
    })

    expect(scope.candidate_name).toBe('Jane Wanjiku')
  })

  it('falls back to a readable area when the names are missing', () => {
    expect(buildRaceScope({ position: 'mca' }).area_name).toBe('Ward')
    expect(buildRaceScope({ position: 'mp' }).area_name).toBe('Constituency')
    expect(buildRaceScope({ position: 'governor' }).area_name).toBe('County')
  })
})
