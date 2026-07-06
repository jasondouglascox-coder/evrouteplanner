import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseOrsGeoJson } from '../src/lib/routing'

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/ors-route.json', import.meta.url)), 'utf-8'),
)

describe('parseOrsGeoJson', () => {
  it('decodes coordinates as lat/lng', () => {
    const route = parseOrsGeoJson(fixture)
    expect(route.coordinates[0]).toEqual({ lat: 45.58, lng: -122.35 })
    expect(route.coordinates.length).toBe(3)
  })
  it('maps each segment to a leg distance', () => {
    const route = parseOrsGeoJson(fixture)
    expect(route.legs.map((l) => l.distanceMeters)).toEqual([154800.0, 212300.0])
  })
  it('reads the total distance from the summary', () => {
    const route = parseOrsGeoJson(fixture)
    expect(route.totalMeters).toBe(367100.0)
  })
  it('throws when there is no route feature', () => {
    expect(() => parseOrsGeoJson({ features: [] })).toThrow()
  })
})
