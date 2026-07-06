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
