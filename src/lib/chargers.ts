import type { LatLng, Charger } from '../types'

export interface OcmPoi {
  ID: number
  AddressInfo?: { Title?: string; Latitude: number; Longitude: number }
  OperatorInfo?: { Title?: string }
  Connections?: Array<{ PowerKW?: number | null }>
}

export function mapPoi(poi: OcmPoi): Charger {
  const powers = (poi.Connections ?? []).map((c) => c.PowerKW ?? 0)
  return {
    id: String(poi.ID),
    name: poi.AddressInfo?.Title ?? 'Unknown',
    network: poi.OperatorInfo?.Title ?? '',
    maxPowerKw: powers.length ? Math.max(...powers) : 0,
    lat: poi.AddressInfo?.Latitude ?? 0,
    lng: poi.AddressInfo?.Longitude ?? 0,
  }
}

export function filterChargers(
  pois: OcmPoi[],
  opts: { networkContains: string; minPowerKw: number },
): Charger[] {
  const needle = opts.networkContains.toLowerCase()
  return pois
    .map(mapPoi)
    .filter((c) => c.network.toLowerCase().includes(needle) && c.maxPowerKw >= opts.minPowerKw)
}

export function dedupeChargers(chargers: Charger[]): Charger[] {
  const seen = new Set<string>()
  const out: Charger[] = []
  for (const c of chargers) {
    if (!seen.has(c.id)) {
      seen.add(c.id)
      out.push(c)
    }
  }
  return out
}

export async function fetchChargersAlongRoute(
  samples: LatLng[],
  apiKey: string,
  opts: { networkContains: string; minPowerKw: number; radiusMiles: number; maxPerSample: number },
): Promise<Charger[]> {
  const all: Charger[] = []
  for (const s of samples) {
    const url =
      `https://api.openchargemap.io/v3/poi?output=json&key=${encodeURIComponent(apiKey)}` +
      `&latitude=${s.lat}&longitude=${s.lng}&distance=${opts.radiusMiles}&distanceunit=Miles` +
      `&maxresults=${opts.maxPerSample}&compact=true&verbose=false`
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const pois = (await res.json()) as OcmPoi[]
      all.push(...filterChargers(pois, opts))
    } catch {
      // skip failed sample, keep going
    }
  }
  return dedupeChargers(all)
}
