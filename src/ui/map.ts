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
        `<b>${escapeHtml(c.name)}</b><br>${c.maxPowerKw} kW · +${c.detourMiles.toFixed(1)} mi off route` +
          `<br><button data-toggle="${c.id}">${selected ? 'Remove stop' : 'Add stop'}</button>`,
      )
      marker.on('popupopen', () => {
        const btn = document.querySelector<HTMLButtonElement>(`button[data-toggle="${c.id}"]`)
        btn?.addEventListener('click', () => {
          onToggle(c.id)
          this.map.closePopup()
        }, { once: true })
      })
      marker.addTo(this.chargerLayer)
    }
  }

  fitToRoute(): void {
    if (this.routeBounds) this.map.fitBounds(this.routeBounds, { padding: [40, 40] })
  }
}
