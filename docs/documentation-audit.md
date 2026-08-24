# Documentation Audit

Audit date: 2026-08-24

## Scope

This audit compares the working-tree documentation with repository-owned primary sources: `package.json`, Vite and TypeScript configuration, Electron and renderer entry points, both platform implementations, shared contracts, and tests. The bounded TikTok live checks are recorded in [tiktok-web-contract.md](tiktok-web-contract.md).

## Resolved findings

- **Platform support:** `README.md` and `AGENTS.md` now describe the implemented Douyin and TikTok modules and link to TikTok's remaining live release gates. This matches the platform composition in `electron/main.ts` and `src/App.tsx`.
- **Setup and commands:** `README.md` documents `npm ci`, development, deterministic tests, coverage, test type-checking, offline Electron smoke, lint, build, and the renderer-only limitation of preview. These commands match `package.json`, which now constrains Node.js to version 22.
- **Destructive validation:** `docs/testing.md` separates deterministic automated checks from bounded, destructive real-account checks for both platforms. Automated fixtures cannot load either persistent account partition or contact an external platform.
- **Architecture and persistence:** `docs/architecture.md` records the renderer, preload, platform-namespaced IPC, shared task services, isolated platform partitions, TikTok's temporary first-party window, in-memory task state, and generated build directories.
- **Task semantics:** `docs/CONTEXT.md` distinguishes live **All**, a frozen numeric target, frozen manual IDs, and cooperative pause/stop behavior. These definitions match `src/shared/batch-scope.ts`, `electron/shared/removal-policy.ts`, and the processing loops in the platform task services.
- **Verification limitation:** `README.md` and `docs/testing.md` do not imply that an interactive security challenge can be completed inside Ebb. TikTok's temporary first-party page is limited to Following and mutation controls and is not a general-purpose browser.
- **Terminology:** `docs/CONTEXT.md` maps the canonical term **Manual selection** to the visible **Custom** label defined in `src/shared/platforms/i18n.ts`.
- **Build and visual stack:** `README.md` distinguishes bundles from an installer and says that the installed `liquid-glass-react` dependency is not currently imported. This matches `package.json`, `vite.config.ts`, the absence of packaging configuration, and the CSS implementation in `src/index.css`.
- **Date scopes:** `README.md` describes the missing liked-at timestamp as an observation of the current integration instead of a guaranteed upstream contract. The current parser in `electron/platforms/douyin/parsers.ts` consumes video identity, description, and cover data but no liked-at field.

## Known implementation gaps documented for users

- There is no distributable installer.
- TikTok still requires a one-account unfollow check and Following pagination verification beyond 30 rows.
- There is no general-purpose embedded browser for completing interactive Douyin security challenges.
- There is no automated live-account suite; all live mutations remain manual and bounded to expendable items.
- Playwright Electron support is experimental, so the desktop suite remains a focused smoke layer backed by deterministic task and renderer tests.
- `liquid-glass-react` is installed but unused; current glass styling lives in `src/index.css`.

These are implementation or configuration gaps, not remaining contradictions in the documentation.

## Validation

- `npm run verify`: coverage, test type-checking, lint, build, and isolated Electron smoke passed.
- Local Markdown links in `README.md` resolve.
- The August 24 TikTok gate removed two expendable likes and one Favorite Video in total. No following relationship was changed.
