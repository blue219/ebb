# Ebb

Ebb is a development-stage Electron app for reviewing and bulk-removing liked videos from Douyin. The repository is organized to support additional platforms, but the current implementation is Douyin-only.

> Removing a like changes the signed-in account and cannot be undone by Ebb. Start with a small manual selection and verify the result in Douyin before using a larger scope.

## Current status

- Sign in to Douyin by QR code and restore that session on the same device.
- Load liked videos in pages of 10.
- Remove an explicit manual selection, a fixed numeric limit, or all likes returned until the account is empty.
- Pause, continue, or stop a removal task between API requests.
- Use the interface in English or Chinese.

TikTok support and distributable installers are not implemented yet. `npm run build` produces application bundles, not an installer.

## Development baseline

- Node.js 22 LTS (npm is included with Node.js). `package.json` and `.nvmrc` record this baseline.
- Network access to Douyin.
- A Douyin account and the Douyin mobile app for QR-code sign-in.

## Run locally

```bash
npm ci
npm run dev
```

`npm run dev` starts Vite and launches Electron with hot reload. Ebb uses the real signed-in Douyin account; there is no mocked API mode.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the renderer development server and Electron app. |
| `npm test` | Run deterministic Node and renderer tests with Vitest. |
| `npm run test:watch` | Re-run relevant Vitest tests while developing. |
| `npm run test:coverage` | Run deterministic tests and enforce coverage thresholds for critical modules. |
| `npm run test:typecheck` | Type-check test code and test-only configuration. |
| `npm run test:e2e` | Build and run the isolated, offline Electron smoke suite. |
| `npm run lint` | Lint the source with oxlint. |
| `npm run build` | Type-check and write renderer output to `dist/` and Electron output to `dist-electron/`. |
| `npm run verify` | Run coverage, test type-checking, lint, build, and offline Electron smoke tests. |
| `npm run preview` | Start Vite's renderer preview server. It has no Electron preload bridge, so the Ebb interface is not operable; use `npm run dev` for the app. |

## Use Ebb

1. Start Ebb. Signed-out users see the QR-code panel. Returning users restore the locally saved session; if it is no longer valid, Ebb asks them to sign in again.
2. After the account name appears, Ebb loads the first 10 liked videos. Scroll toward the bottom of the table to load another page.
3. Choose a clear scope. The default is **All**; the menu also offers **10**, **50**, **100**, or any positive whole number up to the displayed Likes count. Clicking a row switches to **Custom** and keeps the other rows selected by the previous scope.
4. Review **Clear N likes**, confirm the task, and use the progress control to pause or continue. **Stop** ends the current task without processing the remaining items.
5. After a completed task, select the completed progress control or **Reset** to return to the default **All** scope.

The modes have different boundaries:

- **Custom** freezes the selected video IDs when the task starts.
- A numeric limit freezes the target count when the task starts and loads only as many pages as needed.
- **All** does not freeze a list of video IDs. It reloads from the first page after each batch and continues until Douyin returns no likes. Do not add new likes while an **All** task is running.

Date-based scopes are intentionally unavailable because the current integration has not observed a stable timestamp for when the signed-in person liked each video. A video's publication time is not a substitute.

## Data and external-service behavior

Ebb makes requests to Douyin's private web API from a sandboxed, isolated Electron session. Electron persists that session's cookies and site storage locally under the `persist:ebb-douyin` partition so sign-in can survive an app restart. **Sign out** clears the partition. The renderer also stores a boolean sign-in hint; it contains no credentials. Video rows and task results remain in memory only for the current app run.

Ebb does not ask for or store a password, and it does not export cookies. It displays the QR image returned by Douyin and uses the resulting session only for account details, liked-video pages, and unlike requests.

Douyin can change its private API, require request signatures, rate-limit requests, or require verification. Ebb pauses when an unlike request is rejected. Ebb does not currently expose a general-purpose browser for interactive security challenges. If Douyin requests one, stop the task, sign out, sign in again with a refreshed QR code, and retry a small scope. Do not repeatedly retry a rate-limited account. A pause or stop takes effect after any request already in flight finishes.

## Project documentation

- [Architecture](docs/architecture.md): process boundaries, module ownership, IPC, persistence, and security controls.
- [Domain language](docs/CONTEXT.md): canonical clear-scope and task terminology.
- [Testing](docs/testing.md): automated checks and the destructive real-account smoke test.

## Stack

- Electron 43
- Vite 8
- React 19 and TypeScript 5.9
- Tailwind CSS 4.3
- shadcn/ui (Base UI, Nova style)
- liquid-glass-react (installed for the intended visual system but not currently imported by the renderer)

The current glass styling is implemented in `src/index.css`. The renderer uses `@/` as an alias for `src/`. Native functionality must be exposed through the sandboxed preload bridge; do not enable Node.js integration in the renderer. The Electron smoke fixture uses a temporary user-data directory and in-memory IPC responses; it never loads Douyin or the persistent account partition.
