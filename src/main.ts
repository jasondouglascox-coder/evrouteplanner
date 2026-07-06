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
