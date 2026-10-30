import { afterEach, describe, expect, test, vi } from 'vitest'

import { missionUrl } from '../../shared/spacex'
import { CACHE_KEY, CACHE_TTL, EMPTY_FILTERS, loadMissions, parseMissions, readCache, selectMissions } from '../../src/spacex/data'

const tile = (overrides = {}) => ({ id: 1, title: 'Starlink Mission', vehicle: 'Falcon 9', launchSite: 'California ', returnSite: 'Droneship', launchDate: '2026-10-27', link: 'sl-15-16', missionStatus: 'final', correlationId: null, ...overrides })
const createStorage = () => {
  const values = new Map<string, string>()
  return { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value) }) }
}
const requestFor = (tiles: unknown = [tile()], timings: unknown = {}) => vi.fn<typeof fetch>()
  .mockResolvedValueOnce(new Response(JSON.stringify(tiles)))
  .mockResolvedValueOnce(new Response(JSON.stringify(timings)))

afterEach(() => vi.useRealTimers())

describe('SpaceX mission contract', () => {
  test('matches completed filtering and keeps repeated names with distinct IDs', () => {
    const missions = parseMissions([
      tile(), tile({ id: 2, link: 'sl-15-15' }), tile({ id: 3, missionStatus: 'upcoming' }),
      tile({ id: 4, correlationId: 'pending' }), tile({ id: 5, correlationId: 'empty' }),
    ], { pending: {}, empty: null })
    expect(missions.map((mission) => mission.id)).toEqual(['1', '2', '5'])
    expect(missions[0].launchSite).toBe('California')
    expect(missions[0].launchDate).toBe('2026-10-27')
    expect(missions[0]).not.toHaveProperty('correlationId')
  })

  test('rejects invalid response shapes, dates, identities and paths', () => {
    for (const tiles of [{}, [tile({ launchDate: '2026-02-30' })], [tile({ title: '' })], [tile({ link: '../other' })], [tile(), tile()]]) {
      expect(() => parseMissions(tiles, {})).toThrow()
    }
    expect(() => parseMissions([tile()], [])).toThrow()
  })

  test('combines all filters, uses inclusive dates and stable sorting', () => {
    const missions = parseMissions([tile(), tile({ id: 2, launchDate: '2026-10-23' }), tile({ id: 3, title: 'Crew Mission', vehicle: 'Dragon' })], {})
    expect(selectMissions(missions, EMPTY_FILTERS, { key: 'launchDate', direction: 'asc' }).map((m) => m.id)).toEqual(['2', '1', '3'])
    expect(selectMissions(missions, EMPTY_FILTERS, { key: 'title', direction: 'desc' }).map((m) => m.id)).toEqual(['1', '2', '3'])
    const filters = { search: 'STARLINK', vehicle: 'Falcon 9', launchSite: 'California', returnSite: 'Droneship', from: '2026-10-23', to: '2026-10-23' }
    expect(selectMissions(missions, filters, { key: 'launchDate', direction: 'desc' }).map((m) => m.id)).toEqual(['2'])
    expect(selectMissions(missions, { ...filters, returnSite: 'Landing Zone' }, { key: 'vehicle', direction: 'asc' })).toEqual([])
  })

  test('only constructs first-party launch URLs', () => {
    expect(missionUrl('sl-15-16')).toBe('https://www.spacex.com/launches/sl-15-16')
    for (const slug of ['https://evil.com', '//evil.com', '../admin', '%2fadmin', 'x?redirect=evil', 'x#fragment', '', null, 42]) expect(() => missionUrl(slug)).toThrow()
  })
})

describe('fixed twelve-hour cache', () => {
  test('never renews on reads, expires at the exact boundary and refreshes only then', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-30T08:00:00Z'))
    const storage = createStorage()
    const request = requestFor()
    const first = await loadMissions({ storage, request })
    vi.setSystemTime(first.fetchedAt + CACHE_TTL - 1)
    expect((await loadMissions({ storage, request })).fetchedAt).toBe(first.fetchedAt)
    expect(readCache(storage)?.fetchedAt).toBe(first.fetchedAt)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(2)
    vi.setSystemTime(first.fetchedAt + CACHE_TTL)
    expect(readCache(storage)).toBeUndefined()
    const renewed = await loadMissions({ storage, request: requestFor() })
    expect(renewed.fetchedAt).toBe(first.fetchedAt + CACHE_TTL)
  })

  test('manual refresh replaces only after both responses pass validation', async () => {
    vi.useFakeTimers().setSystemTime(1_000_000)
    const storage = createStorage()
    const first = await loadMissions({ storage, request: requestFor() })
    const original = storage.getItem(CACHE_KEY)
    vi.setSystemTime(2_000_000)
    await expect(loadMissions({ force: true, storage, request: requestFor([tile()], []) })).rejects.toThrow()
    expect(storage.getItem(CACHE_KEY)).toBe(original)
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }))
    await expect(loadMissions({ force: true, storage, request })).rejects.toThrow('503')
    expect(readCache(storage)?.fetchedAt).toBe(first.fetchedAt)
    const updated = await loadMissions({ force: true, storage, request: requestFor([tile({ title: 'Updated Mission' })]) })
    expect(updated.fetchedAt).toBe(2_000_000)
    expect(readCache(storage)?.missions[0].title).toBe('Updated Mission')
  })

  test('recovers from corrupt cache and tolerates unavailable writes', async () => {
    const storage = createStorage()
    storage.setItem(CACHE_KEY, '{invalid')
    const snapshot = await loadMissions({ storage, request: requestFor() })
    expect(snapshot.missions).toHaveLength(1)
    storage.setItem.mockImplementation(() => { throw new Error('Quota exceeded') })
    await expect(loadMissions({ force: true, storage, request: requestFor() })).resolves.toHaveProperty('missions')
    const request = requestFor()
    await loadMissions({ storage, request })
    expect(request).toHaveBeenCalledTimes(2)
  })

  test('expired cache is not served after a network failure', async () => {
    vi.useFakeTimers().setSystemTime(1_000_000)
    const storage = createStorage()
    const first = await loadMissions({ storage, request: requestFor() })
    vi.setSystemTime(first.fetchedAt + CACHE_TTL)
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('Offline'))
    await expect(loadMissions({ storage, request })).rejects.toThrow('Offline')
    expect(readCache(storage)).toBeUndefined()
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })
})
