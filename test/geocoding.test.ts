import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parsePhoton } from '../src/lib/geocoding'

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/photon.json', import.meta.url)), 'utf-8'),
)

describe('parsePhoton', () => {
  it('builds a readable label and lat/lng', () => {
    const results = parsePhoton(fixture)
    expect(results[0].label).toBe('Washougal, Washington, United States')
    expect(results[0].lat).toBe(45.5829)
    expect(results[0].lng).toBe(-122.3543)
  })
  it('returns one result per feature', () => {
    expect(parsePhoton(fixture).length).toBe(2)
  })
  it('handles empty responses', () => {
    expect(parsePhoton({ features: [] })).toEqual([])
  })
})
