# EV Route Planner — Design

**Date:** 2026-07-06
**Status:** Approved for planning

## Problem

Planning an EV road trip (e.g. Washougal, WA → Salt Lake City, UT) in Google Maps
requires juggling two tabs: one for the route, one for finding Electrify America
chargers along it. Even after picking stops, Google Maps only shows *total* trip
miles, never the miles **between legs** — which is exactly what matters for judging
whether each charging gap is within range.

This app is a **planning layer**. You enter A→B, it shows every qualifying charger
near the route with detour and gap distances, you pick stops, it shows per-leg miles
and flags range problems, then it hands the finished multi-stop route to the native
Google Maps app for turn-by-turn (which is trusted offline in remote areas).

## Goals

- Enter origin + destination, immediately see all qualifying chargers near the route.
- For each charger: **detour distance** (how far off-route) and **gap-since-previous**
  (miles from the previously chosen stop).
- Pick stops manually; see **per-leg miles** for the chosen itinerary (the thing Google
  Maps won't show).
- Smart range hints based on a user-editable, speed-keyed efficiency table.
- One tap: open the multi-stop route in the native Google Maps app (Apple Maps fallback).
- **Zero cost, no credit card anywhere.**
- Responsive: works on desktop (planning) and phone (on the road).

## Non-Goals (YAGNI)

- Full automatic route optimization (like A Better Route Planner). User picks stops;
  the app only advises.
- Live charger availability / pricing / reservations.
- User accounts / cloud sync. Settings live in browser localStorage.
- Networks other than Electrify America in v1 (power+network filter is EA-centric).

## Users / Context

- Single primary user, driving a **2025 Kia EV6 Wind** (800V platform — genuinely uses
  350kW EA stalls).
- Charger relevance is driven by **usable power for an 800V platform**, so the filter is
  "Electrify America" AND "≥350kW" by default. Network matters as a proxy for real
  delivered power (a Tesla 350 ≠ an EA 350 on an 800V car).

## Tech Stack (all free, no payment method required)

| Concern | Choice | Notes |
|---|---|---|
| Hosting | Static site (Vercel / Netlify / GitHub Pages) | No backend. |
| Map + tiles | Leaflet + OpenStreetMap tiles | No key, no card. |
| Routing + per-leg distances | OpenRouteService free tier | Free account, no card, ~2k req/day. Returns geometry + per-segment distances. |
| Address search / autocomplete | Photon (or Nominatim) OSM geocoding | Free, no key. Respect usage policy (debounce). |
| Charger data | Open Charge Map API | Free key, no card. Has operator (network) + per-connector kW → precise EA + ≥350kW filter. |
| Handoff | Google Maps / Apple Maps deep links | Plain URLs, always free. |
| Persistence | Browser localStorage | Efficiency table, filter defaults, range windows. |

Everything runs client-side in the browser.

## Architecture

Single-page app, no server. Logical modules (each independently testable):

1. **Geocoding** — text → {lat,lng,label}; autocomplete suggestions.
2. **Routing** — origin+dest (+chosen waypoints) → route polyline + ordered legs with
   per-leg distance. Wraps OpenRouteService.
3. **Charger source** — given a route polyline, return qualifying chargers. Samples
   points along the polyline, queries Open Charge Map nearby each, dedupes by station
   id, filters to Electrify America + min power. Wraps Open Charge Map.
4. **Geometry** — pure functions: distance from a point to a polyline (detour), and
   cumulative along-route distance of a point (for ordering + gap-since-previous).
5. **Range engine** — pure functions over the efficiency table: `mi/%` for a chosen
   speed; leg-1 range = `(startPct - reservePct) × mi/%`; later-leg range =
   `(chargeToPct - reservePct) × mi/%`. Produces "charge around here" markers and
   over-range ⚠ warnings for chosen gaps. Defaults: start 100%, chargeTo 80%,
   reserve 10% (all editable).
6. **Trip state** — selected stops (ordered by along-route position), derived per-leg
   miles, totals.
7. **Deep-link builder** — chosen stops → Google Maps / Apple Maps URLs. Warns if
   waypoint count exceeds Google's ~9-waypoint deep-link limit.
8. **UI (Layout A)** — see below.

### Data flow

```
inputs A,B ──▶ Routing ──▶ polyline + legs
                    │
                    ▼
              Charger source ──▶ chargers near route
                    │
      Geometry (detour + along-route position) ──▶ annotated charger list
                    │
   user picks stops ──▶ Trip state ──▶ Routing (re-route with waypoints)
                    │                        │
             Range engine (hints/warnings)   ▼ per-leg miles
                    │
                    ▼
             Deep-link builder ──▶ open in Google Maps
```

## UI — Layout A (left panel + big map)

Responsive: on phones the left panel becomes a bottom sheet dragged up over the map.

Left sidebar (top → bottom):
- **Origin / Destination** inputs with autocomplete.
- **Filters**: ☑ Electrify America · min power (default ≥350kW) · **planning speed**
  dropdown (drives the efficiency table). Link to edit the efficiency table + range
  windows.
- **Your trip** (pinned once stops chosen): ordered stops with `↓ 96 mi` per-leg gaps,
  running total, and **Open in Google Maps / Apple Maps** buttons.
- **Chargers near route** (browse list): each row = name · `+0.4mi` detour · `78mi`
  since previous stop · power. Click toggles add/remove (checkmark). Inline red ⚠ where
  a gap exceeds available range.

Map (fills remainder): route polyline + ⚡ pins; chosen stops highlighted. Clicking a
pin selects the matching list row and vice versa.

## Efficiency table (user-editable)

Source of truth is `mi/%` per steady speed; full-charge range and % cost for a distance
are derived. Seeded with the user's EV6 Wind values, editable and persisted:

| Steady speed | ~mi/% |
|---|---|
| 60 mph | 2.9 |
| 65 mph | 2.75 |
| 70 mph | 2.55 |
| 75 mph | 2.35 |
| 80 mph | 2.15 |

Derived for display: full range = `100 × mi/%`; cost for D miles = `D ÷ mi/% %`.

## Distances

- **Detour** (`+0.4mi`): shortest distance from the charger to the route polyline.
- **Gap-since-previous** (`78mi`): along-route distance between consecutive **chosen**
  stops — exact from routing legs once selected; approximated from along-polyline
  position before selection (for the browse list ordering + preview).

## Error / edge handling

- No route found → clear message, keep inputs.
- Charger API error / empty → show route anyway, note "couldn't load chargers, retry".
- Geocoding ambiguous → show suggestions, don't guess silently.
- API rate-limit → debounce autocomplete; cache route + charger results per input set.
- Chosen gap exceeds range → ⚠ on that leg, don't block (user may know a non-EA option).
- > 9 waypoints → warn before handoff; suggest trimming.
- Offline while planning → app needs network to plan; the *handoff* target (Google Maps)
  is what's trusted offline.

## Testing

- **Geometry** (pure): point-to-polyline detour and along-route position against known
  coordinates.
- **Range engine** (pure): leg-1 vs later-leg ranges, hint/warning thresholds, table
  edits, boundary percentages.
- **Deep-link builder**: URL shape, waypoint ordering, >9-waypoint warning, Apple vs
  Google.
- **Charger source**: dedupe + EA/power filter against a recorded Open Charge Map
  fixture (no live calls in tests).
- Manual end-to-end: Washougal → SLC produces sensible EA stops with plausible per-leg
  miles, and the Maps link opens the native app with all stops.

## Open items to resolve during planning

- Exact OpenRouteService endpoint/params for per-leg distances + polyline precision.
- Open Charge Map query radius + sampling interval along the polyline (coverage vs API
  calls).
- Along-route position algorithm for pre-selection gap preview (snap-to-polyline).
