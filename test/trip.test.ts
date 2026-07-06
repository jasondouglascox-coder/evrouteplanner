import { describe, it, expect } from 'vitest'
import { orderStops, perLegMiles, gapFromLastGreenMeters, type OrderedIntermediate } from '../src/lib/trip'
import type { GeoResult, Route } from '../src/types'

const origin: GeoResult = { label: 'Washougal', lat: 45.58, lng: -122.35 }
const dest: GeoResult = { label: 'SLC', lat: 40.76, lng: -111.89 }

const intermediates: OrderedIntermediate[] = [
  { label: 'Twin Falls', lat: 42.56, lng: -114.46, chargerId: 'b', routePositionMeters: 500000 },
  { label: 'Baker City', lat: 44.77, lng: -117.83, chargerId: 'a', routePositionMeters: 250000 },
]

describe('orderStops', () => {
  it('orders intermediates by along-route position between origin and destination', () => {
    const stops = orderStops(origin, dest, intermediates)
    expect(stops.map((s) => s.label)).toEqual(['Washougal', 'Baker City', 'Twin Falls', 'SLC'])
    expect(stops[0].chargerId).toBeUndefined()
    expect(stops[1].chargerId).toBe('a')
    expect(stops[stops.length - 1].chargerId).toBeUndefined()
  })

  it('interleaves manual stops and chargers by route position', () => {
    const mixed: OrderedIntermediate[] = [
      { label: 'Charger', lat: 1, lng: 1, chargerId: 'c1', routePositionMeters: 300000 },
      { label: 'Tacoma', lat: 2, lng: 2, routePositionMeters: 100000 },
    ]
    const stops = orderStops(origin, dest, mixed)
    expect(stops.map((s) => s.label)).toEqual(['Washougal', 'Tacoma', 'Charger', 'SLC'])
    expect(stops[1].chargerId).toBeUndefined() // manual stop
    expect(stops[2].chargerId).toBe('c1') // charger
  })
})

describe('perLegMiles', () => {
  it('converts each leg distance to miles', () => {
    const route: Route = {
      coordinates: [],
      legs: [{ distanceMeters: 160934.4 }, { distanceMeters: 321868.8 }],
      totalMeters: 482803.2,
    }
    expect(perLegMiles(route)).toEqual([100, 200])
  })
})

describe('gapFromLastGreenMeters', () => {
  const cs = [
    { id: 'a', routePositionMeters: 100 },
    { id: 'b', routePositionMeters: 250 },
    { id: 'c', routePositionMeters: 400 },
  ]

  it('measures from the origin (position 0) when nothing is selected', () => {
    const g = gapFromLastGreenMeters(cs, new Set())
    expect(g).toEqual({ a: 100, b: 250, c: 400 })
  })

  it('measures each charger from the last selected (green) charger before it', () => {
    const g = gapFromLastGreenMeters(cs, new Set(['b']))
    expect(g.a).toBe(100) // still from origin (before b)
    expect(g.b).toBe(250) // b measured from origin (leg to reach it)
    expect(g.c).toBe(150) // c measured from b (400 - 250)
  })

  it('a selected charger reports the leg length from the prior green point', () => {
    const g = gapFromLastGreenMeters(cs, new Set(['a', 'c']))
    expect(g.a).toBe(100) // from origin
    expect(g.b).toBe(150) // b (unselected) from a
    expect(g.c).toBe(300) // c from a (400 - 100), since b is not green
  })
})
