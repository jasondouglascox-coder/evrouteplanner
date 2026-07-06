import { describe, it, expect } from 'vitest'
import { googleMapsUrl, appleMapsUrl, waypointWarning } from '../src/lib/deeplink'
import type { TripStop } from '../src/types'

const stops: TripStop[] = [
  { label: 'Washougal', lat: 45.58, lng: -122.35 },
  { label: 'Baker City EA', lat: 44.77, lng: -117.83, chargerId: '1' },
  { label: 'SLC', lat: 40.76, lng: -111.89 },
]

describe('googleMapsUrl', () => {
  it('encodes origin, destination, and waypoints', () => {
    const u = new URL(googleMapsUrl(stops))
    expect(u.searchParams.get('origin')).toBe('45.58,-122.35')
    expect(u.searchParams.get('destination')).toBe('40.76,-111.89')
    expect(u.searchParams.get('waypoints')).toBe('44.77,-117.83')
    expect(u.searchParams.get('travelmode')).toBe('driving')
  })
  it('omits waypoints when there are only two stops', () => {
    const u = new URL(googleMapsUrl([stops[0], stops[2]]))
    expect(u.searchParams.get('waypoints')).toBeNull()
  })
  it('throws with fewer than two stops', () => {
    expect(() => googleMapsUrl([stops[0]])).toThrow()
  })
})

describe('appleMapsUrl', () => {
  it('chains destinations with +to:', () => {
    const url = appleMapsUrl(stops)
    expect(url).toContain('saddr=45.58,-122.35')
    expect(url).toContain('daddr=44.77,-117.83+to:40.76,-111.89')
  })
})

describe('waypointWarning', () => {
  it('returns null within the limit', () => {
    expect(waypointWarning(stops)).toBeNull()
  })
  it('warns when intermediate stops exceed 9', () => {
    const many: TripStop[] = [{ label: 'o', lat: 0, lng: 0 }]
    for (let i = 0; i < 11; i++) many.push({ label: `w${i}`, lat: i, lng: i })
    many.push({ label: 'd', lat: 99, lng: 99 })
    expect(waypointWarning(many)).toMatch(/up to 9/)
  })
})
