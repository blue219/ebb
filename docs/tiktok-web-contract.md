# TikTok private web contract

## Status

TikTok support is implemented against the consumer web session hosted in the isolated Electron partition `persist:ebb-tiktok`. The contract remains a release-gated private integration: automated fixtures prove Ebb's parsing and task behavior, but they do not prove that TikTok's live, undocumented endpoints have remained stable.

The live gate on August 24, 2026 confirmed liked videos, Favorite Videos, and four Following rows against a signed-in account. Favorite Videos require the signed-in account's `secUid`. TikTok returned an empty following response while the workspace was hidden and rejected unsigned mutation requests with HTTP 403 (`Web SDK blocked by Argus TLB Plugin`). The adapter therefore foregrounds a sandboxed first-party page for Following scans and mutations, lets TikTok produce its normal first-party request, requires an observable resulting state, and then returns focus to Ebb.

Live validation confirmed one unlike and one remove-from-favorites action through Ebb. One additional expendable like was removed while isolating the first-party page contract. No account was unfollowed. A one-account unfollow check and Following pagination beyond 30 rows remain release gates.

Do not describe the integration as an official TikTok developer integration. Login Kit, Research API, and Data Portability API do not provide the real-time read/write capabilities required by Ebb's removal workflows.

## Required live contract

Before a TikTok build is released, verify all of the following with one signed-in account:

- QR sign-in creates a consumer web session and that session survives an application restart.
- Current-account data exposes a stable secured user ID and display identity. Liked-video and collected-video totals may be unavailable.
- Liked and Favorite Videos expose stable video IDs, cursor pagination, and an explicit end-of-list signal.
- The Following dialog exposes a canonical username used only as the identifier for the current scan and task. A refresh invalidates the previous selection. The dialog count and scroll exhaustion provide the end-of-list signal.
- Unlike, remove-from-favorites, and unfollow actions each expose the requested page state after the first-party control is invoked, and the changed item is absent after a fresh scan during release verification.
- A rejected mutation has an observable HTTP or business error so Ebb can pause without retrying.

Use exactly one expendable item for each mutation check. Never use an **All** scope for live verification.

## Safety limits

- Reads and actions run inside the sandboxed TikTok workspace and use its local cookies. Ebb does not export cookies, passwords, tokens, or request-signing material.
- Narrowly scoped first-party Following, like, Favorite, and follow controls are an intentional part of the TikTok adapter. The page appears briefly because TikTok disables required behavior in a hidden workspace.
- Ebb does not generate or reverse engineer dynamic signatures, bypass verification, expose a general-purpose browser automation surface, or repeatedly retry rejected actions.
- If a required operation needs signature engineering, verification bypass, or broader automation, the complete TikTok milestone is blocked. Do not ship a partially functional platform.
- Only Favorite Videos are in scope. Favorite sounds, effects, hashtags, playlists, and folders are excluded.

## Sanitized fixture rules

Committed fixtures may contain only the minimum response fields needed to exercise defensive parsers. Replace account names, user IDs, video IDs, image URLs, request IDs, cursor values, and messages that could identify the account. Never commit request headers, cookies, CSRF values, device identifiers, signed URLs, or raw network captures.

`tests/fixtures/tiktok/private-web-contract.candidate.json` is a synthetic, sanitized candidate API contract used by defensive parser tests. Following-page behavior is covered separately with synthetic DOM fixtures. Neither fixture may be relabeled as a complete live-verified contract until the read/write gate above passes against a real account; after verification, update only field structure and keep all identifying values synthetic.

## First-party references

- [Login Kit QR Code Authorization](https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization)
- [TikTok API scopes](https://developers.tiktok.com/docs/en/tiktok-api-scopes)
- [Research API: Query User Liked Videos](https://developers.tiktok.com/docs/en/research-api-specs-query-user-liked-videos)
- [Data Portability API](https://developers.tiktok.com/products/data-portability-api)
