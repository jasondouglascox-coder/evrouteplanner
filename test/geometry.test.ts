import { describe, it, expect } from 'vitest'
import { haversineMeters, metersToMiles, pointToPolyline, samplePolyline } from '../src/lib/geometry'

describe('haversineMeters', () => {
  it('measures ~111.2 km per degree of latitude', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeGreaterThan(110000)
    expect(d).toBeLessThan(112000)
  })
  it('is zero for identical points', () => {
    expect(haversineMeters({ lat: 45, lng: -122 }, { lat: 45, lng: -122 })).toBe(0)
  })
})

describe('metersToMiles', () => {
  it('converts using 1609.344', () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 6)
  })
})

describe('pointToPolyline', () => {
  const poly = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 }, // ~111 km due east
  ]
  it('finds perpendicular detour distance to the segment', () => {
    // point just north of the midpoint of the line
    const r = pointToPolyline({ lat: 0.01, lng: 0.5 }, poly)
    expect(metersToMiles(r.distanceMeters)).toBeGreaterThan(0.5)
    expect(metersToMiles(r.distanceMeters)).toBeLessThan(1.0)
  })
  it('reports along-route position roughly at the midpoint', () => {
    const total = haversineMeters(poly[0], poly[1])
    const r = pointToPolyline({ lat: 0.01, lng: 0.5 }, poly)
    expect(r.alongMeters).toBeGreaterThan(total * 0.4)
    expect(r.alongMeters).toBeLessThan(total * 0.6)
  })
  it('clamps to the first vertex for points before the line', () => {
    const r = pointToPolyline({ lat: 0, lng: -1 }, poly)
    expect(r.alongMeters).toBe(0)
  })
})

describe('samplePolyline', () => {
  it('keeps first and last and adds points at the interval', () => {
    const poly = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ]
    const samples = samplePolyline(poly, 111000) // ~1 degree spacing
    expect(samples[0]).toEqual(poly[0])
    expect(samples[samples.length - 1]).toEqual(poly[2])
    expect(samples.length).toBeGreaterThanOrEqual(3)
  })
})
