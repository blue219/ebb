import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  assertTikTokMutationSuccess,
  parseTikTokBrowserResponse,
  parseTikTokCurrentUser,
  parseTikTokFollowingPage,
  parseTikTokVideoPage,
} from './parsers.ts'

const candidateFixture = JSON.parse(readFileSync(
  new URL('../../../tests/fixtures/tiktok/private-web-contract.candidate.json', import.meta.url),
  'utf8',
)) as Record<string, Record<string, unknown>>

describe('TikTok private web response interface', () => {
  it('parses account identity without treating received likes as liked-video total', () => {
    expect(parseTikTokCurrentUser(candidateFixture.currentUser)).toEqual({
      id: 'sanitized-user-1',
      name: 'Sanitized account',
      followingCount: 12,
    })
  })

  it('parses paginated liked and favorite video payload variants', () => {
    expect(parseTikTokVideoPage({
      statusCode: 0,
      itemList: [{ id: 'video-1', desc: 'First', video: { cover: 'https://example.invalid/cover.webp' } }],
      cursor: '30',
      hasMore: true,
    }, '0')).toEqual({
      videos: [{ id: 'video-1', title: 'First', thumbnail: 'https://example.invalid/cover.webp', status: 'pending' }],
      nextCursor: '30',
      hasMore: true,
    })
  })

  it('keeps an unverified following relationship explicit', () => {
    expect(parseTikTokFollowingPage({
      statusCode: 0,
      userList: [{ user: { secUid: 'account-1', nickname: 'Account', uniqueId: 'account' } }],
      cursor: '20',
      hasMore: false,
    }, '0').accounts).toEqual([{
      id: 'account-1',
      displayName: 'Account',
      username: 'account',
      relation: 'unknown',
      status: 'pending',
    }])
  })

  it('requires explicit success for destructive responses', () => {
    expect(() => assertTikTokMutationSuccess({ statusCode: 0 })).not.toThrow()
    expect(() => assertTikTokMutationSuccess({})).toThrow('TikTok did not report explicit success')
    expect(() => assertTikTokMutationSuccess({ statusCode: 10201, statusMsg: 'verification required' })).toThrow(
      'TikTok web request was rejected: verification required',
    )
  })

  it('preserves HTTP rejection details and rejects unreadable browser results', () => {
    expect(parseTikTokBrowserResponse({ ok: false, status: 429, text: 'rate limited' })).toEqual({
      statusCode: 429,
      statusMsg: 'rate limited',
    })
    expect(() => parseTikTokBrowserResponse({ ok: false, status: 500 })).toThrow('unreadable web response')
  })

  it('stops pagination when TikTok repeats or omits the cursor', () => {
    expect(parseTikTokVideoPage({ statusCode: 0, itemList: [], cursor: '20', hasMore: true }, '20').hasMore).toBe(false)
    expect(parseTikTokFollowingPage({ statusCode: 0, userList: [], hasMore: true }, '20').hasMore).toBe(false)
  })
})
