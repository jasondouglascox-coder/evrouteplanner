import type { LatLng, Charger } from '../types'

export interface OcmPoi {
  ID: number
  OperatorID?: number | null
  AddressInfo?: { Title?: string; Latitude: number; Longitude: number }
  OperatorInfo?: { Title?: string }
  Connections?: Array<{ PowerKW?: number | null }>
}

// Open Charge Map never inlines the operator name in its POI responses (only a
// numeric OperatorID), so we filter by ID and resolve display names from this map.
// IDs from OCM reference data: Electrify America 3318, Electrify Canada 3400,
// EVgo 15/3252, Tesla 23/3534.
export const OPERATOR_NAMES: Record<number, string> = {
  3318: 'Electrify America',
  3400: 'Electrify Canada',
  15: 'EVgo',
  3252: 'EVgo',
  23: 'Tesla',
  3534: 'Tesla',
}

export function mapPoi(poi: OcmPoi): Charger {
  const powers = (poi.Connections ?? []).map((c) => c.PowerKW ?? 0)
  const operatorId = poi.OperatorID ?? 0
  return {
    id: String(poi.ID),
    name: poi.AddressInfo?.Title ?? 'Unknown',
    network: OPERATOR_NAMES[operatorId] ?? poi.OperatorInfo?.Title ?? '',
    operatorId,
    maxPowerKw: powers.length ? Math.max(...powers) : 0,
    lat: poi.AddressInfo?.Latitude ?? 0,
    lng: poi.AddressInfo?.Longitude ?? 0,
  }
}

export function filterChargers(
  pois: OcmPoi[],
  opts: { operatorIds: number[]; minPowerKw: number },
): Charger[] {
  const allowed = new Set(opts.operatorIds)
  return pois
    .map(mapPoi)
    .filter((c) => allowed.has(c.operatorId) && c.maxPowerKw >= opts.minPowerKw)
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

// Aggressive caching of per-sample charger results. OpenChargeMap is slow, and
// overlapping routes (especially out-and-backs) query the same areas repeatedly.
// Samples are rounded to a ~7-mile grid so nearby/overlapping queries share a key.
interface CacheEntry { t: number; chargers: Charger[] }
const memCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'ev-map-ocm:'

export function clearChargerCache(): void {
  memCache.clear()
}

function cacheKey(lat: number, lng: number, opts: { operatorIds: number[]; minPowerKw: number; radiusMiles: number }): string {
  const ops = [...opts.operatorIds].sort((a, b) => a - b).join(',')
  return `${lat.toFixed(1)},${lng.toFixed(1)}|${ops}|${opts.radiusMiles}|${opts.minPowerKw}`
}

function readCache(key: string): Charger[] | null {
  const mem = memCache.get(key)
  if (mem && Date.now() - mem.t < CACHE_TTL_MS) return mem.chargers
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CACHE_PREFIX + key)
      if (raw) {
        const e = JSON.parse(raw) as CacheEntry
        if (Date.now() - e.t < CACHE_TTL_MS) {
          memCache.set(key, e)
          return e.chargers
        }
      }
    }
  } catch {
    // ignore cache read errors
  }
  return null
}

function writeCache(key: string, chargers: Charger[]): void {
  const entry: CacheEntry = { t: Date.now(), chargers }
  memCache.set(key, entry)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
    }
  } catch {
    // ignore quota/serialization errors
  }
}

export async function fetchChargersAlongRoute(
  samples: LatLng[],
  apiKey: string,
  opts: { operatorIds: number[]; minPowerKw: number; radiusMiles: number; maxPerSample: number },
): Promise<Charger[]> {
  const byKey = new Map<string, Charger[]>()
  for (const s of samples) {
    const key = cacheKey(s.lat, s.lng, opts)
    if (byKey.has(key)) continue // already handled this grid cell this run
    const cached = readCache(key)
    if (cached) {
      byKey.set(key, cached)
      continue
    }
    const url =
      `https://api.openchargemap.io/v3/poi?output=json&key=${encodeURIComponent(apiKey)}` +
      `&latitude=${s.lat}&longitude=${s.lng}&distance=${opts.radiusMiles}&distanceunit=Miles` +
      `&maxresults=${opts.maxPerSample}&compact=true&verbose=false` +
      `&operatorid=${opts.operatorIds.join(',')}`
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const pois = (await res.json()) as OcmPoi[]
      const chargers = filterChargers(pois, opts)
      writeCache(key, chargers)
      byKey.set(key, chargers)
    } catch {
      // skip failed sample, keep going
    }
  }
  return dedupeChargers([...byKey.values()].flat())
}
