import { expect, test } from 'vitest'

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
  expect(DEFAULT_CLEAR_SCOPE).toEqual({ kind: 'all' })
  expect(getClearTarget(DEFAULT_CLEAR_SCOPE, 84, 0)).toBe(84)
})

test('clamps custom limits to the current likes count', () => {
  expect(clampClearLimit(-5, 84)).toBe(1)
  expect(clampClearLimit(50.9, 84)).toBe(50)
  expect(clampClearLimit(100, 84)).toBe(84)
  expect(clampClearLimit(10, 0)).toBe(0)
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
  expect(getClearTarget({ kind: 'manual' }, 84, 0)).toBe(0)
})
