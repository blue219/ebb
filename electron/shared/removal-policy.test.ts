import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAutomaticRemovalPlan,
  hasReachedAutomaticTarget,
  remainingAutomaticTarget,
} from './removal-policy.ts'

test('creates bounded and all-account removal plans', () => {
  assert.deepEqual(createAutomaticRemovalPlan(undefined, 240, 10), { mode: 'all', total: 240 })
  assert.deepEqual(createAutomaticRemovalPlan(7, 240, 10), { mode: 'limited', total: 7 })
  assert.deepEqual(createAutomaticRemovalPlan(25, 240, 10), { mode: 'limited', total: 25 })
  assert.deepEqual(createAutomaticRemovalPlan(240, 240, 10), { mode: 'limited', total: 240 })
})

test('rejects invalid and excessive limits', () => {
  assert.throws(() => createAutomaticRemovalPlan(0, 20, 10), /positive integer/)
  assert.throws(() => createAutomaticRemovalPlan(1.5, 20, 10), /positive integer/)
  assert.throws(() => createAutomaticRemovalPlan(21, 20, 10), /cannot exceed/)
  assert.throws(() => createAutomaticRemovalPlan(10, 5, 20), /cannot exceed/)
})

test('stops limited removal at its frozen target', () => {
  assert.equal(remainingAutomaticTarget('limited', 10, 25), 15)
  assert.equal(hasReachedAutomaticTarget('limited', 24, 25), false)
  assert.equal(hasReachedAutomaticTarget('limited', 25, 25), true)
  assert.equal(hasReachedAutomaticTarget('all', 25, 25), false)
})
