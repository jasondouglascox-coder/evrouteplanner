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
