import { describe, expect, test } from 'vitest'

import {
  assertDouyinSuccess,
  parseBrowserResponse,
  parseCurrentUser,
  parseFavoritePage,
  parseLoginSurfaceResult,
} from './parsers.ts'

describe('untrusted Douyin responses', () => {
  test('parses a current account from supported response nesting', () => {
    expect(parseCurrentUser({
      status_code: 0,
      data: {
        user_info: {
          sec_uid: 'account-1',
          nickname: 'Sky',
          favoriting_count: '42',
          avatar_thumb: { url_list: [null, 'https://example.test/avatar.jpg'] },
        },
      },
    })).toEqual({
      secUserId: 'account-1',
      name: 'Sky',
      likesCount: 42,
      avatar: 'https://example.test/avatar.jpg',
    })
  })

  test('rejects a response without a signed-in account', () => {
    expect(() => parseCurrentUser({ status_code: 0, data: {} })).toThrow(/current user/)
    expect(() => parseCurrentUser({ status_code: 4, status_msg: 'sign in required' })).toThrow(/sign in required/)
  })

  test('parses favorite rows defensively and stops a stalled cursor', () => {
    expect(parseFavoritePage({
      status_code: 0,
      has_more: 1,
      max_cursor: '10',
      aweme_list: [
        { aweme_id: 101, desc: 'First', video: { cover: { url_list: ['https://example.test/1.jpg'] } } },
        { desc: 'Missing id' },
        { aweme_id: '102', desc: '' },
      ],
    }, '0')).toEqual({
      videos: [
        { id: '101', title: 'First', thumbnail: 'https://example.test/1.jpg', status: 'pending' },
        { id: '102', title: 'Untitled video', thumbnail: undefined, status: 'pending' },
      ],
      nextCursor: '10',
      hasMore: true,
    })

    expect(parseFavoritePage({ has_more: 1, max_cursor: '10', aweme_list: [] }, '10').hasMore).toBe(false)
  })

  test('normalizes non-JSON and unreadable browser responses', () => {
    expect(parseBrowserResponse({ ok: false, status: 503, text: '<html>down</html>' })).toEqual({
      status_code: 503,
      status_msg: '<html>down</html>',
    })
    expect(parseBrowserResponse({ ok: true, status: 200, text: '{"status_code":0}' })).toEqual({ status_code: 0 })
    expect(() => parseBrowserResponse({ ok: true, status: 200 })).toThrow(/unreadable/)
  })

  test('normalizes login surface states and rejected mutations', () => {
    expect(parseLoginSurfaceResult({ state: 'ready', qrCode: 'data:image/png;base64,aA==' })).toEqual({
      state: 'ready',
      qrCode: 'data:image/png;base64,aA==',
    })
    expect(parseLoginSurfaceResult({ state: 'verification' })).toEqual({ state: 'verification' })
    expect(parseLoginSurfaceResult({ state: 'unknown' })).toEqual({ state: 'loading' })
    expect(() => parseLoginSurfaceResult(null)).toThrow(/readable QR code state/)
    expect(() => assertDouyinSuccess({ statusCode: 429, message: 'slow down' })).toThrow(/slow down/)
  })
})
