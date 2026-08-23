# TikTok private web contract

## Status

TikTok support is implemented against the consumer web session hosted in the isolated Electron partition `persist:ebb-tiktok`. The contract remains a release-gated private integration: automated fixtures prove Ebb's parsing and task behavior, but they do not prove that TikTok's live, undocumented endpoints have remained stable.

Do not describe the integration as an official TikTok developer integration. Login Kit, Research API, and Data Portability API do not provide the real-time read/write capabilities required by Ebb's removal workflows.

## Required live contract

Before a TikTok build is released, verify all of the following with one signed-in account:

- QR sign-in creates a consumer web session and that session survives an application restart.
- Current-account data exposes a stable secured user ID and display identity. Liked-video and collected-video totals may be unavailable.
- Liked videos, favorite videos, and following accounts expose stable item IDs, cursor pagination, and an explicit end-of-list signal.
- Unlike, remove-from-favorites, and unfollow requests each return explicit success and the changed item is absent after a fresh first-page read.
- A rejected mutation has an observable HTTP or business error so Ebb can pause without retrying.

Use exactly one expendable item for each mutation check. Never use an **All** scope for live verification.

## Safety limits

- Requests run inside the sandboxed TikTok workspace and use its local cookies. Ebb does not export cookies, passwords, tokens, or request-signing material.
- Ebb does not generate or reverse engineer dynamic signatures, bypass verification, automate TikTok DOM controls, or repeatedly retry rejected requests.
- If a required operation needs any prohibited fallback, the complete TikTok milestone is blocked. Do not ship a partially functional platform.
- Only Favorite Videos are in scope. Favorite sounds, effects, hashtags, playlists, and folders are excluded.

## Sanitized fixture rules

Committed fixtures may contain only the minimum response fields needed to exercise defensive parsers. Replace account names, user IDs, video IDs, image URLs, request IDs, cursor values, and messages that could identify the account. Never commit request headers, cookies, CSRF values, device identifiers, signed URLs, or raw network captures.

`tests/fixtures/tiktok/private-web-contract.candidate.json` is a synthetic, sanitized candidate contract used by deterministic tests. It must not be relabeled as live-verified until the complete read/write gate above passes against a real account; after verification, update only its field structure and keep all identifying values synthetic.

## First-party references

- [Login Kit QR Code Authorization](https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization)
- [TikTok API scopes](https://developers.tiktok.com/docs/en/tiktok-api-scopes)
- [Research API: Query User Liked Videos](https://developers.tiktok.com/docs/en/research-api-specs-query-user-liked-videos)
- [Data Portability API](https://developers.tiktok.com/products/data-portability-api)
