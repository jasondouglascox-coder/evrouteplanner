import { describe, it, expect } from 'vitest'
import { milesPerPercentForSpeed, legRangeMiles, evaluateTrip, type TripLeg } from '../src/lib/range'
import type { EfficiencyRow, RangeConfig } from '../src/types'

const table: EfficiencyRow[] = [
  { speedMph: 60, milesPerPercent: 2.9 },
  { speedMph: 65, milesPerPercent: 2.75 },
  { speedMph: 70, milesPerPercent: 2.55 },
  { speedMph: 75, milesPerPercent: 2.35 },
  { speedMph: 80, milesPerPercent: 2.15 },
]
const cfg: RangeConfig = { startPct: 100, chargeToPct: 80, reservePct: 10 }

describe('milesPerPercentForSpeed', () => {
  it('returns exact match', () => {
    expect(milesPerPercentForSpeed(table, 70)).toBe(2.55)
  })
  it('interpolates between rows', () => {
    expect(milesPerPercentForSpeed(table, 67.5)).toBeCloseTo(2.65, 5)
  })
  it('clamps below the lowest speed', () => {
    expect(milesPerPercentForSpeed(table, 40)).toBe(2.9)
  })
  it('clamps above the highest speed', () => {
    expect(milesPerPercentForSpeed(table, 95)).toBe(2.15)
  })
  it('throws on an empty efficiency table', () => {
    expect(() => milesPerPercentForSpeed([], 70)).toThrow()
  })
})

describe('legRangeMiles', () => {
  it('uses start->reserve for the first leg', () => {
    // (100 - 10) * 2.55 = 229.5
    expect(legRangeMiles(2.55, cfg, true)).toBeCloseTo(229.5, 5)
  })
  it('uses chargeTo->reserve for later legs', () => {
    // (80 - 10) * 2.55 = 178.5
    expect(legRangeMiles(2.55, cfg, false)).toBeCloseTo(178.5, 5)
  })
})

const leg = (distanceMiles: number, chargeAtEnd: boolean, speedMph = 70): TripLeg => ({
  distanceMiles,
  speedMph,
  chargeAtEnd,
})

describe('evaluateTrip', () => {
  it('resets range demand only at charge stops', () => {
    // 70 mph -> 2.55 mi/%. First segment available = (100-10)=90%.
    // leg1 200 mi -> 78.4%, ok. leg1 ends at a charge -> reset, available=(80-10)=70%.
    // leg2 190 mi -> 74.5% > 70% -> exceeds.
    const evals = evaluateTrip([leg(200, true), leg(190, false)], table, cfg)
    expect(evals[0].exceeds).toBe(false)
    expect(evals[1].exceeds).toBe(true)
  })

  it('accumulates demand across a pass-through stop (no charge)', () => {
    // Washougal -> Point Defiance (no charge) -> Washougal, ~148 mi each.
    // No reset at the middle stop: cumulative 296 mi / 2.55 = 116% > 90% by leg 2.
    const evals = evaluateTrip([leg(148, false), leg(149, false)], table, cfg)
    expect(evals[0].exceeds).toBe(false) // 148/2.55 = 58% < 90%
    expect(evals[1].exceeds).toBe(true) // cumulative 116.5% > 90%
  })

  it('marking the middle stop as a charge stop clears the warning', () => {
    const evals = evaluateTrip([leg(148, true), leg(149, false)], table, cfg)
    expect(evals[0].exceeds).toBe(false)
    expect(evals[1].exceeds).toBe(false) // leg2 measured from an 80% charge: 58.4% < 70%
  })

  it('uses each leg own speed for consumption', () => {
    // Same distance, faster speed uses more battery %.
    const slow = evaluateTrip([leg(200, false, 60)], table, cfg)[0]
    const fast = evaluateTrip([leg(200, false, 80)], table, cfg)[0]
    expect(fast.consumedPct).toBeGreaterThan(slow.consumedPct)
  })
})
