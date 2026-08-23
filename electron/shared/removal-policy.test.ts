import { expect, test } from 'vitest'

import {
  createAutomaticRemovalPlan,
  hasReachedAutomaticTarget,
  remainingAutomaticTarget,
} from './removal-policy.ts'

test('creates bounded and all-account removal plans', () => {
  expect(createAutomaticRemovalPlan(undefined, 240, 10)).toEqual({ mode: 'all', total: 240 })
  expect(createAutomaticRemovalPlan(7, 240, 10)).toEqual({ mode: 'limited', total: 7 })
  expect(createAutomaticRemovalPlan(25, 240, 10)).toEqual({ mode: 'limited', total: 25 })
  expect(createAutomaticRemovalPlan(240, 240, 10)).toEqual({ mode: 'limited', total: 240 })
})

test('keeps unknown platform totals explicit without capping a requested limit to loaded rows', () => {
  expect(createAutomaticRemovalPlan(undefined, undefined, 10)).toEqual({ mode: 'all', total: null })
  expect(createAutomaticRemovalPlan(50, undefined, 10)).toEqual({ mode: 'limited', total: 50 })
})

test('rejects invalid and excessive limits', () => {
  expect(() => createAutomaticRemovalPlan(0, 20, 10)).toThrow(/positive integer/)
  expect(() => createAutomaticRemovalPlan(1.5, 20, 10)).toThrow(/positive integer/)
  expect(() => createAutomaticRemovalPlan(21, 20, 10)).toThrow(/cannot exceed/)
  expect(() => createAutomaticRemovalPlan(10, 5, 20)).toThrow(/cannot exceed/)
})

test('stops limited removal at its frozen target', () => {
  expect(remainingAutomaticTarget('limited', 10, 25)).toBe(15)
  expect(hasReachedAutomaticTarget('limited', 24, 25)).toBe(false)
  expect(hasReachedAutomaticTarget('limited', 25, 25)).toBe(true)
  expect(hasReachedAutomaticTarget('all', 25, 25)).toBe(false)
})
