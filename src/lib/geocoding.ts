import type { GeoResult } from '../types'

interface PhotonFeature {
  geometry?: { coordinates?: number[] }
  properties?: Record<string, string>
}

export function parsePhoton(json: unknown): GeoResult[] {
  const features = ((json as { features?: PhotonFeature[] })?.features ?? [])
  return features.map((f) => {
    const p = f.properties ?? {}
    const parts = [p.name, p.city || p.county, p.state, p.country].filter(Boolean)
    const coords = f.geometry?.coordinates ?? [0, 0]
    return { label: parts.join(', '), lat: coords[1], lng: coords[0] }
  })
}

export async function searchAddress(query: string): Promise<GeoResult[]> {
  if (query.trim().length < 3) return []
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`)
    if (!res.ok) return []
    return parsePhoton(await res.json())
  } catch {
    return []
  }
}
