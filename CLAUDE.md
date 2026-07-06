# EV Route Planner — project notes

Free, no-credit-card web app to plan an EV road trip: enter A→B, see all Electrify
America ≥350 kW chargers near the route with detour + per-leg distances, pick stops
with range warnings, then hand the multi-stop route to native Google/Apple Maps.
Designed around a 2025 Kia EV6 Wind (800V); efficiency is a user-editable speed→mi/%
table. See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the full design.

## Stack (all free, no payment method)

- Vite + TypeScript, Vitest for tests
- Leaflet + OpenStreetMap tiles (map)
- OpenRouteService (routing + per-leg distances)
- Photon (address geocoding/autocomplete)
- Open Charge Map (charger data)
- Static site, no backend. Keys live in the browser (Settings panel / localStorage).

## Commands

- `npm install` — install deps
- `npm run dev` — dev server at http://localhost:5173/ (base path is `/` in dev)
- `npm test` — Vitest unit suite (46 tests; pure-logic modules are fully tested)
- `npm run build` — typecheck + production build to `dist/` (base `/evrouteplanner/`)
- `npm run preview` — serve the production build locally

## Architecture

Pure-logic modules under `src/lib/` (unit-tested): `geometry` (haversine, detour,
along-route position, sampling), `range` (efficiency table + per-leg range checks),
`deeplink` (Google/Apple Maps URLs + waypoint limit), `chargers` (Open Charge Map
map/filter/dedupe + fetch), `routing` (OpenRouteService parse + fetch), `geocoding`
(Photon parse + search), `trip` (order stops, per-leg miles), `settings` (defaults +
localStorage + dev env fallback).

UI under `src/ui/`: `map.ts` (Leaflet controller) and `app.ts` (state + sidebar +
wiring). UI has no unit tests by design (needs a real DOM) — verified via build +
manual browser check. `src/types.ts` holds shared types; internal distances are in
METERS, converted to miles only at the UI boundary (1 mi = 1609.344 m).

Security: charger names come from untrusted Open Charge Map data and are HTML-escaped
(`escapeHtml`) before any `innerHTML` in both `map.ts` and `app.ts`.

## API keys

Two free keys are required (neither needs a credit card):
- OpenRouteService: https://openrouteservice.org/dev
- Open Charge Map: https://openchargemap.org/site/develop/api

**Local dev:** put them in `.env.development.local` (gitignored) as `VITE_ORS_KEY`
and `VITE_OCM_KEY`; `loadSettings()` auto-fills them in dev mode. See `.env.example`.
Production builds never read these — a build stays key-free even locally, so the
public bundle can't leak keys.

**Deployed (Pages):** enter the keys once in the in-app **Settings** panel; they
persist in localStorage per browser and are never committed or bundled.

## Deploy — GitHub Pages

`.github/workflows/deploy.yml` builds, tests, and deploys to Pages on every push to
`main`. One-time setup: repo **Settings → Pages → Build and deployment → Source =
GitHub Actions**. Live URL: https://jasondouglascox-coder.github.io/evrouteplanner/

If the repo is ever renamed, update `base` in `vite.config.ts` to `/<new-name>/`.

## Pushing

The remote is on GitHub under `jasondouglascox-coder`. This clone is configured with
a repo-local `core.sshCommand` pointing at the SSH key registered on that account, so
`git push` works without extra flags.
