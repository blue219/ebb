export const SPACEX_OPEN_MISSION = 'spacex:open-mission'

export interface SpaceXBridge {
  openMission: (slug: string) => Promise<void>
}

export function missionUrl(slug: unknown): string {
  if (typeof slug !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(slug)) {
    throw new Error('Invalid SpaceX mission path.')
  }
  return `https://www.spacex.com/launches/${slug}`
}
