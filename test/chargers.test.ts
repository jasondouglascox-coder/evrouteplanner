import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapPoi, filterChargers, dedupeChargers, type OcmPoi } from '../src/lib/chargers'

const fixture: OcmPoi[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/ocm-sample.json', import.meta.url)), 'utf-8'),
)

describe('mapPoi', () => {
  it('takes the max connector power', () => {
    const c = mapPoi(fixture[0])
    expect(c.maxPowerKw).toBe(350)
    expect(c.network).toBe('Electrify America')
    expect(c.id).toBe('101')
  })
})

describe('filterChargers', () => {
  it('keeps only EA stations at or above min power', () => {
    const result = filterChargers(fixture, { networkContains: 'Electrify America', minPowerKw: 350 })
    // fixture EA >=350: ID 101 (twice); excludes EVgo (102) and EA-150 (103)
    expect(result.every((c) => c.network === 'Electrify America')).toBe(true)
    expect(result.every((c) => c.maxPowerKw >= 350)).toBe(true)
    expect(result.some((c) => c.id === '102')).toBe(false)
    expect(result.some((c) => c.id === '103')).toBe(false)
  })
})

describe('dedupeChargers', () => {
  it('removes duplicate ids', () => {
    const filtered = filterChargers(fixture, { networkContains: 'Electrify America', minPowerKw: 350 })
    const deduped = dedupeChargers(filtered)
    expect(deduped.filter((c) => c.id === '101').length).toBe(1)
  })
})
