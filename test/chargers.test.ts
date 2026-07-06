import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapPoi, filterChargers, dedupeChargers, fetchChargersAlongRoute, type OcmPoi } from '../src/lib/chargers'

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

describe('fetchChargersAlongRoute', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips failed samples and returns successful ones', async () => {
    const eaPoi = { ID: 201, AddressInfo: { Title: 'EA Site', Latitude: 44, Longitude: -117 }, OperatorInfo: { Title: 'Electrify America' }, Connections: [{ PowerKW: 350 }] }
    const opts = { networkContains: 'Electrify America', minPowerKw: 350, radiusMiles: 30, maxPerSample: 50 }
    const samples = [{ lat: 44, lng: -117 }, { lat: 45, lng: -118 }]

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [eaPoi] })
      .mockResolvedValueOnce({ ok: false })
    )

    const result = await fetchChargersAlongRoute(samples, 'test-key', opts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('201')
  })

  it('dedupes results across samples', async () => {
    const eaPoi = { ID: 201, AddressInfo: { Title: 'EA Site', Latitude: 44, Longitude: -117 }, OperatorInfo: { Title: 'Electrify America' }, Connections: [{ PowerKW: 350 }] }
    const opts = { networkContains: 'Electrify America', minPowerKw: 350, radiusMiles: 30, maxPerSample: 50 }
    const samples = [{ lat: 44, lng: -117 }, { lat: 45, lng: -118 }]

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [eaPoi] })
      .mockResolvedValueOnce({ ok: true, json: async () => [eaPoi] })
    )

    const result = await fetchChargersAlongRoute(samples, 'test-key', opts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('201')
  })
})
