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

// Charger names come from the untrusted OpenChargeMap API. Any such value that
// is interpolated into an innerHTML template must be escaped first.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export class App {
  private settings: Settings
  private map!: MapController
  private origin: GeoResult | null = null
  private destination: GeoResult | null = null
  private chargers: AnnotatedCharger[] = []
  private selected = new Set<string>()
  private tripRoute: Route | null = null
  private baseRoute: Route | null = null
  private notice = ''
  private generation = 0

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
    const gen = ++this.generation
    this.notice = ''
    if (!this.origin || !this.destination) return
    if (!this.settings.orsKey || !this.settings.ocmKey) {
      this.notice = 'Add your OpenRouteService and Open Charge Map keys in Settings below.'
      this.render()
      return
    }
    // clear stale chargers/selection so nothing from the previous route can be
    // interacted with (and bump the generation) while this fetch is in flight
    this.chargers = []
    this.selected.clear()
    this.tripRoute = null
    this.map.setChargers([], this.selected, (id) => this.toggleCharger(id))
    this.render()
    try {
      const base = await fetchRoute([this.origin, this.destination], this.settings.orsKey)
      if (gen !== this.generation) return
      this.baseRoute = base
      this.map.setRoute(base.coordinates)
      this.map.fitToRoute()
      const samples = samplePolyline(base.coordinates, this.settings.sampleEveryMiles * MILES_TO_METERS)
      const raw = await fetchChargersAlongRoute(samples, this.settings.ocmKey, {
        networkContains: this.settings.networkContains,
        minPowerKw: this.settings.minPowerKw,
        radiusMiles: this.settings.radiusMiles,
        maxPerSample: 50,
      })
      if (gen !== this.generation) return
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
      if (gen !== this.generation) return
      this.notice = `Could not load route/chargers: ${(e as Error).message}`
      this.render()
    }
  }

  private async recomputeTripRoute(): Promise<void> {
    const gen = ++this.generation
    this.notice = ''
    this.tripRoute = null
    if (this.origin && this.destination && this.selected.size > 0) {
      const chosen = this.chargers.filter((c) => this.selected.has(c.id))
      const stops = orderStops(this.origin, this.destination, chosen)
      try {
        const route = await fetchRoute(stops, this.settings.orsKey)
        if (gen !== this.generation) return
        this.tripRoute = route
        this.map.setRoute(this.tripRoute.coordinates)
      } catch (e) {
        if (gen !== this.generation) return
        this.notice = `Could not route with stops: ${(e as Error).message}`
      }
    } else if (this.origin && this.destination) {
      // no stops chosen: redraw the base origin->destination route
      this.map.setRoute(this.baseRoute?.coordinates ?? [])
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
      // NOTE: stop labels are placed via .textContent, which is already safe
      // against HTML injection — no escaping needed here.
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
      // Numeric value only — safe to interpolate into innerHTML without escaping.
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
      // SECURITY: c.name comes from the untrusted OpenChargeMap API and is
      // interpolated into innerHTML — it must be HTML-escaped. Numeric fields
      // (detourMiles, gapMiles, maxPowerKw) are safe as-is.
      row.innerHTML =
        `<div>${this.selected.has(c.id) ? '✅ ' : '⚡ '}${escapeHtml(c.name)}</div>` +
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
      // label is a hardcoded string literal from this file, not untrusted input.
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
