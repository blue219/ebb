# Architecture

Ebb is an Electron application with one implemented platform module: Douyin. Platform-specific behavior is grouped by platform while application entry points and proven shared behavior remain separate. The directory shape allows another platform to be added without creating a generic adapter before one is needed.

## Runtime topology

```text
React renderer
  -> window.ebb.douyin preload bridge
  -> platform-namespaced Electron IPC
  -> DouyinTaskService in the main process
  -> detached, sandboxed WebContentsView
  -> Douyin web pages and private web API
```

- `src/main.tsx` mounts the React application.
- `src/App.tsx` selects the implemented platform workspace.
- `electron/main.ts` owns the application window and platform-module lifecycle.
- `electron/preload.ts` exposes the narrow `window.ebb` API.
- The Douyin platform module owns authentication checks and composes independent liked-video and following-account task modules through an injected `DouyinClient` interface.
- `ElectronDouyinClient` is the production adapter for that interface. Its detached `WebContentsView` supplies the signed-in browser context required by Douyin. It is not rendered as a general-purpose browser in the app window.

## Directory ownership

```text
shared/platforms/<platform>/      Cross-process contracts
electron/platforms/<platform>/    Main-process implementation and preload bridge
src/platforms/<platform>/         Renderer workspace and platform copy
electron/shared/                  Main-process behavior shared by platforms
src/shared/                       Renderer behavior shared by platforms
src/components/ui/                Reusable renderer UI primitives
tests/                            Cross-cutting renderer/shared tests
docs/                             Architecture, domain, and validation documentation
```

## Module rules

- Keep `electron/main.ts`, `electron/preload.ts`, and `src/App.tsx` as composition roots.
- Put platform-owned behavior, copy, security policy, and integration details under the matching `platforms/<platform>` directory.
- Put cross-process data and bridge interfaces in `shared/platforms/<platform>` so the main process, preload, and renderer use one contract.
- Keep external Douyin browser operations behind `DouyinClient`; task logic must not directly create Electron views, sessions, or requests.
- Move behavior into a runtime-specific `shared` directory only after it is platform-independent and reusable.
- Do not add an empty platform directory or a generic platform adapter before a second implementation exists.
- Preserve platform names in IPC channels and persisted session keys unless a compatibility migration is explicitly planned.

## State and task flow

The main process is authoritative for account, login, liked-video, following-account, and task snapshots. The renderer requests an initial snapshot through `douyin:get-state` and then subscribes to `douyin:account`, `douyin:login`, `douyin:status`, and `douyin:following:status` events.

Renderer commands use `douyin:*` request channels. The preload bridge is the only renderer access to those channels; the renderer does not import Electron APIs.

Removal modes map to the service as follows:

| UI scope | Service mode | Boundary |
| --- | --- | --- |
| Custom | `selected` | Video IDs supplied when the task starts. |
| Positive number | `limited` | Target count captured when the task starts. |
| All | `all` | Repeated first-page scans until Douyin returns no liked videos. |

Selected removal keeps the current page and buffers replacement rows. Limited and all removal restart pagination at the first page after each batch because removing earlier likes shifts later results forward. Pause and stop are cooperative: the worker checks task state between network requests, so an in-flight request may finish first.

Unfollow tasks use the same three scope boundaries with following-account IDs. The production adapter hides Douyin's 20-row following-list cursor priming. Automatic unfollow tasks restart at the first page because removing relationships shifts subsequent results forward. A shared mutation coordinator permits only one unlike or unfollow task at a time; a paused task retains ownership until it completes or stops.

## Persistence

- The Douyin browser session uses Electron partition `persist:ebb-douyin`. Cookies and site storage survive restarts.
- The renderer key `ebb:saved-douyin-session` is only a boolean hint used to avoid briefly opening the sign-in panel. It is not the source of truth for authentication.
- Signing out clears the persistent partition and the renderer hint.
- Video and following-account lists, selections, progress, and task results are held in memory and reset when the app exits.

Changing the partition name or renderer key is a session migration and must be planned as a compatibility change.

## Security boundaries

- Both the main window and Douyin workspace enable `contextIsolation` and `sandbox` and disable `nodeIntegration`.
- The preload bridge exposes typed operations rather than raw `ipcRenderer` access.
- The workspace denies new windows, restricts top-level navigation to Douyin hosts, and blocks unsafe subframe protocols.
- QR images must be bounded PNG, JPEG, or WebP data URLs before they reach the renderer.
- API calls execute inside the isolated workspace so Douyin receives the expected browser context and session cookies.

The integration depends on a private external API and must treat every response as untrusted. Keep payload parsing defensive and pause mutation work on rejected responses.

Douyin's documented [Open Platform following-list API](https://open.douyin.com/platform/resource/docs/openapi/account-management/get-subscriber-list/) requires OAuth scopes and an access token. That authorization model is separate from Ebb's local QR-code browser session, so the following-account module does not introduce OAuth or export credentials.

## Test topology

- Vitest Node tests exercise domain policy, response parsing, preload/IPC mapping, and `DouyinTaskService` through an in-memory `DouyinClient` adapter.
- Vitest jsdom tests exercise renderer behavior and the serializable login-surface detector through accessible user interactions.
- Playwright launches a separate Electron test entry that loads the production renderer and preload with in-memory IPC handlers. It blocks external HTTP(S) requests and uses a temporary user-data directory, so it cannot reach the real account partition.
- Live-account verification remains a manual release gate and is limited to one explicitly expendable like or one explicitly expendable following relationship per changed area.

## Build outputs

Vite builds the renderer to `dist/`. `vite-plugin-electron` builds the main process and preload to `dist-electron/`. These directories are generated and ignored by Git. The repository currently has no packaging or installer configuration.
