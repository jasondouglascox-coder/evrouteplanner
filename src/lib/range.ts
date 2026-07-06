import type { EfficiencyRow, RangeConfig } from '../types'

export function milesPerPercentForSpeed(table: EfficiencyRow[], speedMph: number): number {
  if (table.length === 0) throw new Error('empty efficiency table')
  const sorted = [...table].sort((a, b) => a.speedMph - b.speedMph)
  const exact = sorted.find((r) => r.speedMph === speedMph)
  if (exact) return exact.milesPerPercent
  if (speedMph <= sorted[0].speedMph) return sorted[0].milesPerPercent
  const last = sorted[sorted.length - 1]
  if (speedMph >= last.speedMph) return last.milesPerPercent
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (speedMph > a.speedMph && speedMph < b.speedMph) {
      const f = (speedMph - a.speedMph) / (b.speedMph - a.speedMph)
      return a.milesPerPercent + f * (b.milesPerPercent - a.milesPerPercent)
    }
  }
  return last.milesPerPercent
}

export function legRangeMiles(milesPerPercent: number, cfg: RangeConfig, isFirstLeg: boolean): number {
  const usablePct = isFirstLeg ? cfg.startPct - cfg.reservePct : cfg.chargeToPct - cfg.reservePct
  return usablePct * milesPerPercent
}

export interface LegStatus {
  index: number
  distanceMiles: number
  rangeMiles: number
  exceeds: boolean
}

export function evaluateLegs(legMiles: number[], milesPerPercent: number, cfg: RangeConfig): LegStatus[] {
  return legMiles.map((d, i) => {
    const rangeMiles = legRangeMiles(milesPerPercent, cfg, i === 0)
    return { index: i, distanceMiles: d, rangeMiles, exceeds: d > rangeMiles }
  })
}
