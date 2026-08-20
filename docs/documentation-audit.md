# Documentation Audit

Audit date: 2026-08-13

## Scope

This audit compares the working-tree documentation with repository-owned primary sources: `package.json`, Vite and TypeScript configuration, Electron and renderer entry points, the Douyin platform implementation, shared contracts, and tests. No live-account removal was performed.

## Resolved findings

- **Platform support:** `README.md` and `AGENTS.md` now state that Douyin is implemented and TikTok is planned. This matches the Douyin-only composition in `electron/main.ts` and `src/App.tsx`.
- **Setup and commands:** `README.md` documents `npm ci`, development, deterministic tests, coverage, test type-checking, offline Electron smoke, lint, build, and the renderer-only limitation of preview. These commands match `package.json`, which now constrains Node.js to version 22.
- **Destructive validation:** `docs/testing.md` separates deterministic automated checks from a single bounded, destructive real-account release check. Automated fixtures cannot load the persistent account partition or contact Douyin.
- **Architecture and persistence:** `docs/architecture.md` records the renderer, preload, namespaced IPC, task service, detached Douyin view, persistent `persist:ebb-douyin` partition, in-memory task state, and generated build directories. These boundaries match `electron/main.ts`, `electron/preload.ts`, `electron/platforms/douyin/task-service.ts`, and `shared/platforms/douyin/contracts.ts`.
- **Task semantics:** `docs/CONTEXT.md` distinguishes live **All**, a frozen numeric target, frozen manual IDs, and cooperative pause/stop behavior. These definitions match `src/shared/batch-scope.ts`, `electron/shared/removal-policy.ts`, and the processing loops in the platform task services.
- **Verification limitation:** `README.md` and `docs/testing.md` no longer imply that an interactive challenge can be completed inside Ebb. The documented recovery path reflects the detached `WebContentsView` in `electron/platforms/douyin/task-service.ts` and the QR-only dialog in `src/platforms/douyin/DouyinWorkspace.tsx`.
- **Terminology:** `docs/CONTEXT.md` maps the canonical term **Manual selection** to the visible **Custom** label defined in `src/platforms/douyin/i18n.ts`.
- **Build and visual stack:** `README.md` distinguishes bundles from an installer and says that the installed `liquid-glass-react` dependency is not currently imported. This matches `package.json`, `vite.config.ts`, the absence of packaging configuration, and the CSS implementation in `src/index.css`.
- **Date scopes:** `README.md` describes the missing liked-at timestamp as an observation of the current integration instead of a guaranteed upstream contract. The current parser in `electron/platforms/douyin/task-service.ts` consumes video identity, description, and cover data but no liked-at field.

## Known implementation gaps documented for users

- There is no TikTok module or distributable installer.
- There is no general-purpose embedded browser for completing interactive Douyin security challenges.
- There is no automated live-Douyin suite; the only live mutation is a manual, single-like release check.
- Playwright Electron support is experimental, so the desktop suite remains a focused smoke layer backed by deterministic task and renderer tests.
- `liquid-glass-react` is installed but unused; current glass styling lives in `src/index.css`.

These are implementation or configuration gaps, not remaining contradictions in the documentation.

## Validation

- `npm test`: deterministic Node and renderer tests passed.
- `npm run test:e2e`: both isolated Electron smoke scenarios passed without external requests.
- `npm run build`: renderer, main, and preload bundles built successfully.
- `npm run lint`: no errors; one existing Fast Refresh warning remains at `src/components/ui/button.tsx:58`.
- Local Markdown links in `README.md` resolve.
- No live Douyin account mutation was performed.
