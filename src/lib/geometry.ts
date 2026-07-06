import type { LatLng } from '../types'

const EARTH_RADIUS_M = 6371000
const METERS_PER_MILE = 1609.344

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function metersToMiles(m: number): number {
  return m / METERS_PER_MILE
}

// Local equirectangular projection to planar meters relative to a reference point.
function toXY(p: LatLng, ref: LatLng): { x: number; y: number } {
  const x = (p.lng - ref.lng) * Math.cos((ref.lat * Math.PI) / 180) * 111320
  const y = (p.lat - ref.lat) * 110540
  return { x, y }
}

export function pointToPolyline(
  point: LatLng,
  poly: LatLng[],
): { distanceMeters: number; alongMeters: number } {
  if (poly.length === 0) throw new Error('empty polyline')
  if (poly.length === 1) {
    return { distanceMeters: haversineMeters(point, poly[0]), alongMeters: 0 }
  }
  const ref = poly[Math.floor(poly.length / 2)]
  const P = toXY(point, ref)
  let best = { distanceMeters: Infinity, alongMeters: 0 }
  let cumulative = 0
  for (let i = 0; i < poly.length - 1; i++) {
    const A = toXY(poly[i], ref)
    const B = toXY(poly[i + 1], ref)
    const ABx = B.x - A.x
    const ABy = B.y - A.y
    const segLen2 = ABx * ABx + ABy * ABy
    const segLen = Math.sqrt(segLen2)
    let t = segLen2 === 0 ? 0 : ((P.x - A.x) * ABx + (P.y - A.y) * ABy) / segLen2
    t = Math.max(0, Math.min(1, t))
    const projX = A.x + t * ABx
    const projY = A.y + t * ABy
    const dx = P.x - projX
    const dy = P.y - projY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < best.distanceMeters) {
      best = { distanceMeters: dist, alongMeters: cumulative + t * segLen }
    }
    cumulative += segLen
  }
  return best
}

export function samplePolyline(poly: LatLng[], everyMeters: number): LatLng[] {
  if (poly.length === 0) return []
  const out: LatLng[] = [poly[0]]
  let acc = 0
  for (let i = 0; i < poly.length - 1; i++) {
    acc += haversineMeters(poly[i], poly[i + 1])
    if (acc >= everyMeters) {
      out.push(poly[i + 1])
      acc = 0
    }
  }
  const last = poly[poly.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}
