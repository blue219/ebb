import { describe, expect, it } from 'vitest'

import { createPlatformIpcChannels } from './contracts.ts'

describe('platform IPC channel interface', () => {
  it('preserves Douyin channels and isolates TikTok channels', () => {
    const douyin = createPlatformIpcChannels('douyin')
    const tiktok = createPlatformIpcChannels('tiktok')

    expect(douyin).toMatchObject({
      getState: 'douyin:get-state',
      status: 'douyin:status',
      collection: { start: 'douyin:collection:start' },
      following: { stop: 'douyin:following:stop' },
    })
    expect(tiktok).toMatchObject({
      getState: 'tiktok:get-state',
      status: 'tiktok:status',
      collection: { start: 'tiktok:collection:start' },
      following: { stop: 'tiktok:following:stop' },
    })
    expect(JSON.stringify(tiktok)).not.toContain('douyin:')
  })
})
