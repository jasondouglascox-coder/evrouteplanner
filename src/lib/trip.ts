import type { GeoResult, AnnotatedCharger, TripStop, Route } from '../types'

const METERS_PER_MILE = 1609.344

export function orderStops(
  origin: GeoResult,
  destination: GeoResult,
  chosen: AnnotatedCharger[],
): TripStop[] {
  const mids: TripStop[] = [...chosen]
    .sort((a, b) => a.routePositionMeters - b.routePositionMeters)
    .map((c) => ({ label: c.name, lat: c.lat, lng: c.lng, chargerId: c.id }))
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
