import type { GeoResult, TripStop, Route } from '../types'

const METERS_PER_MILE = 1609.344

// An intermediate stop between origin and destination — either a manual
// waypoint (no chargerId) or a chosen charger (chargerId set). Ordered along
// the route by routePositionMeters.
export interface OrderedIntermediate {
  label: string
  lat: number
  lng: number
  routePositionMeters: number
  chargerId?: string
}

export function orderStops(
  origin: GeoResult,
  destination: GeoResult,
  intermediates: OrderedIntermediate[],
): TripStop[] {
  const mids: TripStop[] = [...intermediates]
    .sort((a, b) => a.routePositionMeters - b.routePositionMeters)
    .map((i) => ({ label: i.label, lat: i.lat, lng: i.lng, chargerId: i.chargerId }))
  return [
    { label: origin.label, lat: origin.lat, lng: origin.lng },
    ...mids,
    { label: destination.label, lat: destination.lat, lng: destination.lng },
  ]
}

export function perLegMiles(route: Route): number[] {
  return route.legs.map((l) => l.distanceMeters / METERS_PER_MILE)
}

// For each charger, the along-route distance (meters) from the last "green" point
// before it — green = the origin (route position 0) plus any currently-selected
// charger. This is the leg you'd add by selecting a charger (for unselected ones)
// or the leg length from the prior stop (for selected ones).
export function gapFromLastGreenMeters(
  chargers: { id: string; routePositionMeters: number }[],
  selectedIds: Set<string>,
): Record<string, number> {
  const greens = [0, ...chargers.filter((c) => selectedIds.has(c.id)).map((c) => c.routePositionMeters)].sort(
    (a, b) => a - b,
  )
  const out: Record<string, number> = {}
  for (const c of chargers) {
    let lastGreen = 0
    for (const g of greens) {
      if (g < c.routePositionMeters) lastGreen = g
      else break
    }
    out[c.id] = c.routePositionMeters - lastGreen
  }
  return out
}
