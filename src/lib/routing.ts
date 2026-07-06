import type { LatLng, Route, RouteLeg } from '../types'

interface OrsFeature {
  geometry?: { coordinates?: number[][] }
  properties?: {
    segments?: Array<{ distance: number }>
    summary?: { distance?: number }
  }
}
interface OrsResponse {
  features?: OrsFeature[]
}

export function parseOrsGeoJson(json: unknown): Route {
  const feature = (json as OrsResponse)?.features?.[0]
  if (!feature || !feature.geometry?.coordinates) throw new Error('no route in response')
  const coordinates: LatLng[] = feature.geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }))
  const legs: RouteLeg[] = (feature.properties?.segments ?? []).map((s) => ({ distanceMeters: s.distance }))
  const totalMeters =
    feature.properties?.summary?.distance ?? legs.reduce((a, l) => a + l.distanceMeters, 0)
  return { coordinates, legs, totalMeters }
}

export async function fetchRoute(
  stops: { lat: number; lng: number }[],
  apiKey: string,
): Promise<Route> {
  if (stops.length < 2) throw new Error('need at least origin and destination')
  const body = { coordinates: stops.map((s) => [s.lng, s.lat]) }
  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`routing failed: ${res.status}`)
  return parseOrsGeoJson(await res.json())
}
