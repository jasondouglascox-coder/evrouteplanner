import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapPoi, filterChargers, dedupeChargers, fetchChargersAlongRoute, clearChargerCache, type OcmPoi } from '../src/lib/chargers'

const fixture: OcmPoi[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/ocm-sample.json', import.meta.url)), 'utf-8'),
)

describe('mapPoi', () => {
  it('takes the max connector power and resolves operator name from id', () => {
    const c = mapPoi(fixture[0])
    expect(c.maxPowerKw).toBe(350)
    expect(c.operatorId).toBe(3318)
    expect(c.network).toBe('Electrify America')
    expect(c.id).toBe('101')
  })
})

describe('filterChargers', () => {
  it('keeps only allowed-operator stations at or above min power', () => {
    const result = filterChargers(fixture, { operatorIds: [3318], minPowerKw: 350 })
    // EA (3318) >=350: ID 101 (twice); excludes EVgo op 15 (102) and EA-150 (103)
    expect(result.every((c) => c.operatorId === 3318)).toBe(true)
    expect(result.every((c) => c.maxPowerKw >= 350)).toBe(true)
    expect(result.some((c) => c.id === '102')).toBe(false)
    expect(result.some((c) => c.id === '103')).toBe(false)
  })
})

describe('dedupeChargers', () => {
  it('removes duplicate ids', () => {
    const filtered = filterChargers(fixture, { operatorIds: [3318], minPowerKw: 350 })
    const deduped = dedupeChargers(filtered)
    expect(deduped.filter((c) => c.id === '101').length).toBe(1)
  })
})

describe('fetchChargersAlongRoute', () => {
  beforeEach(() => clearChargerCache())
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const eaPoi = { ID: 201, OperatorID: 3318, AddressInfo: { Title: 'EA Site', Latitude: 44, Longitude: -117 }, Connections: [{ PowerKW: 350 }] }
  const opts = { operatorIds: [3318], minPowerKw: 350, radiusMiles: 30, maxPerSample: 50 }
  const samples = [{ lat: 44, lng: -117 }, { lat: 45, lng: -118 }]

  it('skips failed samples and returns successful ones', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [eaPoi] })
      .mockResolvedValueOnce({ ok: false })
    )

    const result = await fetchChargersAlongRoute(samples, 'test-key', opts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('201')
  })

  it('dedupes results across samples', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [eaPoi] })
      .mockResolvedValueOnce({ ok: true, json: async () => [eaPoi] })
    )

    const result = await fetchChargersAlongRoute(samples, 'test-key', opts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('201')
  })

  it('passes the operator id filter to the OCM request', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => [eaPoi] })
    vi.stubGlobal('fetch', spy)
    await fetchChargersAlongRoute([{ lat: 44, lng: -117 }], 'test-key', opts)
    expect(spy).toHaveBeenCalled()
    const url = String(spy.mock.calls[0][0])
    expect(url).toContain('operatorid=3318')
  })

  it('caches by grid cell so overlapping samples are not re-fetched', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => [eaPoi] })
    vi.stubGlobal('fetch', spy)
    // three samples within the same ~7-mi grid cell (round to 0.1 deg)
    await fetchChargersAlongRoute([{ lat: 44.01, lng: -117.02 }, { lat: 44.03, lng: -117.04 }, { lat: 44.02, lng: -117.01 }], 'k', opts)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
