import { describe, it, expect } from 'vitest'
import { orderStops, perLegMiles, gapFromLastGreenMeters } from '../src/lib/trip'
import type { AnnotatedCharger, GeoResult, Route } from '../src/types'

const origin: GeoResult = { label: 'Washougal', lat: 45.58, lng: -122.35 }
const dest: GeoResult = { label: 'SLC', lat: 40.76, lng: -111.89 }

const chargers: AnnotatedCharger[] = [
  { id: 'b', name: 'Twin Falls', network: 'Electrify America', operatorId: 3318, maxPowerKw: 350, lat: 42.56, lng: -114.46, detourMiles: 0.3, routePositionMeters: 500000 },
  { id: 'a', name: 'Baker City', network: 'Electrify America', operatorId: 3318, maxPowerKw: 350, lat: 44.77, lng: -117.83, detourMiles: 1.1, routePositionMeters: 250000 },
]

describe('orderStops', () => {
  it('orders chosen chargers by along-route position between origin and destination', () => {
    const stops = orderStops(origin, dest, chargers)
    expect(stops.map((s) => s.label)).toEqual(['Washougal', 'Baker City', 'Twin Falls', 'SLC'])
    expect(stops[0].chargerId).toBeUndefined()
    expect(stops[1].chargerId).toBe('a')
    expect(stops[stops.length - 1].chargerId).toBeUndefined()
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
