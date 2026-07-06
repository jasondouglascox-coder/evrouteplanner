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

// One leg of the planned trip: its distance, the cruising speed to assume for it,
// and whether the battery is recharged at the stop it ends at.
export interface TripLeg {
  distanceMiles: number
  speedMph: number
  chargeAtEnd: boolean
}

export interface LegEval {
  index: number
  distanceMiles: number
  consumedPct: number // battery % this leg uses
  cumulativePct: number // battery % used since the last charge point (incl. this leg)
  availablePct: number // usable battery % for the current charge segment
  exceeds: boolean // cumulative demand exceeds what's available since last charge
}

// Percent-based range check. Battery starts full (startPct); each leg consumes
// distance / mi-per-% at that leg's speed. Demand accumulates across pass-through
// stops and only resets when a leg ends at a charge point (recharged to chargeToPct).
// Reserve is kept in the tank, so usable % = (startPct|chargeToPct) - reservePct.
export function evaluateTrip(legs: TripLeg[], table: EfficiencyRow[], cfg: RangeConfig): LegEval[] {
  const out: LegEval[] = []
  let available = cfg.startPct - cfg.reservePct
  let cumulative = 0
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    const mpp = milesPerPercentForSpeed(table, leg.speedMph)
    const consumed = mpp > 0 ? leg.distanceMiles / mpp : Infinity
    cumulative += consumed
    out.push({
      index: i,
      distanceMiles: leg.distanceMiles,
      consumedPct: consumed,
      cumulativePct: cumulative,
      availablePct: available,
      exceeds: cumulative > available + 1e-9,
    })
    if (leg.chargeAtEnd) {
      cumulative = 0
      available = cfg.chargeToPct - cfg.reservePct
    }
  }
  return out
}
