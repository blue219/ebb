import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_CLEAR_SCOPE,
  clampClearLimit,
  getClearTarget,
  getScopeSelectedIds,
  transitionToManualSelection,
} from '../../src/shared/clear-scope.ts'

const videos = [
  { id: '1', status: 'pending' },
  { id: '2', status: 'pending' },
  { id: '3', status: 'completed' },
  { id: '4', status: 'pending' },
]

test('defaults and resets to the all scope', () => {
  assert.deepEqual(DEFAULT_CLEAR_SCOPE, { kind: 'all' })
  assert.equal(getClearTarget(DEFAULT_CLEAR_SCOPE, 84, 0), 84)
})

test('clamps custom limits to the current likes count', () => {
  assert.equal(clampClearLimit(-5, 84), 1)
  assert.equal(clampClearLimit(50.9, 84), 50)
  assert.equal(clampClearLimit(100, 84), 84)
  assert.equal(clampClearLimit(10, 0), 0)
})

test('selects loaded rows for all and limited scopes', () => {
  assert.deepEqual([...getScopeSelectedIds({ kind: 'all' }, videos, new Set())], ['1', '2', '4'])
  assert.deepEqual([...getScopeSelectedIds({ kind: 'limit', limit: 2 }, videos, new Set())], ['1', '2'])
})

test('preserves generated selections when switching to manual mode', () => {
  const selected = transitionToManualSelection({ kind: 'limit', limit: 2 }, videos, new Set(), '2')
  assert.deepEqual([...selected], ['1'])
})

test('a manual scope with no rows has no clear target', () => {
  assert.equal(getClearTarget({ kind: 'manual' }, 84, 0), 0)
})
