import type { GeoResult, AnnotatedCharger, TripStop, Route } from '../types'
import { MapController } from './map'
import { searchAddress } from '../lib/geocoding'
import { fetchRoute } from '../lib/routing'
import { fetchChargersAlongRoute } from '../lib/chargers'
import { samplePolyline, pointToPolyline, metersToMiles } from '../lib/geometry'
import { orderStops, perLegMiles, gapFromLastGreenMeters, type OrderedIntermediate } from '../lib/trip'
import { evaluateTrip, type TripLeg } from '../lib/range'
import { googleMapsUrl, appleMapsUrl, waypointWarning } from '../lib/deeplink'
import { loadSettings, saveSettings, type Settings } from '../lib/settings'

const MILES_TO_METERS = 1609.344

// Selectable charger networks -> Open Charge Map operator IDs. Note: GM Energy is
// not a distinct OCM operator; its public charging runs through EVgo / others.
const NETWORKS: { name: string; ids: number[] }[] = [
  { name: 'Electrify America', ids: [3318, 3400] },
  { name: 'EVgo', ids: [15, 3252] },
  { name: 'Tesla / NACS', ids: [3534, 23] },
  { name: 'ChargePoint', ids: [5] },
  { name: 'IONNA', ids: [3831] },
  { name: 'Rivian Adventure', ids: [3607] },
  { name: 'Francis Energy', ids: [3733] },
  { name: 'Mercedes-Benz HPC', ids: [3827] },
  { name: 'Shell Recharge (US)', ids: [59] },
  { name: 'BP Pulse (US)', ids: [3788] },
]

// A manual waypoint slot. `place` is null until the user picks one; `charge`
// marks whether the battery is recharged there (default no — pass-through).
interface ManualStop {
  place: GeoResult | null
  charge: boolean
}

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
  private manualStops: ManualStop[] = []
  private chargers: AnnotatedCharger[] = []
  private selected = new Set<string>()
  // Per-leg cruising-speed overrides (index = leg). Falls back to the default
  // planning speed. Reset whenever the stop set changes structurally.
  private legSpeeds: (number | null)[] = []
  private tripRoute: Route | null = null
  private baseRoute: Route | null = null
  private notice = ''
  private loading = false
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

  private baseWaypoints(): GeoResult[] {
    const picked = this.manualStops.map((s) => s.place).filter((p): p is GeoResult => p !== null)
    return [this.origin as GeoResult, ...picked, this.destination as GeoResult]
  }

  // Intermediate stops (manual waypoints + selected chargers) positioned along
  // the base route, for ordering and for the final multi-stop route.
  private buildIntermediates(): OrderedIntermediate[] {
    const poly = this.baseRoute?.coordinates ?? []
    const posOf = (lat: number, lng: number) =>
      poly.length ? pointToPolyline({ lat, lng }, poly).alongMeters : 0
    const manual: OrderedIntermediate[] = this.manualStops
      .filter((s): s is { place: GeoResult; charge: boolean } => s.place !== null)
      .map((s) => ({
        label: s.place.label,
        lat: s.place.lat,
        lng: s.place.lng,
        routePositionMeters: posOf(s.place.lat, s.place.lng),
        charge: s.charge,
      }))
    const chargers: OrderedIntermediate[] = this.chargers
      .filter((c) => this.selected.has(c.id))
      .map((c) => ({
        label: c.name,
        lat: c.lat,
        lng: c.lng,
        chargerId: c.id,
        routePositionMeters: c.routePositionMeters,
        charge: true,
      }))
    return [...manual, ...chargers]
  }

  private speedForLeg(i: number): number {
    return this.legSpeeds[i] ?? this.settings.planningSpeed
  }

  private async recomputeBaseRoute(): Promise<void> {
    const gen = ++this.generation
    this.notice = ''
    this.legSpeeds = []
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
    this.loading = true
    this.map.setChargers([], this.selected, {}, (id) => this.toggleCharger(id), (id) => this.highlightRow(id))
    this.render()
    try {
      const base = await fetchRoute(this.baseWaypoints(), this.settings.orsKey)
      if (gen !== this.generation) return
      this.baseRoute = base
      this.map.setRoute(base.coordinates)
      this.map.setEndpoints(this.origin, this.destination)
      this.map.fitToRoute()
      const samples = samplePolyline(base.coordinates, this.settings.sampleEveryMiles * MILES_TO_METERS)
      const raw = await fetchChargersAlongRoute(samples, this.settings.ocmKey, {
        operatorIds: this.settings.operatorIds,
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
      this.loading = false
      this.notice = `Could not load route/chargers: ${(e as Error).message}`
      this.render()
    }
  }

  private async recomputeTripRoute(): Promise<void> {
    const gen = ++this.generation
    this.notice = ''
    this.tripRoute = null
    this.loading = true
    this.legSpeeds = [] // leg count may change; drop stale per-leg overrides
    // Reflect the selection/loading state immediately, before the (async) route.
    this.paintChargers()
    this.render()
    if (this.origin && this.destination && this.selected.size > 0) {
      const stops = orderStops(this.origin, this.destination, this.buildIntermediates())
      try {
        const route = await fetchRoute(stops, this.settings.orsKey)
        if (gen !== this.generation) return
        this.tripRoute = route
        this.map.setRoute(route.coordinates)
      } catch (e) {
        if (gen !== this.generation) return
        this.notice = `Could not route with stops: ${(e as Error).message}`
      }
    } else if (this.origin && this.destination) {
      // no chargers chosen: the base route already runs through any manual stops
      this.tripRoute = this.baseRoute
      this.map.setRoute(this.baseRoute?.coordinates ?? [])
    }
    if (gen !== this.generation) return
    this.loading = false
    this.paintChargers()
    this.render()
  }

  // Push current chargers + gap distances to the map.
  private paintChargers(): void {
    const gapMeters = gapFromLastGreenMeters(this.chargers, this.selected)
    const gapMilesById: Record<string, number> = {}
    for (const id in gapMeters) gapMilesById[id] = metersToMiles(gapMeters[id])
    this.map.setChargers(
      this.chargers,
      this.selected,
      gapMilesById,
      (id) => this.toggleCharger(id),
      (id) => this.highlightRow(id),
    )
  }

  // Highlight the side-panel row for a charger (driven by map-marker hover).
  private highlightRow(id: string | null): void {
    const sidebar = document.getElementById('sidebar')
    if (!sidebar) return
    sidebar.querySelectorAll('.charger.hover').forEach((el) => el.classList.remove('hover'))
    if (id) {
      const row = sidebar.querySelector<HTMLElement>(`[data-charger-id="${CSS.escape(id)}"]`)
      if (row) {
        row.classList.add('hover')
        row.scrollIntoView({ block: 'nearest' })
      }
    }
  }

  private toggleCharger(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id)
    else this.selected.add(id)
    void this.recomputeTripRoute()
  }

  private orderedStops(): TripStop[] {
    if (!this.origin || !this.destination) return []
    return orderStops(this.origin, this.destination, this.buildIntermediates())
  }

  // ---- rendering ----

  private render(): void {
    const sidebar = document.getElementById('sidebar')!
    sidebar.innerHTML = ''
    sidebar.appendChild(this.renderInputs())
    sidebar.appendChild(this.renderSpeed())
    if (this.loading) {
      const l = document.createElement('div')
      l.className = 'loading'
      l.innerHTML = '<span class="spinner"></span> Updating route…'
      sidebar.appendChild(l)
    }
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

    // Manual intermediate stops: address input, "charge here" toggle, remove.
    this.manualStops.forEach((stop, i) => {
      const row = document.createElement('div')
      row.className = 'stop-row'
      const field = this.makeAddressInput(`Stop ${i + 1}`, stop.place, (r) => {
        this.manualStops[i].place = r
        void this.recomputeBaseRoute()
      })
      field.style.flex = '1'
      const remove = document.createElement('button')
      remove.className = 'remove-stop'
      remove.textContent = '✕'
      remove.title = 'Remove stop'
      remove.addEventListener('click', () => {
        const had = this.manualStops[i].place !== null
        this.manualStops.splice(i, 1)
        if (had) void this.recomputeBaseRoute()
        else this.render()
      })
      row.append(field, remove)
      wrap.appendChild(row)

      const chargeLabel = document.createElement('label')
      chargeLabel.className = 'charge-toggle'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = stop.charge
      cb.addEventListener('change', () => {
        this.manualStops[i].charge = cb.checked
        this.render() // affects range only, not the route geometry
      })
      chargeLabel.append(cb, document.createTextNode(' ⚡ I charge at this stop'))
      wrap.appendChild(chargeLabel)
    })

    const addBtn = document.createElement('button')
    addBtn.className = 'add-stop'
    addBtn.textContent = '+ Add stop'
    addBtn.addEventListener('click', () => {
      this.manualStops.push({ place: null, charge: false })
      this.render()
    })
    wrap.appendChild(addBtn)

    wrap.appendChild(this.makeAddressInput('Destination (B)', this.destination, (r) => {
      this.destination = r
      void this.recomputeBaseRoute()
    }))
    return wrap
  }

  // Prominent default planning speed (per-leg overrides live in the itinerary).
  private renderSpeed(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'speed-row'
    const lbl = document.createElement('span')
    lbl.textContent = 'Planning speed'
    const sel = this.makeSpeedSelect(this.settings.planningSpeed, (v) => {
      this.settings.planningSpeed = v
      this.legSpeeds = []
      saveSettings(this.settings)
      this.render()
    })
    wrap.append(lbl, sel)
    return wrap
  }

  private makeSpeedSelect(value: number, onChange: (v: number) => void): HTMLSelectElement {
    const sel = document.createElement('select')
    sel.className = 'speed-select'
    const speeds = this.settings.efficiency.map((r) => r.speedMph)
    if (!speeds.includes(value)) speeds.push(value)
    speeds.sort((a, b) => a - b)
    for (const sp of speeds) {
      const opt = document.createElement('option')
      opt.value = String(sp)
      opt.textContent = `${sp} mph`
      if (sp === value) opt.selected = true
      sel.appendChild(opt)
    }
    sel.addEventListener('change', () => onChange(parseFloat(sel.value)))
    return sel
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

    const legMiles = this.tripRoute ? perLegMiles(this.tripRoute) : []
    const tripLegs: TripLeg[] = legMiles.map((d, i) => ({
      distanceMiles: d,
      speedMph: this.speedForLeg(i),
      chargeAtEnd: !!stops[i + 1]?.charge,
    }))
    const evals = evaluateTrip(tripLegs, this.settings.efficiency, this.settings.range)

    stops.forEach((s, i) => {
      const stop = document.createElement('div')
      stop.className = 'trip-stop'
      // NOTE: labels via .textContent are already injection-safe.
      const icon = i === 0 ? '📍' : i === stops.length - 1 ? '🏁' : s.chargerId ? '⚡' : s.charge ? '🔌' : '📍'
      stop.textContent = `${icon} ${s.label}`
      wrap.appendChild(stop)

      if (i < stops.length - 1 && evals[i]) {
        const ev = evals[i]
        const leg = document.createElement('div')
        leg.className = 'leg-row' + (ev.exceeds ? ' warn' : '')
        const dist = document.createElement('span')
        dist.textContent = `↓ ${ev.distanceMiles.toFixed(0)} mi`
        leg.appendChild(dist)
        // per-leg speed override
        const sel = this.makeSpeedSelect(this.speedForLeg(i), (v) => {
          this.legSpeeds[i] = v
          this.render()
        })
        leg.appendChild(sel)
        if (ev.exceeds) {
          const w = document.createElement('span')
          w.textContent = '⚠ charge before here'
          leg.appendChild(w)
        }
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
      row.dataset.chargerId = c.id
      // SECURITY: c.name / c.network come from the untrusted OpenChargeMap API and
      // are interpolated into innerHTML — they must be HTML-escaped. Numeric fields
      // (detourMiles, gapMiles, maxPowerKw) are safe as-is.
      row.innerHTML =
        `<div>${this.selected.has(c.id) ? '✅ ' : '⚡ '}${escapeHtml(c.name)}</div>` +
        `<div class="meta">${escapeHtml(c.network)} · +${c.detourMiles.toFixed(1)} mi off route · ${gapMiles.toFixed(0)} mi since previous · ${c.maxPowerKw} kW</div>`
      row.addEventListener('click', () => this.toggleCharger(c.id))
      row.addEventListener('mouseenter', () => this.map.highlightCharger(c.id))
      row.addEventListener('mouseleave', () => this.map.highlightCharger(null))
      wrap.appendChild(row)
    }
    return wrap
  }

  private renderSettings(): HTMLElement {
    const details = document.createElement('details')
    const summary = document.createElement('summary')
    summary.textContent = 'Settings (networks, car, range, keys)'
    details.appendChild(summary)

    const s = this.settings
    const body = document.createElement('div')

    const numberField = (label: string, value: number, onChange: (v: number) => void) => {
      const row = document.createElement('div')
      row.className = 'row'
      const lbl = document.createElement('span')
      lbl.style.flex = '1'
      lbl.textContent = label
      row.appendChild(lbl)
      const inp = document.createElement('input')
      inp.type = 'number'
      inp.value = String(value)
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value)
        if (Number.isFinite(v)) onChange(v)
        else inp.value = String(value)
      })
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

    // Networks (checkboxes) -> operatorIds
    const netLabel = document.createElement('div')
    netLabel.className = 'label'
    netLabel.textContent = 'Networks'
    body.appendChild(netLabel)
    for (const net of NETWORKS) {
      const on = net.ids.every((id) => s.operatorIds.includes(id))
      const row = document.createElement('label')
      row.className = 'charge-toggle'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = on
      cb.addEventListener('change', () => {
        const set = new Set(s.operatorIds)
        if (cb.checked) net.ids.forEach((id) => set.add(id))
        else net.ids.forEach((id) => set.delete(id))
        s.operatorIds = [...set]
        saveSettings(this.settings)
        void this.recomputeBaseRoute()
      })
      row.append(cb, document.createTextNode(' ' + net.name))
      body.appendChild(row)
    }

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
    let savedTimer: ReturnType<typeof setTimeout> | undefined
    save.addEventListener('click', () => {
      saveSettings(this.settings)
      save.textContent = 'Saved ✓'
      save.classList.add('saved')
      clearTimeout(savedTimer)
      savedTimer = setTimeout(() => {
        save.textContent = 'Save settings'
        save.classList.remove('saved')
      }, 1800)
      void this.recomputeBaseRoute()
    })
    body.appendChild(save)

    details.appendChild(body)
    return details
  }
}
