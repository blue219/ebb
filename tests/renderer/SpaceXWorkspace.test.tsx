// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import SpaceXWorkspace from '@/spacex/SpaceXWorkspace'
import { AppNavigation } from '@/components/AppNavigation'
import { CACHE_KEY } from '@/spacex/data'

const missions = [
  { id: '1', title: 'Starlink Mission', vehicle: 'Falcon 9', launchSite: 'California', returnSite: 'Droneship', launchDate: '2026-10-27', slug: 'sl-15-16' },
  { id: '2', title: 'Crew Mission', vehicle: 'Falcon 9', launchSite: 'Florida', returnSite: 'Landing Zone', launchDate: '2026-10-20', slug: 'crew-1' },
]
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, fetchedAt: Date.now(), missions }))
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
  window.ebb = { ...window.ebb, spacex: { openMission: vi.fn().mockResolvedValue(undefined) } }
})
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

test('loads cache without a request, sorts, filters, resets and opens details', async () => {
  const onSelectPage = vi.fn()
  render(<SpaceXWorkspace onSelectPage={onSelectPage} />)
  await screen.findByText('Starlink Mission')
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.getAllByRole('row')[1]).toHaveTextContent('Starlink Mission')
  fireEvent.click(screen.getByRole('button', { name: '发射日期' }))
  expect(screen.getAllByRole('row')[1]).toHaveTextContent('Crew Mission')
  fireEvent.change(screen.getByLabelText('发射场'), { target: { value: 'California' } })
  expect(screen.queryByText('Crew Mission')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('搜索任务名称'), { target: { value: 'nothing' } })
  expect(screen.getByText('没有符合条件的任务')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重置' }))
  fireEvent.click(screen.getByRole('button', { name: '查看 Starlink Mission 2026-10-27 详情' }))
  expect(window.ebb.spacex.openMission).toHaveBeenCalledWith('sl-15-16')
  fireEvent.click(screen.getByRole('button', { name: 'TikTok' }))
  expect(onSelectPage).toHaveBeenCalledWith('tiktok')
})

test('failed refresh retains filters, data and timestamp; retry succeeds', async () => {
  const original = localStorage.getItem(CACHE_KEY)
  render(<SpaceXWorkspace onSelectPage={vi.fn()} />)
  await screen.findByText('Crew Mission')
  fireEvent.change(screen.getByLabelText('搜索任务名称'), { target: { value: 'crew' } })
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  await screen.findByRole('alert')
  expect(screen.getByText('Crew Mission')).toBeInTheDocument()
  expect(screen.getByLabelText('搜索任务名称')).toHaveValue('crew')
  expect(localStorage.getItem(CACHE_KEY)).toBe(original)
  vi.mocked(fetch).mockImplementation(async (url) => new Response(JSON.stringify(String(url).includes('future_missions') ? {} : missions.map((mission) => ({ ...mission, link: mission.slug, missionStatus: 'final' })))))
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '重试' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(screen.getByLabelText('搜索任务名称')).toHaveValue('crew')
})

test('initial failure is retryable and does not show expired rows', async () => {
  localStorage.removeItem(CACHE_KEY)
  render(<SpaceXWorkspace onSelectPage={vi.fn()} />)
  await screen.findByRole('alert')
  expect(screen.queryByText('Crew Mission')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重试' })).toBeEnabled()
})

test('all app cards obey the existing navigation lock', () => {
  render(<AppNavigation current="douyin" disabled onSelect={vi.fn()} />)
  for (const name of ['Douyin', 'TikTok', 'SpaceX']) expect(screen.getByRole('button', { name })).toBeDisabled()
})
