import { describe, expect, it } from 'vitest'
import { MAX_POLL_OPTIONS, parsePollInput } from '@/lib/polls'

/**
 * Poll input validation.
 *
 * The same parser serves the signed-in poll manager and the public,
 * account-free creation endpoint, so these tests describe the rules both
 * routes enforce.
 */

const validBody = {
  title: '  Who will you vote for?  ',
  description: '  A quick opinion poll.  ',
  options: ['  Alpha  ', 'Beta'],
}

describe('parsePollInput', () => {
  it('accepts a valid poll and trims the values', () => {
    const result = parsePollInput(validBody)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.title).toBe('Who will you vote for?')
    expect(result.value.description).toBe('A quick opinion poll.')
    expect(result.value.options).toEqual([
      { label: 'Alpha', description: null },
      { label: 'Beta', description: null },
    ])
    expect(result.value.endsAt).toBeNull()
  })

  it('accepts options as objects with descriptions', () => {
    const result = parsePollInput({
      title: 'Pick one',
      options: [
        { label: 'Alpha', description: ' First choice ' },
        { label: 'Beta' },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.options[0]).toEqual({ label: 'Alpha', description: 'First choice' })
    expect(result.value.options[1]).toEqual({ label: 'Beta', description: null })
  })

  it('rejects a title that is too short or too long', () => {
    expect(parsePollInput({ ...validBody, title: 'ab' }).ok).toBe(false)
    expect(parsePollInput({ ...validBody, title: 'x'.repeat(201) }).ok).toBe(false)
  })

  it('rejects a description over the limit', () => {
    expect(parsePollInput({ ...validBody, description: 'x'.repeat(1001) }).ok).toBe(false)
  })

  it('needs at least two options', () => {
    const result = parsePollInput({ ...validBody, options: ['Only one'] })
    expect(result).toEqual({ ok: false, error: 'A poll needs at least two options' })
  })

  it('rejects more than the maximum number of options', () => {
    const options = Array.from({ length: MAX_POLL_OPTIONS + 1 }, (_, index) => `Option ${index}`)
    expect(parsePollInput({ ...validBody, options }).ok).toBe(false)
  })

  it('rejects empty and oversized option labels', () => {
    expect(parsePollInput({ ...validBody, options: ['Alpha', '   '] }).ok).toBe(false)
    expect(parsePollInput({ ...validBody, options: ['Alpha', 'x'.repeat(121)] }).ok).toBe(false)
  })

  it('rejects duplicate options regardless of case', () => {
    expect(parsePollInput({ ...validBody, options: ['Alpha', ' alpha '] })).toEqual({
      ok: false,
      error: 'Poll options must be unique',
    })
  })

  it('rejects an oversized option description', () => {
    const result = parsePollInput({
      ...validBody,
      options: [{ label: 'Alpha', description: 'x'.repeat(301) }, 'Beta'],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an end date in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(parsePollInput({ ...validBody, ends_at: past }).ok).toBe(false)
  })

  it('rejects an invalid end date', () => {
    expect(parsePollInput({ ...validBody, ends_at: 'not-a-date' }).ok).toBe(false)
  })

  it('accepts an end date in the future', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const result = parsePollInput({ ...validBody, ends_at: future })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.endsAt).toBe(future)
  })

  it('handles a missing or malformed body without throwing', () => {
    expect(parsePollInput(undefined).ok).toBe(false)
    expect(parsePollInput(null).ok).toBe(false)
    expect(parsePollInput({}).ok).toBe(false)
    expect(parsePollInput({ title: 'Valid title', options: 'nope' }).ok).toBe(false)
  })
})
