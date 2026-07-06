import type { TripStop } from '../types'

const MAX_GOOGLE_WAYPOINTS = 9

function coord(s: TripStop): string {
  return `${s.lat},${s.lng}`
}

export function googleMapsUrl(stops: TripStop[]): string {
  if (stops.length < 2) throw new Error('need origin and destination')
  const origin = coord(stops[0])
  const destination = coord(stops[stops.length - 1])
  const mids = stops.slice(1, -1).map(coord)
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' })
  if (mids.length) params.set('waypoints', mids.join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function appleMapsUrl(stops: TripStop[]): string {
  if (stops.length < 2) throw new Error('need origin and destination')
  const saddr = coord(stops[0])
  const daddr = stops.slice(1).map(coord).join('+to:')
  return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=d`
}

export function waypointWarning(stops: TripStop[]): string | null {
  const mids = stops.length - 2
  if (mids > MAX_GOOGLE_WAYPOINTS) {
    return `Google Maps supports up to ${MAX_GOOGLE_WAYPOINTS} stops between origin and destination; you have ${mids}. Remove ${mids - MAX_GOOGLE_WAYPOINTS}.`
  }
  return null
}
