import type { EfficiencyRow, RangeConfig } from '../types'

export const DEFAULT_EFFICIENCY: EfficiencyRow[] = [
  { speedMph: 60, milesPerPercent: 2.9 },
  { speedMph: 65, milesPerPercent: 2.75 },
  { speedMph: 70, milesPerPercent: 2.55 },
  { speedMph: 75, milesPerPercent: 2.35 },
  { speedMph: 80, milesPerPercent: 2.15 },
]

export const DEFAULT_RANGE: RangeConfig = { startPct: 100, chargeToPct: 80, reservePct: 10 }

export interface Settings {
  efficiency: EfficiencyRow[]
  range: RangeConfig
  planningSpeed: number
  minPowerKw: number
  networkContains: string
  maxDetourMiles: number
  radiusMiles: number
  sampleEveryMiles: number
  orsKey: string
  ocmKey: string
}

export const DEFAULT_SETTINGS: Settings = {
  efficiency: DEFAULT_EFFICIENCY,
  range: DEFAULT_RANGE,
  planningSpeed: 70,
  minPowerKw: 350,
  networkContains: 'Electrify America',
  maxDetourMiles: 5,
  radiusMiles: 30,
  sampleEveryMiles: 40,
  orsKey: '',
  ocmKey: '',
}

const STORAGE_KEY = 'ev-map-settings'

export function loadSettings(storage: Storage = localStorage): Settings {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return structuredClone(DEFAULT_SETTINGS)
  try {
    return structuredClone({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) })
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(s: Settings, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(s))
}
