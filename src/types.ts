export interface LatLng { lat: number; lng: number }

export interface GeoResult { label: string; lat: number; lng: number }

export interface RouteLeg { distanceMeters: number }
export interface Route {
  coordinates: LatLng[]
  legs: RouteLeg[]
  totalMeters: number
}

export interface Charger {
  id: string
  name: string
  network: string
  maxPowerKw: number
  lat: number
  lng: number
}
export interface AnnotatedCharger extends Charger {
  detourMiles: number
  routePositionMeters: number
}

export interface EfficiencyRow { speedMph: number; milesPerPercent: number }
export interface RangeConfig { startPct: number; chargeToPct: number; reservePct: number }

export interface TripStop {
  label: string
  lat: number
  lng: number
  chargerId?: string
}
