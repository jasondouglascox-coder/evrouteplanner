import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, AnnotatedCharger } from '../types'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const GREEN = '#16a34a'
const ORANGE = '#f59e0b'

export class MapController {
  private map: L.Map
  private routeLayer = L.layerGroup()
  private chargerLayer = L.layerGroup()
  private endpointLayer = L.layerGroup()
  private routeBounds: L.LatLngBounds | null = null
  private markers = new Map<string, { marker: L.CircleMarker; selected: boolean }>()

  constructor(elementId: string) {
    this.map = L.map(elementId).setView([44.5, -117], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map)
    this.routeLayer.addTo(this.map)
    this.endpointLayer.addTo(this.map)
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

  // Origin is drawn as a green dot (the first "green" point); destination as a
  // dark flag-colored dot. Both are non-interactive anchors.
  setEndpoints(origin: LatLng | null, destination: LatLng | null): void {
    this.endpointLayer.clearLayers()
    if (origin) {
      L.circleMarker([origin.lat, origin.lng], {
        radius: 9, color: '#fff', fillColor: GREEN, fillOpacity: 1, weight: 3,
      })
        .bindTooltip('Start', { direction: 'top' })
        .addTo(this.endpointLayer)
    }
    if (destination) {
      L.circleMarker([destination.lat, destination.lng], {
        radius: 9, color: '#fff', fillColor: '#111827', fillOpacity: 1, weight: 3,
      })
        .bindTooltip('Destination', { direction: 'top' })
        .addTo(this.endpointLayer)
    }
  }

  setChargers(
    chargers: AnnotatedCharger[],
    selectedIds: Set<string>,
    gapMilesById: Record<string, number>,
    onToggle: (id: string) => void,
    onHover: (id: string | null) => void,
  ): void {
    this.chargerLayer.clearLayers()
    this.markers.clear()
    for (const c of chargers) {
      const selected = selectedIds.has(c.id)
      const marker = L.circleMarker([c.lat, c.lng], this.baseStyle(selected))
      const gap = gapMilesById[c.id]
      const gapLine =
        gap === undefined ? '' : `<br><b>${gap.toFixed(0)} mi from last green stop</b>`
      marker.bindPopup(
        `<b>${escapeHtml(c.name)}</b><br>${c.maxPowerKw} kW · +${c.detourMiles.toFixed(1)} mi off route` +
          gapLine +
          `<br><button data-toggle="${c.id}">${selected ? 'Remove' : 'Select'}</button>`,
      )
      marker.on('popupopen', () => {
        const btn = document.querySelector<HTMLButtonElement>(`button[data-toggle="${c.id}"]`)
        btn?.addEventListener('click', () => { onToggle(c.id); this.map.closePopup() }, { once: true })
      })
      marker.on('mouseover', () => { this.setHighlight(c.id); onHover(c.id) })
      marker.on('mouseout', () => { this.setHighlight(null); onHover(null) })
      marker.addTo(this.chargerLayer)
      this.markers.set(c.id, { marker, selected })
    }
  }

  // Emphasize one charger marker (used when its list row is hovered, and on
  // marker hover). Passing null resets every marker to its base style.
  highlightCharger(id: string | null): void {
    this.setHighlight(id)
  }

  fitToRoute(): void {
    if (this.routeBounds) this.map.fitBounds(this.routeBounds, { padding: [40, 40] })
  }

  private baseStyle(selected: boolean): L.CircleMarkerOptions {
    const color = selected ? GREEN : ORANGE
    return { radius: selected ? 9 : 6, color, fillColor: color, fillOpacity: 0.9, weight: 2 }
  }

  private setHighlight(id: string | null): void {
    for (const [markerId, { marker, selected }] of this.markers) {
      if (markerId === id) {
        marker.setStyle({ color: '#2563eb', weight: 4 }).setRadius(selected ? 12 : 9)
        marker.bringToFront()
      } else {
        marker.setStyle(this.baseStyle(selected)).setRadius(selected ? 9 : 6)
      }
    }
  }
}
