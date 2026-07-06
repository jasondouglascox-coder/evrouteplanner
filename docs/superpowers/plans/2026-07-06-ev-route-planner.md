# EV Route Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free, no-credit-card web app that plans an EV road trip A→B, shows every Electrify America ≥350kW charger near the route with detour + per-leg distances, lets you pick stops with range warnings, and hands the finished multi-stop route to the native Google Maps app.

**Architecture:** Static single-page app, no backend. Pure logic modules (geometry, range, deep-links, charger filtering, routing/geocoding parsers, trip state, settings) are fully unit-tested; the Leaflet UI layer is thin glue verified manually. All third-party data comes from free APIs called client-side.

**Tech Stack:** Vite, TypeScript, Vitest, Leaflet + OpenStreetMap tiles, OpenRouteService (routing), Photon (geocoding), Open Charge Map (chargers). Settings + API keys persisted in browser localStorage.

## Global Constraints

- **Zero cost, no payment method:** never introduce a dependency or API that requires a credit card. OSM/Leaflet (no key), OpenRouteService (free key, no card), Photon (no key), Open Charge Map (free key, no card) only.
- **No backend:** everything runs in the browser; deployable as static files.
- **Car defaults:** 2025 Kia EV6 Wind. Default efficiency table (mi/%): 60→2.9, 65→2.75, 70→2.55, 75→2.35, 80→2.15. Default planning speed 70 mph.
- **Range windows (editable):** start 100%, charge-to 80%, reserve 10%. Leg 1 uses start→reserve; later legs use chargeTo→reserve.
- **Charger filter defaults:** network contains "Electrify America", min power 350 kW.
- **Units:** internal distances in meters; display in miles. 1 mile = 1609.344 m.
- **TDD:** write the failing test first for every pure-logic module. Commit after each task.

---

## File Structure

```
ev-map/
  index.html                 # app shell (Task 1)
  package.json               # deps + scripts (Task 1)
  tsconfig.json              # (Task 1)
  vite.config.ts             # build + vitest config (Task 1)
  src/
    types.ts                 # shared types (Task 1)
    lib/
      geometry.ts            # pure: haversine, detour, along-route, sampling (Task 2)
      range.ts               # pure: efficiency table + leg range logic (Task 3)
      deeplink.ts            # pure: Google/Apple Maps URLs (Task 4)
      chargers.ts            # OCM map/filter/dedupe (pure) + fetch (Task 5)
      routing.ts             # ORS parse (pure) + fetch (Task 6)
      geocoding.ts           # Photon parse (pure) + fetch (Task 7)
      trip.ts                # pure: order stops, per-leg miles (Task 8)
      settings.ts            # defaults + localStorage load/save (Task 9)
    ui/
      map.ts                 # Leaflet controller (Task 10)
      app.ts                 # state + wiring + sidebar render (Task 11)
    styles.css               # (Task 11)
    main.ts                  # entry point (Task 1 stub, Task 11 final)
  test/
    fixtures/
      ocm-sample.json        # (Task 5)
      ors-route.json         # (Task 6)
      photon.json            # (Task 7)
    *.test.ts                # per-module tests
  README.md                  # setup + deploy (Task 12)
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/types.ts`, `test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: shared types used by every later task:
  - `LatLng { lat: number; lng: number }`
  - `GeoResult { label: string; lat: number; lng: number }`
  - `RouteLeg { distanceMeters: number }`
  - `Route { coordinates: LatLng[]; legs: RouteLeg[]; totalMeters: number }`
  - `Charger { id: string; name: string; network: string; maxPowerKw: number; lat: number; lng: number }`
  - `AnnotatedCharger extends Charger { detourMiles: number; routePositionMeters: number }`
  - `EfficiencyRow { speedMph: number; milesPerPercent: number }`
  - `RangeConfig { startPct: number; chargeToPct: number; reservePct: number }`
  - `TripStop { label: string; lat: number; lng: number; chargerId?: string }`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ev-map",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0",
    "@types/leaflet": "^1.9.12"
  },
  "dependencies": {
    "leaflet": "^1.9.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 4: Create `src/types.ts`**

```ts
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
```

- [ ] **Step 5: Create `src/main.ts` (stub — finalized in Task 11)**

```ts
document.getElementById('app')!.textContent = 'EV Route Planner — scaffold OK'
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EV Route Planner</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('scaffold', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 8: Install and verify**

Run: `npm install && npm test`
Expected: smoke test passes (1 passed).

Run: `npm run dev` then open the printed localhost URL.
Expected: page shows "EV Route Planner — scaffold OK". Stop the dev server (Ctrl-C).

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/main.ts src/types.ts test/smoke.test.ts package-lock.json
git commit -m "chore: scaffold Vite + TypeScript + Vitest project"
```

---

## Task 2: Geometry module (pure)

**Files:**
- Create: `src/lib/geometry.ts`, `test/geometry.test.ts`

**Interfaces:**
- Consumes: `LatLng` from `src/types.ts`.
- Produces:
  - `haversineMeters(a: LatLng, b: LatLng): number`
  - `metersToMiles(m: number): number`
  - `pointToPolyline(point: LatLng, poly: LatLng[]): { distanceMeters: number; alongMeters: number }`
  - `samplePolyline(poly: LatLng[], everyMeters: number): LatLng[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { haversineMeters, metersToMiles, pointToPolyline, samplePolyline } from '../src/lib/geometry'

describe('haversineMeters', () => {
  it('measures ~111.2 km per degree of latitude', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeGreaterThan(110000)
    expect(d).toBeLessThan(112000)
  })
  it('is zero for identical points', () => {
    expect(haversineMeters({ lat: 45, lng: -122 }, { lat: 45, lng: -122 })).toBe(0)
  })
})

describe('metersToMiles', () => {
  it('converts using 1609.344', () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 6)
  })
})

describe('pointToPolyline', () => {
  const poly = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 }, // ~111 km due east
  ]
  it('finds perpendicular detour distance to the segment', () => {
    // point just north of the midpoint of the line
    const r = pointToPolyline({ lat: 0.01, lng: 0.5 }, poly)
    expect(metersToMiles(r.distanceMeters)).toBeGreaterThan(0.5)
    expect(metersToMiles(r.distanceMeters)).toBeLessThan(1.0)
  })
  it('reports along-route position roughly at the midpoint', () => {
    const total = haversineMeters(poly[0], poly[1])
    const r = pointToPolyline({ lat: 0.01, lng: 0.5 }, poly)
    expect(r.alongMeters).toBeGreaterThan(total * 0.4)
    expect(r.alongMeters).toBeLessThan(total * 0.6)
  })
  it('clamps to the first vertex for points before the line', () => {
    const r = pointToPolyline({ lat: 0, lng: -1 }, poly)
    expect(r.alongMeters).toBe(0)
  })
})

describe('samplePolyline', () => {
  it('keeps first and last and adds points at the interval', () => {
    const poly = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ]
    const samples = samplePolyline(poly, 111000) // ~1 degree spacing
    expect(samples[0]).toEqual(poly[0])
    expect(samples[samples.length - 1]).toEqual(poly[2])
    expect(samples.length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/geometry.test.ts`
Expected: FAIL — cannot find module `../src/lib/geometry`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/geometry.test.ts`
Expected: PASS (all geometry tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry.ts test/geometry.test.ts
git commit -m "feat: geometry helpers (haversine, detour, along-route, sampling)"
```

---

## Task 3: Range engine (pure)

**Files:**
- Create: `src/lib/range.ts`, `test/range.test.ts`

**Interfaces:**
- Consumes: `EfficiencyRow`, `RangeConfig` from `src/types.ts`.
- Produces:
  - `milesPerPercentForSpeed(table: EfficiencyRow[], speedMph: number): number`
  - `legRangeMiles(milesPerPercent: number, cfg: RangeConfig, isFirstLeg: boolean): number`
  - `LegStatus { index: number; distanceMiles: number; rangeMiles: number; exceeds: boolean }`
  - `evaluateLegs(legMiles: number[], milesPerPercent: number, cfg: RangeConfig): LegStatus[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { milesPerPercentForSpeed, legRangeMiles, evaluateLegs } from '../src/lib/range'
import type { EfficiencyRow, RangeConfig } from '../src/types'

const table: EfficiencyRow[] = [
  { speedMph: 60, milesPerPercent: 2.9 },
  { speedMph: 65, milesPerPercent: 2.75 },
  { speedMph: 70, milesPerPercent: 2.55 },
  { speedMph: 75, milesPerPercent: 2.35 },
  { speedMph: 80, milesPerPercent: 2.15 },
]
const cfg: RangeConfig = { startPct: 100, chargeToPct: 80, reservePct: 10 }

describe('milesPerPercentForSpeed', () => {
  it('returns exact match', () => {
    expect(milesPerPercentForSpeed(table, 70)).toBe(2.55)
  })
  it('interpolates between rows', () => {
    expect(milesPerPercentForSpeed(table, 67.5)).toBeCloseTo(2.65, 5)
  })
  it('clamps below the lowest speed', () => {
    expect(milesPerPercentForSpeed(table, 40)).toBe(2.9)
  })
  it('clamps above the highest speed', () => {
    expect(milesPerPercentForSpeed(table, 95)).toBe(2.15)
  })
})

describe('legRangeMiles', () => {
  it('uses start->reserve for the first leg', () => {
    // (100 - 10) * 2.55 = 229.5
    expect(legRangeMiles(2.55, cfg, true)).toBeCloseTo(229.5, 5)
  })
  it('uses chargeTo->reserve for later legs', () => {
    // (80 - 10) * 2.55 = 178.5
    expect(legRangeMiles(2.55, cfg, false)).toBeCloseTo(178.5, 5)
  })
})

describe('evaluateLegs', () => {
  it('flags legs that exceed available range', () => {
    const statuses = evaluateLegs([200, 150, 190], 2.55, cfg)
    expect(statuses[0].exceeds).toBe(false) // 200 < 229.5
    expect(statuses[1].exceeds).toBe(false) // 150 < 178.5
    expect(statuses[2].exceeds).toBe(true) // 190 > 178.5
    expect(statuses[2].rangeMiles).toBeCloseTo(178.5, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/range.test.ts`
Expected: FAIL — cannot find module `../src/lib/range`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { EfficiencyRow, RangeConfig } from '../types'

export function milesPerPercentForSpeed(table: EfficiencyRow[], speedMph: number): number {
  if (table.length === 0) throw new Error('empty efficiency table')
  const sorted = [...table].sort((a, b) => a.speedMph - b.speedMph)
  const exact = sorted.find((r) => r.speedMph === speedMph)
  if (exact) return exact.milesPerPercent
  if (speedMph <= sorted[0].speedMph) return sorted[0].milesPerPercent
  const last = sorted[sorted.length - 1]
  if (speedMph >= last.speedMph) return last.milesPerPercent
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (speedMph > a.speedMph && speedMph < b.speedMph) {
      const f = (speedMph - a.speedMph) / (b.speedMph - a.speedMph)
      return a.milesPerPercent + f * (b.milesPerPercent - a.milesPerPercent)
    }
  }
  return last.milesPerPercent
}

export function legRangeMiles(milesPerPercent: number, cfg: RangeConfig, isFirstLeg: boolean): number {
  const usablePct = isFirstLeg ? cfg.startPct - cfg.reservePct : cfg.chargeToPct - cfg.reservePct
  return usablePct * milesPerPercent
}

export interface LegStatus {
  index: number
  distanceMiles: number
  rangeMiles: number
  exceeds: boolean
}

export function evaluateLegs(legMiles: number[], milesPerPercent: number, cfg: RangeConfig): LegStatus[] {
  return legMiles.map((d, i) => {
    const rangeMiles = legRangeMiles(milesPerPercent, cfg, i === 0)
    return { index: i, distanceMiles: d, rangeMiles, exceeds: d > rangeMiles }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/range.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/range.ts test/range.test.ts
git commit -m "feat: range engine (efficiency table + per-leg range checks)"
```

---

## Task 4: Deep-link builder (pure)

**Files:**
- Create: `src/lib/deeplink.ts`, `test/deeplink.test.ts`

**Interfaces:**
- Consumes: `TripStop` from `src/types.ts`.
- Produces:
  - `googleMapsUrl(stops: TripStop[]): string`
  - `appleMapsUrl(stops: TripStop[]): string`
  - `waypointWarning(stops: TripStop[]): string | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { googleMapsUrl, appleMapsUrl, waypointWarning } from '../src/lib/deeplink'
import type { TripStop } from '../src/types'

const stops: TripStop[] = [
  { label: 'Washougal', lat: 45.58, lng: -122.35 },
  { label: 'Baker City EA', lat: 44.77, lng: -117.83, chargerId: '1' },
  { label: 'SLC', lat: 40.76, lng: -111.89 },
]

describe('googleMapsUrl', () => {
  it('encodes origin, destination, and waypoints', () => {
    const u = new URL(googleMapsUrl(stops))
    expect(u.searchParams.get('origin')).toBe('45.58,-122.35')
    expect(u.searchParams.get('destination')).toBe('40.76,-111.89')
    expect(u.searchParams.get('waypoints')).toBe('44.77,-117.83')
    expect(u.searchParams.get('travelmode')).toBe('driving')
  })
  it('omits waypoints when there are only two stops', () => {
    const u = new URL(googleMapsUrl([stops[0], stops[2]]))
    expect(u.searchParams.get('waypoints')).toBeNull()
  })
  it('throws with fewer than two stops', () => {
    expect(() => googleMapsUrl([stops[0]])).toThrow()
  })
})

describe('appleMapsUrl', () => {
  it('chains destinations with +to:', () => {
    const url = appleMapsUrl(stops)
    expect(url).toContain('saddr=45.58,-122.35')
    expect(url).toContain('daddr=44.77,-117.83+to:40.76,-111.89')
  })
})

describe('waypointWarning', () => {
  it('returns null within the limit', () => {
    expect(waypointWarning(stops)).toBeNull()
  })
  it('warns when intermediate stops exceed 9', () => {
    const many: TripStop[] = [{ label: 'o', lat: 0, lng: 0 }]
    for (let i = 0; i < 11; i++) many.push({ label: `w${i}`, lat: i, lng: i })
    many.push({ label: 'd', lat: 99, lng: 99 })
    expect(waypointWarning(many)).toMatch(/up to 9/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/deeplink.test.ts`
Expected: FAIL — cannot find module `../src/lib/deeplink`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

Note: `URLSearchParams.toString()` percent-encodes `,` and `|`; Google Maps accepts the encoded forms, and the test decodes via `URL`/`searchParams` so it validates the logical values.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/deeplink.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deeplink.ts test/deeplink.test.ts
git commit -m "feat: Google/Apple Maps deep-link builders with waypoint-limit warning"
```

---

## Task 5: Charger source (Open Charge Map)

**Files:**
- Create: `src/lib/chargers.ts`, `test/chargers.test.ts`, `test/fixtures/ocm-sample.json`

**Interfaces:**
- Consumes: `LatLng`, `Charger` from `src/types.ts`.
- Produces:
  - `OcmPoi` (input shape from Open Charge Map)
  - `mapPoi(poi: OcmPoi): Charger`
  - `filterChargers(pois: OcmPoi[], opts: { networkContains: string; minPowerKw: number }): Charger[]`
  - `dedupeChargers(chargers: Charger[]): Charger[]`
  - `fetchChargersAlongRoute(samples: LatLng[], apiKey: string, opts: { networkContains: string; minPowerKw: number; radiusMiles: number; maxPerSample: number }): Promise<Charger[]>`

- [ ] **Step 1: Create the fixture `test/fixtures/ocm-sample.json`**

```json
[
  {
    "ID": 101,
    "AddressInfo": { "Title": "Baker City", "Latitude": 44.77, "Longitude": -117.83 },
    "OperatorInfo": { "Title": "Electrify America" },
    "Connections": [{ "PowerKW": 350 }, { "PowerKW": 150 }]
  },
  {
    "ID": 102,
    "AddressInfo": { "Title": "Some EVgo Site", "Latitude": 44.9, "Longitude": -117.9 },
    "OperatorInfo": { "Title": "EVgo" },
    "Connections": [{ "PowerKW": 350 }]
  },
  {
    "ID": 103,
    "AddressInfo": { "Title": "EA Low Power", "Latitude": 45.0, "Longitude": -118.0 },
    "OperatorInfo": { "Title": "Electrify America" },
    "Connections": [{ "PowerKW": 150 }]
  },
  {
    "ID": 101,
    "AddressInfo": { "Title": "Baker City (dup)", "Latitude": 44.77, "Longitude": -117.83 },
    "OperatorInfo": { "Title": "Electrify America" },
    "Connections": [{ "PowerKW": 350 }]
  }
]
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapPoi, filterChargers, dedupeChargers, type OcmPoi } from '../src/lib/chargers'

const fixture: OcmPoi[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/ocm-sample.json', import.meta.url)), 'utf-8'),
)

describe('mapPoi', () => {
  it('takes the max connector power', () => {
    const c = mapPoi(fixture[0])
    expect(c.maxPowerKw).toBe(350)
    expect(c.network).toBe('Electrify America')
    expect(c.id).toBe('101')
  })
})

describe('filterChargers', () => {
  it('keeps only EA stations at or above min power', () => {
    const result = filterChargers(fixture, { networkContains: 'Electrify America', minPowerKw: 350 })
    // fixture EA >=350: ID 101 (twice); excludes EVgo (102) and EA-150 (103)
    expect(result.every((c) => c.network === 'Electrify America')).toBe(true)
    expect(result.every((c) => c.maxPowerKw >= 350)).toBe(true)
    expect(result.some((c) => c.id === '102')).toBe(false)
    expect(result.some((c) => c.id === '103')).toBe(false)
  })
})

describe('dedupeChargers', () => {
  it('removes duplicate ids', () => {
    const filtered = filterChargers(fixture, { networkContains: 'Electrify America', minPowerKw: 350 })
    const deduped = dedupeChargers(filtered)
    expect(deduped.filter((c) => c.id === '101').length).toBe(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/chargers.test.ts`
Expected: FAIL — cannot find module `../src/lib/chargers`.

- [ ] **Step 4: Write minimal implementation**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/chargers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chargers.ts test/chargers.test.ts test/fixtures/ocm-sample.json
git commit -m "feat: Open Charge Map charger mapping, filtering, dedupe + fetch"
```

---

## Task 6: Routing client (OpenRouteService)

**Files:**
- Create: `src/lib/routing.ts`, `test/routing.test.ts`, `test/fixtures/ors-route.json`

**Interfaces:**
- Consumes: `LatLng`, `Route`, `RouteLeg` from `src/types.ts`.
- Produces:
  - `parseOrsGeoJson(json: unknown): Route`
  - `fetchRoute(stops: { lat: number; lng: number }[], apiKey: string): Promise<Route>`

- [ ] **Step 1: Create the fixture `test/fixtures/ors-route.json`** (trimmed real ORS GeoJSON shape)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "segments": [
          { "distance": 154800.0, "duration": 5400.0 },
          { "distance": 212300.0, "duration": 7600.0 }
        ],
        "summary": { "distance": 367100.0, "duration": 13000.0 }
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-122.35, 45.58],
          [-117.83, 44.77],
          [-111.89, 40.76]
        ]
      }
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseOrsGeoJson } from '../src/lib/routing'

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/ors-route.json', import.meta.url)), 'utf-8'),
)

describe('parseOrsGeoJson', () => {
  it('decodes coordinates as lat/lng', () => {
    const route = parseOrsGeoJson(fixture)
    expect(route.coordinates[0]).toEqual({ lat: 45.58, lng: -122.35 })
    expect(route.coordinates.length).toBe(3)
  })
  it('maps each segment to a leg distance', () => {
    const route = parseOrsGeoJson(fixture)
    expect(route.legs.map((l) => l.distanceMeters)).toEqual([154800.0, 212300.0])
  })
  it('reads the total distance from the summary', () => {
    const route = parseOrsGeoJson(fixture)
    expect(route.totalMeters).toBe(367100.0)
  })
  it('throws when there is no route feature', () => {
    expect(() => parseOrsGeoJson({ features: [] })).toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/routing.test.ts`
Expected: FAIL — cannot find module `../src/lib/routing`.

- [ ] **Step 4: Write minimal implementation**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/routing.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/routing.ts test/routing.test.ts test/fixtures/ors-route.json
git commit -m "feat: OpenRouteService route parsing + fetch"
```

---

## Task 7: Geocoding client (Photon)

**Files:**
- Create: `src/lib/geocoding.ts`, `test/geocoding.test.ts`, `test/fixtures/photon.json`

**Interfaces:**
- Consumes: `GeoResult` from `src/types.ts`.
- Produces:
  - `parsePhoton(json: unknown): GeoResult[]`
  - `searchAddress(query: string): Promise<GeoResult[]>`

- [ ] **Step 1: Create the fixture `test/fixtures/photon.json`**

```json
{
  "features": [
    {
      "geometry": { "coordinates": [-122.3543, 45.5829] },
      "properties": { "name": "Washougal", "state": "Washington", "country": "United States" }
    },
    {
      "geometry": { "coordinates": [-111.891, 40.7608] },
      "properties": { "name": "Salt Lake City", "state": "Utah", "country": "United States" }
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parsePhoton } from '../src/lib/geocoding'

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/photon.json', import.meta.url)), 'utf-8'),
)

describe('parsePhoton', () => {
  it('builds a readable label and lat/lng', () => {
    const results = parsePhoton(fixture)
    expect(results[0].label).toBe('Washougal, Washington, United States')
    expect(results[0].lat).toBe(45.5829)
    expect(results[0].lng).toBe(-122.3543)
  })
  it('returns one result per feature', () => {
    expect(parsePhoton(fixture).length).toBe(2)
  })
  it('handles empty responses', () => {
    expect(parsePhoton({ features: [] })).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/geocoding.test.ts`
Expected: FAIL — cannot find module `../src/lib/geocoding`.

- [ ] **Step 4: Write minimal implementation**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/geocoding.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/geocoding.ts test/geocoding.test.ts test/fixtures/photon.json
git commit -m "feat: Photon geocoding parse + search"
```

---

## Task 8: Trip state (pure)

**Files:**
- Create: `src/lib/trip.ts`, `test/trip.test.ts`

**Interfaces:**
- Consumes: `GeoResult`, `AnnotatedCharger`, `TripStop`, `Route` from `src/types.ts`.
- Produces:
  - `orderStops(origin: GeoResult, destination: GeoResult, chosen: AnnotatedCharger[]): TripStop[]`
  - `perLegMiles(route: Route): number[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { orderStops, perLegMiles } from '../src/lib/trip'
import type { AnnotatedCharger, GeoResult, Route } from '../src/types'

const origin: GeoResult = { label: 'Washougal', lat: 45.58, lng: -122.35 }
const dest: GeoResult = { label: 'SLC', lat: 40.76, lng: -111.89 }

const chargers: AnnotatedCharger[] = [
  { id: 'b', name: 'Twin Falls', network: 'Electrify America', maxPowerKw: 350, lat: 42.56, lng: -114.46, detourMiles: 0.3, routePositionMeters: 500000 },
  { id: 'a', name: 'Baker City', network: 'Electrify America', maxPowerKw: 350, lat: 44.77, lng: -117.83, detourMiles: 1.1, routePositionMeters: 250000 },
]

describe('orderStops', () => {
  it('orders chosen chargers by along-route position between origin and destination', () => {
    const stops = orderStops(origin, dest, chargers)
    expect(stops.map((s) => s.label)).toEqual(['Washougal', 'Baker City', 'Twin Falls', 'SLC'])
    expect(stops[0].chargerId).toBeUndefined()
    expect(stops[1].chargerId).toBe('a')
    expect(stops[stops.length - 1].chargerId).toBeUndefined()
  })
})

describe('perLegMiles', () => {
  it('converts each leg distance to miles', () => {
    const route: Route = {
      coordinates: [],
      legs: [{ distanceMeters: 160934.4 }, { distanceMeters: 321868.8 }],
      totalMeters: 482803.2,
    }
    expect(perLegMiles(route)).toEqual([100, 200])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/trip.test.ts`
Expected: FAIL — cannot find module `../src/lib/trip`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/trip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trip.ts test/trip.test.ts
git commit -m "feat: trip state (order stops by route position, per-leg miles)"
```

---

## Task 9: Settings + persistence

**Files:**
- Create: `src/lib/settings.ts`, `test/settings.test.ts`

**Interfaces:**
- Consumes: `EfficiencyRow`, `RangeConfig` from `src/types.ts`.
- Produces:
  - `Settings` interface (fields below)
  - `DEFAULT_EFFICIENCY: EfficiencyRow[]`, `DEFAULT_RANGE: RangeConfig`, `DEFAULT_SETTINGS: Settings`
  - `loadSettings(storage?: Storage): Settings`
  - `saveSettings(s: Settings, storage?: Storage): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/lib/settings'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k) },
    setItem: (k: string, v: string) => { map.set(k, v) },
  }
}

describe('settings', () => {
  it('returns defaults when storage is empty', () => {
    const s = loadSettings(memoryStorage())
    expect(s.minPowerKw).toBe(350)
    expect(s.networkContains).toBe('Electrify America')
    expect(s.planningSpeed).toBe(70)
    expect(s.efficiency.length).toBe(5)
    expect(s.range).toEqual({ startPct: 100, chargeToPct: 80, reservePct: 10 })
  })

  it('round-trips saved settings', () => {
    const storage = memoryStorage()
    const custom = { ...DEFAULT_SETTINGS, planningSpeed: 75, orsKey: 'abc', ocmKey: 'xyz' }
    saveSettings(custom, storage)
    const loaded = loadSettings(storage)
    expect(loaded.planningSpeed).toBe(75)
    expect(loaded.orsKey).toBe('abc')
    expect(loaded.ocmKey).toBe('xyz')
  })

  it('merges partial stored settings over defaults', () => {
    const storage = memoryStorage()
    storage.setItem('ev-map-settings', JSON.stringify({ planningSpeed: 65 }))
    const loaded = loadSettings(storage)
    expect(loaded.planningSpeed).toBe(65)
    expect(loaded.minPowerKw).toBe(350) // default preserved
  })

  it('falls back to defaults on corrupt JSON', () => {
    const storage = memoryStorage()
    storage.setItem('ev-map-settings', 'not json')
    expect(loadSettings(storage).minPowerKw).toBe(350)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/settings.test.ts`
Expected: FAIL — cannot find module `../src/lib/settings`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { EfficiencyRow, RangeConfig } from '../types'

export const DEFAULT_EFFICIENCY: EfficiencyRow[] = [
  { speedMph: 60, milesPerPercent: 2.9 },
  { speedMph: 65, milesPerPercent: 2.75 },
  { speedMph: 70, milesPerPercent: 2.55 },
  { speedMph: 75, milesPerPercent: 2.35 },
  { speedMph: 80, milesPerPercent: 2.15 },
]

export const DEFAULT_RANGE: RangeConfig = { startPct: 100, chargeToPct: 80, reservePct: 10 }

export interface Settings {
  efficiency: EfficiencyRow[]
  range: RangeConfig
  planningSpeed: number
  minPowerKw: number
  networkContains: string
  maxDetourMiles: number
  radiusMiles: number
  sampleEveryMiles: number
  orsKey: string
  ocmKey: string
}

export const DEFAULT_SETTINGS: Settings = {
  efficiency: DEFAULT_EFFICIENCY,
  range: DEFAULT_RANGE,
  planningSpeed: 70,
  minPowerKw: 350,
  networkContains: 'Electrify America',
  maxDetourMiles: 5,
  radiusMiles: 30,
  sampleEveryMiles: 40,
  orsKey: '',
  ocmKey: '',
}

const STORAGE_KEY = 'ev-map-settings'

export function loadSettings(storage: Storage = localStorage): Settings {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(s))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts test/settings.test.ts
git commit -m "feat: settings defaults + localStorage persistence"
```

---

## Task 10: Map controller (Leaflet)

**Files:**
- Create: `src/ui/map.ts`

**Interfaces:**
- Consumes: `LatLng`, `AnnotatedCharger` from `src/types.ts`; `leaflet`.
- Produces:
  - `class MapController` with:
    - `constructor(elementId: string)`
    - `setRoute(coords: LatLng[]): void`
    - `setChargers(chargers: AnnotatedCharger[], selectedIds: Set<string>, onToggle: (id: string) => void): void`
    - `fitToRoute(): void`

This is UI glue over Leaflet; verification is manual in the browser (Leaflet needs a real DOM, so no unit test).

- [ ] **Step 1: Write `src/ui/map.ts`**

```ts
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, AnnotatedCharger } from '../types'

export class MapController {
  private map: L.Map
  private routeLayer = L.layerGroup()
  private chargerLayer = L.layerGroup()
  private routeBounds: L.LatLngBounds | null = null

  constructor(elementId: string) {
    this.map = L.map(elementId).setView([44.5, -117], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map)
    this.routeLayer.addTo(this.map)
    this.chargerLayer.addTo(this.map)
  }

  setRoute(coords: LatLng[]): void {
    this.routeLayer.clearLayers()
    if (coords.length === 0) {
      this.routeBounds = null
      return
    }
    const latlngs = coords.map((c) => [c.lat, c.lng] as [number, number])
    const line = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: 0.8 })
    line.addTo(this.routeLayer)
    this.routeBounds = line.getBounds()
  }

  setChargers(
    chargers: AnnotatedCharger[],
    selectedIds: Set<string>,
    onToggle: (id: string) => void,
  ): void {
    this.chargerLayer.clearLayers()
    for (const c of chargers) {
      const selected = selectedIds.has(c.id)
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: selected ? 9 : 6,
        color: selected ? '#16a34a' : '#f59e0b',
        fillColor: selected ? '#16a34a' : '#f59e0b',
        fillOpacity: 0.9,
        weight: 2,
      })
      marker.bindPopup(
        `<b>${c.name}</b><br>${c.maxPowerKw} kW · +${c.detourMiles.toFixed(1)} mi off route` +
          `<br><button data-toggle="${c.id}">${selected ? 'Remove stop' : 'Add stop'}</button>`,
      )
      marker.on('popupopen', () => {
        const btn = document.querySelector<HTMLButtonElement>(`button[data-toggle="${c.id}"]`)
        btn?.addEventListener('click', () => {
          onToggle(c.id)
          this.map.closePopup()
        })
      })
      marker.addTo(this.chargerLayer)
    }
  }

  fitToRoute(): void {
    if (this.routeBounds) this.map.fitBounds(this.routeBounds, { padding: [40, 40] })
  }
}
```

- [ ] **Step 2: Temporarily wire a demo in `src/main.ts` to verify rendering**

Replace `src/main.ts` contents with:

```ts
import { MapController } from './ui/map'

document.getElementById('app')!.innerHTML = '<div id="map" style="height:100vh"></div>'
const map = new MapController('map')
map.setRoute([
  { lat: 45.58, lng: -122.35 },
  { lat: 44.77, lng: -117.83 },
  { lat: 40.76, lng: -111.89 },
])
map.setChargers(
  [
    { id: 'a', name: 'Baker City', network: 'Electrify America', maxPowerKw: 350, lat: 44.77, lng: -117.83, detourMiles: 1.1, routePositionMeters: 250000 },
  ],
  new Set(),
  (id) => console.log('toggle', id),
)
map.fitToRoute()
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev` and open the localhost URL.
Expected: an OpenStreetMap map fills the screen, a blue route line runs Washougal→Baker City→SLC, an amber charger dot sits at Baker City; clicking it shows a popup with an "Add stop" button that logs `toggle a` to the console. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/ui/map.ts src/main.ts
git commit -m "feat: Leaflet map controller (route line + charger markers)"
```

---

## Task 11: App wiring + sidebar UI + end-to-end

**Files:**
- Create: `src/ui/app.ts`, `src/styles.css`
- Modify: `src/main.ts`, `index.html`

**Interfaces:**
- Consumes: everything from `src/lib/*` and `src/ui/map.ts`.
- Produces: `class App` with `constructor(root: HTMLElement)` and `start(): void` — the running application. No unit test; verified end-to-end in the browser.

This task assembles the whole flow:
1. Load settings; if `orsKey`/`ocmKey` are empty, prompt for them in the settings panel.
2. Origin/destination inputs with debounced Photon autocomplete.
3. When both are set, route origin→destination (ORS), draw it, sample the polyline, fetch EA chargers, annotate with detour + along-route position, filter by `maxDetourMiles`, render the browse list.
4. Toggling a charger re-routes with waypoints, computes per-leg miles, evaluates range, and renders the pinned itinerary with ⚠ on over-range legs.
5. "Open in Google Maps / Apple Maps" buttons build deep links (with waypoint-limit warning).
6. Settings panel edits efficiency table, range windows, planning speed, filters, and API keys; persists to localStorage.

- [ ] **Step 1: Create `src/styles.css`**

```css
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; font-family: system-ui, sans-serif; }
#layout { display: flex; height: 100%; }
#sidebar { width: 340px; min-width: 300px; overflow-y: auto; padding: 12px; border-right: 1px solid #e5e7eb; background: #fafafa; }
#map { flex: 1; height: 100%; }
.field { display: block; width: 100%; padding: 8px; margin: 4px 0; border: 1px solid #d1d5db; border-radius: 6px; }
.label { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-top: 12px; letter-spacing: .04em; }
.autocomplete { border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
.autocomplete div { padding: 6px 8px; cursor: pointer; font-size: 13px; }
.autocomplete div:hover { background: #eff6ff; }
.charger { padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; margin: 6px 0; cursor: pointer; font-size: 13px; background: #fff; }
.charger.selected { border-color: #16a34a; background: #f0fdf4; }
.charger .meta { color: #6b7280; font-size: 12px; }
.warn { color: #dc2626; font-weight: 600; }
.leg { color: #059669; font-size: 12px; }
.btn { display: block; width: 100%; padding: 10px; margin-top: 8px; border: none; border-radius: 6px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; }
.btn.secondary { background: #111827; }
.trip-stop { padding: 4px 0; font-size: 13px; }
details { margin-top: 12px; } summary { cursor: pointer; font-weight: 600; }
.row { display: flex; gap: 6px; align-items: center; }
.row input { width: 70px; }
.notice { background: #fef2f2; color: #991b1b; padding: 8px; border-radius: 6px; font-size: 13px; margin: 6px 0; }
```

- [ ] **Step 2: Create `src/ui/app.ts`**

```ts
import type { GeoResult, AnnotatedCharger, TripStop, Route } from '../types'
import { MapController } from './map'
import { searchAddress } from '../lib/geocoding'
import { fetchRoute } from '../lib/routing'
import { fetchChargersAlongRoute } from '../lib/chargers'
import { samplePolyline, pointToPolyline, metersToMiles } from '../lib/geometry'
import { orderStops, perLegMiles } from '../lib/trip'
import { milesPerPercentForSpeed, evaluateLegs } from '../lib/range'
import { googleMapsUrl, appleMapsUrl, waypointWarning } from '../lib/deeplink'
import { loadSettings, saveSettings, type Settings } from '../lib/settings'

const MILES_TO_METERS = 1609.344

export class App {
  private settings: Settings
  private map!: MapController
  private origin: GeoResult | null = null
  private destination: GeoResult | null = null
  private chargers: AnnotatedCharger[] = []
  private selected = new Set<string>()
  private tripRoute: Route | null = null
  private notice = ''

  constructor(private root: HTMLElement) {
    this.settings = loadSettings()
  }

  start(): void {
    this.root.innerHTML = `
      <div id="layout">
        <div id="sidebar"></div>
        <div id="map"></div>
      </div>`
    this.map = new MapController('map')
    this.render()
  }

  // ---- data flow ----

  private async recomputeBaseRoute(): Promise<void> {
    this.notice = ''
    if (!this.origin || !this.destination) return
    if (!this.settings.orsKey || !this.settings.ocmKey) {
      this.notice = 'Add your OpenRouteService and Open Charge Map keys in Settings below.'
      this.render()
      return
    }
    try {
      const base = await fetchRoute([this.origin, this.destination], this.settings.orsKey)
      this.map.setRoute(base.coordinates)
      this.map.fitToRoute()
      const samples = samplePolyline(base.coordinates, this.settings.sampleEveryMiles * MILES_TO_METERS)
      const raw = await fetchChargersAlongRoute(samples, this.settings.ocmKey, {
        networkContains: this.settings.networkContains,
        minPowerKw: this.settings.minPowerKw,
        radiusMiles: this.settings.radiusMiles,
        maxPerSample: 50,
      })
      this.chargers = raw
        .map((c) => {
          const { distanceMeters, alongMeters } = pointToPolyline({ lat: c.lat, lng: c.lng }, base.coordinates)
          return { ...c, detourMiles: metersToMiles(distanceMeters), routePositionMeters: alongMeters }
        })
        .filter((c) => c.detourMiles <= this.settings.maxDetourMiles)
        .sort((a, b) => a.routePositionMeters - b.routePositionMeters)
      // drop selections that are no longer present
      this.selected = new Set([...this.selected].filter((id) => this.chargers.some((c) => c.id === id)))
      await this.recomputeTripRoute()
    } catch (e) {
      this.notice = `Could not load route/chargers: ${(e as Error).message}`
      this.render()
    }
  }

  private async recomputeTripRoute(): Promise<void> {
    this.tripRoute = null
    if (this.origin && this.destination && this.selected.size > 0) {
      const chosen = this.chargers.filter((c) => this.selected.has(c.id))
      const stops = orderStops(this.origin, this.destination, chosen)
      try {
        this.tripRoute = await fetchRoute(stops, this.settings.orsKey)
        this.map.setRoute(this.tripRoute.coordinates)
      } catch (e) {
        this.notice = `Could not route with stops: ${(e as Error).message}`
      }
    } else if (this.origin && this.destination) {
      // no stops chosen: keep base route already drawn
    }
    this.map.setChargers(this.chargers, this.selected, (id) => this.toggleCharger(id))
    this.render()
  }

  private toggleCharger(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id)
    else this.selected.add(id)
    void this.recomputeTripRoute()
  }

  private orderedStops(): TripStop[] {
    if (!this.origin || !this.destination) return []
    const chosen = this.chargers.filter((c) => this.selected.has(c.id))
    return orderStops(this.origin, this.destination, chosen)
  }

  // ---- rendering ----

  private render(): void {
    const sidebar = document.getElementById('sidebar')!
    sidebar.innerHTML = ''
    sidebar.appendChild(this.renderInputs())
    if (this.notice) {
      const n = document.createElement('div')
      n.className = 'notice'
      n.textContent = this.notice
      sidebar.appendChild(n)
    }
    sidebar.appendChild(this.renderTrip())
    sidebar.appendChild(this.renderChargerList())
    sidebar.appendChild(this.renderSettings())
  }

  private renderInputs(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.appendChild(this.makeAddressInput('Origin (A)', this.origin, (r) => {
      this.origin = r
      void this.recomputeBaseRoute()
    }))
    wrap.appendChild(this.makeAddressInput('Destination (B)', this.destination, (r) => {
      this.destination = r
      void this.recomputeBaseRoute()
    }))
    return wrap
  }

  private makeAddressInput(label: string, current: GeoResult | null, onPick: (r: GeoResult) => void): HTMLElement {
    const wrap = document.createElement('div')
    const lbl = document.createElement('div')
    lbl.className = 'label'
    lbl.textContent = label
    const input = document.createElement('input')
    input.className = 'field'
    input.value = current?.label ?? ''
    input.placeholder = 'Type a place…'
    const list = document.createElement('div')
    list.className = 'autocomplete'
    list.style.display = 'none'

    let timer: ReturnType<typeof setTimeout>
    input.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const results = await searchAddress(input.value)
        list.innerHTML = ''
        list.style.display = results.length ? 'block' : 'none'
        for (const r of results) {
          const item = document.createElement('div')
          item.textContent = r.label
          item.addEventListener('click', () => {
            input.value = r.label
            list.style.display = 'none'
            onPick(r)
          })
          list.appendChild(item)
        }
      }, 350)
    })

    wrap.append(lbl, input, list)
    return wrap
  }

  private renderTrip(): HTMLElement {
    const wrap = document.createElement('div')
    const stops = this.orderedStops()
    if (stops.length < 2) return wrap

    const lbl = document.createElement('div')
    lbl.className = 'label'
    lbl.textContent = 'Your trip'
    wrap.appendChild(lbl)

    const mpp = milesPerPercentForSpeed(this.settings.efficiency, this.settings.planningSpeed)
    const legs = this.tripRoute ? perLegMiles(this.tripRoute) : []
    const statuses = evaluateLegs(legs, mpp, this.settings.range)

    stops.forEach((s, i) => {
      const stop = document.createElement('div')
      stop.className = 'trip-stop'
      stop.textContent = `${i === 0 ? '📍' : i === stops.length - 1 ? '🏁' : '⚡'} ${s.label}`
      wrap.appendChild(stop)
      if (i < stops.length - 1 && statuses[i]) {
        const leg = document.createElement('div')
        const st = statuses[i]
        leg.className = st.exceeds ? 'warn' : 'leg'
        leg.textContent = `↓ ${st.distanceMiles.toFixed(0)} mi${st.exceeds ? ` ⚠ exceeds ~${st.rangeMiles.toFixed(0)} mi range` : ''}`
        wrap.appendChild(leg)
      }
    })

    if (this.tripRoute) {
      const total = document.createElement('div')
      total.style.marginTop = '6px'
      total.innerHTML = `<b>Total ${metersToMiles(this.tripRoute.totalMeters).toFixed(0)} mi</b>`
      wrap.appendChild(total)
    }

    const warn = waypointWarning(stops)
    if (warn) {
      const w = document.createElement('div')
      w.className = 'notice'
      w.textContent = warn
      wrap.appendChild(w)
    } else {
      const g = document.createElement('a')
      g.className = 'btn'
      g.textContent = 'Open in Google Maps ▸'
      g.href = googleMapsUrl(stops)
      g.target = '_blank'
      g.rel = 'noopener'
      wrap.appendChild(g)

      const a = document.createElement('a')
      a.className = 'btn secondary'
      a.textContent = 'Open in Apple Maps ▸'
      a.href = appleMapsUrl(stops)
      a.target = '_blank'
      a.rel = 'noopener'
      wrap.appendChild(a)
    }
    return wrap
  }

  private renderChargerList(): HTMLElement {
    const wrap = document.createElement('div')
    const lbl = document.createElement('div')
    lbl.className = 'label'
    lbl.textContent = `Chargers near route (${this.chargers.length})`
    wrap.appendChild(lbl)

    let prevPos = 0
    for (const c of this.chargers) {
      const gapMiles = metersToMiles(c.routePositionMeters - prevPos)
      prevPos = c.routePositionMeters
      const row = document.createElement('div')
      row.className = 'charger' + (this.selected.has(c.id) ? ' selected' : '')
      row.innerHTML =
        `<div>${this.selected.has(c.id) ? '✅ ' : '⚡ '}${c.name}</div>` +
        `<div class="meta">+${c.detourMiles.toFixed(1)} mi off route · ${gapMiles.toFixed(0)} mi since previous · ${c.maxPowerKw} kW</div>`
      row.addEventListener('click', () => this.toggleCharger(c.id))
      wrap.appendChild(row)
    }
    return wrap
  }

  private renderSettings(): HTMLElement {
    const details = document.createElement('details')
    const summary = document.createElement('summary')
    summary.textContent = 'Settings (car, range, keys)'
    details.appendChild(summary)

    const s = this.settings
    const body = document.createElement('div')

    const numberField = (label: string, value: number, onChange: (v: number) => void) => {
      const row = document.createElement('div')
      row.className = 'row'
      row.innerHTML = `<span style="flex:1">${label}</span>`
      const inp = document.createElement('input')
      inp.type = 'number'
      inp.value = String(value)
      inp.addEventListener('change', () => onChange(parseFloat(inp.value)))
      row.appendChild(inp)
      return row
    }
    const textField = (label: string, value: string, onChange: (v: string) => void) => {
      const lbl = document.createElement('div')
      lbl.className = 'label'
      lbl.textContent = label
      const inp = document.createElement('input')
      inp.className = 'field'
      inp.value = value
      inp.addEventListener('change', () => onChange(inp.value))
      const w = document.createElement('div')
      w.append(lbl, inp)
      return w
    }

    body.appendChild(numberField('Planning speed (mph)', s.planningSpeed, (v) => { s.planningSpeed = v }))
    body.appendChild(numberField('Min power (kW)', s.minPowerKw, (v) => { s.minPowerKw = v }))
    body.appendChild(numberField('Start charge %', s.range.startPct, (v) => { s.range.startPct = v }))
    body.appendChild(numberField('Charge-to % (later legs)', s.range.chargeToPct, (v) => { s.range.chargeToPct = v }))
    body.appendChild(numberField('Reserve %', s.range.reservePct, (v) => { s.range.reservePct = v }))
    body.appendChild(numberField('Max detour (mi)', s.maxDetourMiles, (v) => { s.maxDetourMiles = v }))

    const effLabel = document.createElement('div')
    effLabel.className = 'label'
    effLabel.textContent = 'Efficiency (mi per %) by speed'
    body.appendChild(effLabel)
    s.efficiency.forEach((rowData) => {
      body.appendChild(
        numberField(`${rowData.speedMph} mph`, rowData.milesPerPercent, (v) => { rowData.milesPerPercent = v }),
      )
    })

    body.appendChild(textField('OpenRouteService key', s.orsKey, (v) => { s.orsKey = v }))
    body.appendChild(textField('Open Charge Map key', s.ocmKey, (v) => { s.ocmKey = v }))

    const save = document.createElement('button')
    save.className = 'btn'
    save.textContent = 'Save settings'
    save.addEventListener('click', () => {
      saveSettings(this.settings)
      void this.recomputeBaseRoute()
    })
    body.appendChild(save)

    details.appendChild(body)
    return details
  }
}
```

- [ ] **Step 3: Replace `src/main.ts` with the real entry point**

```ts
import './styles.css'
import { App } from './ui/app'

const app = new App(document.getElementById('app')!)
app.start()
```

- [ ] **Step 4: Confirm typecheck and unit tests still pass**

Run: `npm run build`
Expected: `tsc --noEmit` reports no type errors and Vite builds successfully.

Run: `npm test`
Expected: all module tests pass.

- [ ] **Step 5: Manual end-to-end verification**

Prerequisites: get a free OpenRouteService key (https://openrouteservice.org/dev/#/signup — no card) and a free Open Charge Map key (https://openchargemap.org/site/loginprovider/beginlogin — no card).

Run: `npm run dev`, open the localhost URL, then:
1. Open **Settings**, paste both keys, click **Save settings**.
2. Type "Washougal" in Origin, pick the suggestion; type "Salt Lake City" in Destination, pick it.
3. Expected: a route draws Washougal→SLC; within a few seconds the "Chargers near route" list fills with Electrify America sites showing `+X mi off route`, `Y mi since previous`, and `≥350 kW`.
4. Click 2–3 chargers. Expected: the route redraws through them; "Your trip" shows each leg's miles with `↓` and a red ⚠ on any leg longer than the computed range; a total appears.
5. Click **Open in Google Maps** — expected: a new tab opens Google Maps directions with all stops as waypoints.
6. Change **Planning speed** to 80 and Save — expected: range warnings tighten (shorter range → more ⚠).

Fix any issue found before committing.

- [ ] **Step 6: Commit**

```bash
git add src/ui/app.ts src/styles.css src/main.ts index.html
git commit -m "feat: app wiring, sidebar UI, and end-to-end trip planning"
```

---

## Task 12: README + deployment

**Files:**
- Create: `README.md`
- Modify: `package.json` (add homepage note only if using GitHub Pages base path — see below)

**Interfaces:**
- Consumes: nothing.
- Produces: setup + deploy documentation.

- [ ] **Step 1: Create `README.md`**

```markdown
# EV Route Planner

Plan an EV road trip that shows every Electrify America ≥350 kW charger near your
route, with detour distance and per-leg miles, then hands the finished multi-stop
route to Google Maps. Free to run — no credit card anywhere.

## Setup

1. `npm install`
2. Get two free API keys (neither requires a credit card):
   - OpenRouteService: https://openrouteservice.org/dev/#/signup
   - Open Charge Map: https://openchargemap.org/site/develop/api
3. `npm run dev`, open the printed URL, expand **Settings**, paste both keys, Save.

Keys are stored only in your browser's localStorage — nothing is committed or sent
to any server besides the two APIs above.

## Usage

Enter origin and destination. Electrify America ≥350 kW chargers near the route appear
with detour and gap distances. Click chargers to add them as stops; the trip panel
shows per-leg miles and warns when a leg exceeds your range. Tune your car's efficiency
table, charge windows, and planning speed in Settings. "Open in Google Maps" launches
the native app with all stops.

Defaults are set for a 2025 Kia EV6 Wind (800V); edit the efficiency table for your car.

## Test

`npm test`

## Deploy (free static hosting)

Build: `npm run build` → outputs `dist/`.

Any static host works. Easiest options:
- **Netlify / Vercel:** connect the repo; build command `npm run build`, publish dir `dist`.
- **GitHub Pages:** push `dist/` to a `gh-pages` branch (e.g. via the `gh-pages` npm
  package) and set `base: '/<repo-name>/'` in `vite.config.ts` first.
```

- [ ] **Step 2: Verify the build output**

Run: `npm run build && npm run preview`
Expected: preview serves the built app from `dist/`; open the URL and confirm the map + sidebar load (keys persist from your earlier localStorage). Stop the preview server.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: setup, usage, and deployment instructions"
```

---

## Self-Review Notes (author)

- **Spec coverage:** A→B input + immediate charger display (Tasks 7,6,5,11); detour distance (Tasks 2,11); gap-since-previous (Tasks 2,11 browse list; Task 8 exact legs); per-leg miles for chosen trip (Tasks 8,11); range hints/warnings via editable speed→mi/% table with 100→10 / 80→10 windows (Tasks 3,9,11); EA + ≥350 kW filter (Task 5); free/no-card stack (Global Constraints, Tasks 5–7,10); Google/Apple handoff + waypoint limit (Task 4,11); responsive layout A (Task 11 CSS); localStorage persistence (Task 9). No gaps found.
- **Type consistency:** shared types defined once in Task 1 and imported everywhere; `AnnotatedCharger` (with `detourMiles`, `routePositionMeters`) produced in Task 11 matches consumers in Tasks 8,10,11; `Settings` fields used in Task 11 all exist in Task 9's `DEFAULT_SETTINGS`.
- **Placeholders:** none — every code step contains complete code; UI tasks use manual verification (Leaflet needs a real DOM) rather than fabricated unit tests.
