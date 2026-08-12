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
2. After your avatar and name appear, Ebb loads the first 10 liked videos automatically. Scroll down to load the next page.
3. Choose **Auto-remove all** to remove every liked video without selecting rows. After one confirmation, Ebb removes the current batch, loads the next available batch, and continues until no likes remain. The progress control uses the account's total liked-video count and toggles pause or continue. You can still search and select rows for a smaller manual task.

Ebb loads liked videos in pages of 10 as you scroll and submits unlike requests through Douyin's web API inside an isolated, persistent session. During automatic removal it reloads from the first page after each batch because the remaining liked videos shift forward as earlier likes are removed. It does not read, export, or store passwords. Electron stores the session cookies locally and retains the sign-in until **Sign out** is selected; the video list and task results exist only for the current app run.

Douyin can change its private web API, require request signatures, or request verification. Ebb pauses immediately when an API response is rejected. Complete any requested verification in the embedded Douyin panel, then select **Continue**. Start with a small selection on your own account: removing a like changes the account data and cannot be undone by Ebb.
