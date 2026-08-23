# Architecture

Ebb is an Electron application with Douyin and TikTok platform modules. Platform-specific browser behavior remains in platform adapters while task orchestration, cross-process contracts, mutation coordination, and renderer workflow behavior are shared through a platform interface.

## Runtime topology

```text
React renderer
  -> window.ebb.<platform> preload bridge
  -> platform-namespaced Electron IPC
  -> shared task modules in the main process
  -> Douyin or TikTok browser adapter
  -> hidden-window-hosted, sandboxed WebContentsView
  -> platform web pages and private web API
```

- `src/main.tsx` mounts the React application.
- `src/App.tsx` owns the platform switcher and selects the active workspace.
- `electron/main.ts` owns the application window and platform-module lifecycle.
- `electron/preload.ts` exposes the narrow `window.ebb` API.
- Shared task modules own account checks and liked-video, collected-video, and following-account task behavior through an injected `PlatformClient` interface.
- `ElectronDouyinClient` and `ElectronTikTokClient` are production adapters. Each owns an isolated persistent partition and a sandboxed `WebContentsView` hosted in a `show: false` window.
- Platform modules initialize lazily when their renderer workspace is first opened.

## Directory ownership

```text
shared/platforms/                Cross-process contracts and platform channel maps
electron/platforms/<platform>/    Main-process implementation and preload bridge
electron/shared/platforms/        Shared main-process task and bridge modules
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
- Keep external browser operations behind `PlatformClient`; task logic must not directly create Electron views, sessions, or requests.
- Move behavior into a runtime-specific `shared` directory only after it is platform-independent and reusable.
- Do not add an empty platform directory or a generic platform adapter before a second implementation exists.
- Preserve platform names in IPC channels and persisted session keys unless a compatibility migration is explicitly planned.

## State and task flow

The main process is authoritative for each platform's account, login, liked-video, collected-video, following-account, and task snapshots. Each renderer bridge uses its own `douyin:*` or `tiktok:*` channel namespace.

Renderer commands use `douyin:*` request channels. The preload bridge is the only renderer access to those channels; the renderer does not import Electron APIs.

Removal modes map to the service as follows:

| UI scope | Service mode | Boundary |
| --- | --- | --- |
| Custom | `selected` | Video IDs supplied when the task starts. |
| Positive number | `limited` | Target count captured when the task starts. |
| All | `all` | Repeated first-page scans until Douyin returns no liked videos. |

Selected removal keeps the current page and buffers replacement rows. Limited and all removal restart pagination at the first page after each batch because removing earlier likes shifts later results forward. Pause and stop are cooperative: the worker checks task state between network requests, so an in-flight request may finish first.

Collection-removal tasks use the same three scope boundaries with video IDs and restart at the first page because removing a collection shifts subsequent results forward. Unfollow tasks use the same boundaries with following-account IDs. Platform adapters hide cursor and response differences. One application-wide mutation coordinator permits only one unlike, uncollect, or unfollow task across both platforms; a paused task retains ownership until it completes or stops.

## Persistence

- The Douyin browser session uses Electron partition `persist:ebb-douyin`. Cookies and site storage survive restarts.
- The TikTok browser session uses Electron partition `persist:ebb-tiktok` and never shares storage with Douyin.
- The renderer key `ebb:saved-douyin-session` is only a boolean hint used to avoid briefly opening the sign-in panel. It is not the source of truth for authentication.
- TikTok uses the independent renderer hint `ebb:saved-tiktok-session` with the same non-authoritative semantics.
- Signing out clears the persistent partition and the renderer hint.
- Video and following-account lists, selections, progress, and task results are held in memory and reset when the app exits.

Changing the partition name or renderer key is a session migration and must be planned as a compatibility change.

## Security boundaries

- The main window and both platform workspaces enable `contextIsolation` and `sandbox` and disable `nodeIntegration`.
- The preload bridge exposes typed operations rather than raw `ipcRenderer` access.
- Each workspace denies new windows, restricts top-level navigation to its platform hosts, and blocks unsafe subframe protocols.
- QR images must be bounded PNG, JPEG, or WebP data URLs before they reach the renderer.
- Current-account probes use Electron's fetch bound to `persist:ebb-douyin`, so login-page navigation cannot strand authentication polling. List and mutation requests still execute inside the isolated workspace so Douyin receives the expected browser context and session cookies.

The integration depends on a private external API and must treat every response as untrusted. Keep payload parsing defensive and pause mutation work on rejected responses.

Official developer OAuth does not provide the private consumer-account mutations used by these workflows. Ebb therefore does not mix OAuth tokens with its local browser sessions. TikTok's unverified private contract and release gate are documented in [tiktok-web-contract.md](tiktok-web-contract.md).

## Test topology

- Vitest Node tests exercise domain policy, response parsing, preload/IPC mapping, and liked-video/collected-video/following task services through an in-memory `DouyinClient` adapter.
- Vitest jsdom tests exercise renderer behavior and the serializable login-surface detector through accessible user interactions.
- Playwright launches a separate Electron test entry that loads the production renderer and preload with in-memory IPC handlers. It blocks external HTTP(S) requests and uses a temporary user-data directory, so it cannot reach the real account partition.
- Live-account verification remains a manual release gate and is limited to one explicitly expendable like or one explicitly expendable following relationship per changed area.

## Build outputs

Vite builds the renderer to `dist/`. `vite-plugin-electron` builds the main process and preload to `dist-electron/`. These directories are generated and ignored by Git. The repository currently has no packaging or installer configuration.
