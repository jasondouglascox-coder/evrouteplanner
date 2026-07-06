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
