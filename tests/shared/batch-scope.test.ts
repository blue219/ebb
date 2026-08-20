import { expect, test } from 'vitest'

import {
  DEFAULT_BATCH_SCOPE,
  clampBatchLimit,
  getBatchTarget,
  getScopeSelectedIds,
  transitionToManualSelection,
} from '../../src/shared/batch-scope.ts'

const videos = [
  { id: '1', status: 'pending' },
  { id: '2', status: 'pending' },
  { id: '3', status: 'completed' },
  { id: '4', status: 'pending' },
]

test('defaults and resets to the all scope', () => {
  expect(DEFAULT_BATCH_SCOPE).toEqual({ kind: 'all' })
  expect(getBatchTarget(DEFAULT_BATCH_SCOPE, 84, 0)).toBe(84)
})

test('clamps custom limits to the current item count', () => {
  expect(clampBatchLimit(-5, 84)).toBe(1)
  expect(clampBatchLimit(50.9, 84)).toBe(50)
  expect(clampBatchLimit(100, 84)).toBe(84)
  expect(clampBatchLimit(10, 0)).toBe(0)
})

test('selects loaded rows for all and limited scopes', () => {
  expect([...getScopeSelectedIds({ kind: 'all' }, videos, new Set())]).toEqual(['1', '2', '4'])
  expect([...getScopeSelectedIds({ kind: 'limit', limit: 2 }, videos, new Set())]).toEqual(['1', '2'])
})

test('preserves generated selections when switching to manual mode', () => {
  const selected = transitionToManualSelection({ kind: 'limit', limit: 2 }, videos, new Set(), '2')
  expect([...selected]).toEqual(['1'])
})

test('a manual scope with no rows has no clear target', () => {
  expect(getBatchTarget({ kind: 'manual' }, 84, 0)).toBe(0)
})
