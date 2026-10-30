import { missionUrl } from '../../shared/spacex'

export const CACHE_KEY = 'ebb:spacex:missions:v1'
export const CACHE_TTL = 12 * 60 * 60 * 1000
export const MISSIONS_URL = 'https://content.spacex.com/api/spacex-website/launches-page-tiles'
export const TIMINGS_URL = 'https://content.spacex.com/cms-assets/future_missions.json'

const failedCacheStores = new WeakSet<object>()

export interface Mission {
  id: string
  title: string
  vehicle: string
  launchSite: string
  returnSite: string
  launchDate: string
  slug: string
}

export interface MissionSnapshot {
  version: 1
  fetchedAt: number
  missions: Mission[]
}

export interface Filters {
  search: string
  vehicle: string
  launchSite: string
  returnSite: string
  from: string
  to: string
}

export const EMPTY_FILTERS: Filters = { search: '', vehicle: '', launchSite: '', returnSite: '', from: '', to: '' }
export type SortKey = 'title' | 'vehicle' | 'launchSite' | 'returnSite' | 'launchDate'
export interface Sort { key: SortKey; direction: 'asc' | 'desc' }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid SpaceX text field.')
  return value.trim()
}

function date(value: unknown): string {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result))
    || new Date(result).toISOString().slice(0, 10) !== result) throw new Error('Invalid SpaceX launch date.')
  return result
}

function parseMission(value: unknown): Mission {
  if (!record(value)) throw new Error('Invalid SpaceX mission.')
  const id = typeof value.id === 'number' && Number.isFinite(value.id) ? String(value.id) : text(value.id)
  const title = text(value.title)
  const slug = text(value.slug)
  missionUrl(slug)
  if (!id || !title) throw new Error('Missing SpaceX mission identity.')
  return {
    id, title, slug,
    vehicle: text(value.vehicle ?? ''),
    launchSite: text(value.launchSite ?? ''),
    returnSite: text(value.returnSite ?? ''),
    launchDate: date(value.launchDate),
  }
}

export function parseMissions(tiles: unknown, timings: unknown): Mission[] {
  if (!Array.isArray(tiles) || !record(timings)) throw new Error('Invalid SpaceX response.')
  const ids = new Set<string>()
  const missions: Mission[] = []
  for (const tile of tiles) {
    if (!record(tile) || typeof tile.missionStatus !== 'string') throw new Error('Invalid SpaceX mission status.')
    // Match the first-party completed-mission rule, including temporarily scheduled final tiles.
    if (tile.missionStatus !== 'final') continue
    if (tile.correlationId != null && typeof tile.correlationId !== 'string') throw new Error('Invalid SpaceX correlation ID.')
    if (typeof tile.correlationId === 'string' && Object.hasOwn(timings, tile.correlationId) && timings[tile.correlationId] != null) continue
    const mission = parseMission({ ...tile, slug: tile.link })
    if (ids.has(mission.id)) throw new Error('Duplicate SpaceX mission ID.')
    ids.add(mission.id)
    missions.push(mission)
  }
  if (!missions.length) throw new Error('SpaceX returned no completed missions.')
  return missions
}

export function readCache(storage: Pick<Storage, 'getItem'>, now = Date.now()): MissionSnapshot | undefined {
  try {
    const value: unknown = JSON.parse(storage.getItem(CACHE_KEY) ?? 'null')
    if (!record(value) || value.version !== 1 || typeof value.fetchedAt !== 'number'
      || !Number.isFinite(value.fetchedAt) || value.fetchedAt > now || now - value.fetchedAt >= CACHE_TTL
      || !Array.isArray(value.missions) || !value.missions.length) return
    const missions = value.missions.map(parseMission)
    if (new Set(missions.map((mission) => mission.id)).size !== missions.length) return
    // Reading must never renew the fixed expiration time.
    return { version: 1, fetchedAt: value.fetchedAt, missions }
  } catch {
    return undefined
  }
}

export async function loadMissions({ force = false, signal, storage, request = fetch }: {
  force?: boolean
  signal?: AbortSignal
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  request?: typeof fetch
} = {}): Promise<MissionSnapshot> {
  if (!storage) {
    try {
      storage = localStorage
    } catch {
      storage = { getItem: () => null, setItem: () => {} }
    }
  }
  if (!force && !failedCacheStores.has(storage)) {
    const cached = readCache(storage)
    if (cached) return cached
  }
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)
  const [tiles, timings] = await Promise.all([MISSIONS_URL, TIMINGS_URL].map(async (url) => {
    const response = await request(url, { signal: requestSignal, credentials: 'omit', cache: 'no-store' })
    if (!response.ok) throw new Error(`SpaceX request failed (${response.status}).`)
    return response.json() as Promise<unknown>
  }))
  const missions = parseMissions(tiles, timings)
  requestSignal.throwIfAborted()
  const snapshot: MissionSnapshot = { version: 1, fetchedAt: Date.now(), missions }
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(snapshot))
    failedCacheStores.delete(storage)
  } catch {
    // A full or unavailable local store must not hide successfully fetched data.
    // Ignore any older snapshot on re-entry until a later write succeeds.
    failedCacheStores.add(storage)
  }
  return snapshot
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

export function selectMissions(missions: Mission[], filters: Filters, sort: Sort): Mission[] {
  const query = filters.search.trim().toLocaleLowerCase('en')
  return missions.filter((mission) => (!query || mission.title.toLocaleLowerCase('en').includes(query))
    && (!filters.vehicle || mission.vehicle === filters.vehicle)
    && (!filters.launchSite || mission.launchSite === filters.launchSite)
    && (!filters.returnSite || mission.returnSite === filters.returnSite)
    && (!filters.from || mission.launchDate >= filters.from)
    && (!filters.to || mission.launchDate <= filters.to))
    .sort((a, b) => {
      const comparison = sort.key === 'launchDate'
        ? a.launchDate.localeCompare(b.launchDate)
        : collator.compare(a[sort.key], b[sort.key])
      return sort.direction === 'asc' ? comparison : -comparison
    })
}
