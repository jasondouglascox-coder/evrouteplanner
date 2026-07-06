import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parsePhoton, searchAddress } from '../src/lib/geocoding'

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/photon.json', import.meta.url)), 'utf-8'),
)

describe('parsePhoton', () => {
  it('builds a readable label and lat/lng', () => {
    const results = parsePhoton(fixture)
    expect(results[0].label).toBe('Washougal, Washington, United States')
    expect(results[0].lat).toBe(45.5829)
    expect(results[0].lng).toBe(-122.3543)
  })
  it('returns one result per feature', () => {
    expect(parsePhoton(fixture).length).toBe(2)
  })
  it('handles empty responses', () => {
    expect(parsePhoton({ features: [] })).toEqual([])
  })
  it('drops missing label parts and falls back city||county', () => {
    const r = parsePhoton({ features: [{ geometry: { coordinates: [-100, 40] }, properties: { name: 'Foo', city: 'Bar' } }] })
    expect(r[0].label).toBe('Foo, Bar')
  })
  it('keeps only US/CA/MX results and drops other countries', () => {
    const r = parsePhoton({
      features: [
        { geometry: { coordinates: [-100, 40] }, properties: { name: 'US Town', countrycode: 'US' } },
        { geometry: { coordinates: [-79, 43] }, properties: { name: 'CA Town', countrycode: 'CA' } },
        { geometry: { coordinates: [-99, 19] }, properties: { name: 'MX Town', countrycode: 'MX' } },
        { geometry: { coordinates: [0, 51] }, properties: { name: 'London', countrycode: 'GB' } },
      ],
    })
    expect(r.map((x) => x.label)).toEqual(['US Town', 'CA Town', 'MX Town'])
  })
})

describe('searchAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns [] for a query under 3 chars and does not call fetch', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const result = await searchAddress('ab')
    expect(result).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })

  it('returns [] when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await searchAddress('portland')
    expect(result).toEqual([])
  })

  it('returns [] when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const result = await searchAddress('portland')
    expect(result).toEqual([])
  })
})
