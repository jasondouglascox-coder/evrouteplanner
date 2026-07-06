import { describe, it, expect } from 'vitest'
import { milesPerPercentForSpeed, legRangeMiles, evaluateLegs } from '../src/lib/range'
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

describe('evaluateLegs', () => {
  it('flags legs that exceed available range', () => {
    const statuses = evaluateLegs([200, 150, 190], 2.55, cfg)
    expect(statuses[0].exceeds).toBe(false) // 200 < 229.5
    expect(statuses[1].exceeds).toBe(false) // 150 < 178.5
    expect(statuses[2].exceeds).toBe(true) // 190 > 178.5
    expect(statuses[2].rangeMiles).toBeCloseTo(178.5, 5)
  })
})
