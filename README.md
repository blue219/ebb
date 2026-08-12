# Ebb

Desktop app for bulk-removing liked videos from Douyin.

## Requirements

- Node.js 22 LTS

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

`npm run dev` starts the Vite development server and Electron with hot reload. `npm run build` writes the renderer bundle to `dist/` and Electron main/preload bundles to `dist-electron/`.

## Stack

- Electron 43
- Vite 8
- React 19 and TypeScript 5.9
- Tailwind CSS 4.3
- shadcn/ui (Base UI, Nova style)
- liquid-glass-react

The renderer uses `@/` as an alias for `src/`. Native functionality must be exposed through the sandboxed preload bridge rather than enabling Node integration in the renderer.

## Using Ebb

1. Start Ebb. First-time and signed-out users see the sign-in panel immediately while Ebb retrieves a live QR code. Returning users restore their saved session silently; if that session is no longer valid, the panel opens automatically.
2. After your avatar and name appear, Ebb loads the first 10 liked videos automatically. Ebb starts loading the next page before you reach the bottom of the list.
3. The clear scope defaults to **All**. Open the amount field to choose **All**, **10**, **50**, or **100**, or enter any whole number up to the account's current Likes count. Presets above that count are disabled.
4. **All** clears the entire account. A number clears up to that limit while loading more pages only as needed. Checking a table row switches the scope to **Custom** and preserves the checks already shown by the previous scope. Choose **Reset** to return to **All**.
5. Review the exact number in **Clear N likes**, then confirm the task. The progress control pauses or continues an active task. When it reaches 100%, select it to return to the default **All** scope using the remaining Likes count.

Ebb loads liked videos in pages of 10 as you scroll and submits unlike requests through Douyin's web API inside an isolated, persistent session. During manual removal it buffers the next page and reveals one replacement whenever a video is removed. During limited and all-account removal it reloads from the first page after each batch because the remaining liked videos shift forward as earlier likes are removed. Task scope and target count are frozen when removal starts. It does not read, export, or store passwords. Electron stores the session cookies locally and retains the sign-in until **Sign out** is selected; the video list and task results exist only for the current app run.

Date scopes are not offered because the available liked-video response does not provide a stable per-item timestamp for when the signed-in person liked each video. Video publication time is not used as a substitute.

Douyin can change its private web API, require request signatures, or request verification. Ebb pauses immediately when an API response is rejected. Complete any requested verification in the embedded Douyin panel, then select **Continue**. Start with a small selection on your own account: removing a like changes the account data and cannot be undone by Ebb.
