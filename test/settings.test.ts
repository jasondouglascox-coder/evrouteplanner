import { describe, it, expect } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/lib/settings'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k) },
    setItem: (k: string, v: string) => { map.set(k, v) },
  }
}

describe('settings', () => {
  it('returns defaults when storage is empty', () => {
    const s = loadSettings(memoryStorage())
    expect(s.minPowerKw).toBe(350)
    expect(s.networkContains).toBe('Electrify America')
    expect(s.planningSpeed).toBe(70)
    expect(s.efficiency.length).toBe(5)
    expect(s.range).toEqual({ startPct: 100, chargeToPct: 80, reservePct: 10 })
  })

  it('round-trips saved settings', () => {
    const storage = memoryStorage()
    const custom = { ...DEFAULT_SETTINGS, planningSpeed: 75, orsKey: 'abc', ocmKey: 'xyz' }
    saveSettings(custom, storage)
    const loaded = loadSettings(storage)
    expect(loaded.planningSpeed).toBe(75)
    expect(loaded.orsKey).toBe('abc')
    expect(loaded.ocmKey).toBe('xyz')
  })

  it('merges partial stored settings over defaults', () => {
    const storage = memoryStorage()
    storage.setItem('ev-map-settings', JSON.stringify({ planningSpeed: 65 }))
    const loaded = loadSettings(storage)
    expect(loaded.planningSpeed).toBe(65)
    expect(loaded.minPowerKw).toBe(350) // default preserved
  })

  it('falls back to defaults on corrupt JSON', () => {
    const storage = memoryStorage()
    storage.setItem('ev-map-settings', 'not json')
    expect(loadSettings(storage).minPowerKw).toBe(350)
  })
})
