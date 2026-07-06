import type { GeoResult } from '../types'

interface PhotonFeature {
  geometry?: { coordinates?: number[] }
  properties?: Record<string, string>
}

// Restrict address search to US, Canada, and Mexico.
const ALLOWED_COUNTRIES = new Set(['US', 'CA', 'MX'])
// North America bounding box (minLon,minLat,maxLon,maxLat) to bias/limit Photon.
const NA_BBOX = '-170,12,-52,84'

export function parsePhoton(json: unknown): GeoResult[] {
  const features = (json as { features?: PhotonFeature[] })?.features ?? []
  return features
    .filter((f) => {
      const cc = (f.properties?.countrycode ?? '').toUpperCase()
      // Keep US/CA/MX; also keep entries missing a countrycode (the NA bbox
      // already constrains geography) so valid results aren't wrongly dropped.
      return cc === '' || ALLOWED_COUNTRIES.has(cc)
    })
    .map((f) => {
      const p = f.properties ?? {}
      const parts = [p.name, p.city || p.county, p.state, p.country].filter(Boolean)
      const coords = f.geometry?.coordinates ?? [0, 0]
      return { label: parts.join(', '), lat: coords[1], lng: coords[0] }
    })
}

export async function searchAddress(query: string): Promise<GeoResult[]> {
  if (query.trim().length < 3) return []
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&bbox=${NA_BBOX}`,
    )
    if (!res.ok) return []
    return parsePhoton(await res.json())
  } catch {
    return []
  }
}
