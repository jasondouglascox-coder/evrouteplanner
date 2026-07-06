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

// Build-time env fallback for API keys (Vite injects import.meta.env). Only
// present when a local .env file supplies VITE_ORS_KEY / VITE_OCM_KEY; the
// public Pages build has neither, so keys never get baked into that bundle.
// Guarded so the pure function still works under non-Vite (test) contexts.
function envKeys(): { orsKey: string; ocmKey: string } {
  const env = ((import.meta as unknown as { env?: Record<string, string | boolean> }).env) ?? {}
  // Only ever surface env keys in dev mode. A production build (npm run build)
  // never bakes them in, even if a local .env file is present — so the public
  // Pages bundle is always key-free and users enter keys via the Settings panel.
  if (!env.DEV) return { orsKey: '', ocmKey: '' }
  return { orsKey: String(env.VITE_ORS_KEY ?? ''), ocmKey: String(env.VITE_OCM_KEY ?? '') }
}

export function loadSettings(storage: Storage = localStorage): Settings {
  const raw = storage.getItem(STORAGE_KEY)
  let merged: Settings = structuredClone(DEFAULT_SETTINGS)
  if (raw) {
    try {
      merged = structuredClone({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) })
    } catch {
      merged = structuredClone(DEFAULT_SETTINGS)
    }
  }
  // Fill blank keys from the build-time env (stored/panel values win).
  const env = envKeys()
  if (!merged.orsKey) merged.orsKey = env.orsKey
  if (!merged.ocmKey) merged.ocmKey = env.ocmKey
  return merged
}

export function saveSettings(s: Settings, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(s))
}
